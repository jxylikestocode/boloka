#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
};
use std::vec::Vec as StdVec;

struct Setup<'a> {
    env: Env,
    pool: PoolClient<'a>,
    token: TokenClient<'a>,
    blend: mock_blend::MockBlendClient<'a>,
    admin: Address,
    user: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(issuer).address();
    let blend = mock_blend::MockBlendClient::new(&env, &env.register(mock_blend::MockBlend, ()));
    blend.setup(&token_id, &B_RATE_SCALAR);

    let admin = Address::generate(&env);
    let pool = PoolClient::new(&env, &env.register(Pool, ()));
    pool.init(&token_id, &blend.address, &admin, &5000);

    let user = Address::generate(&env);
    StellarAssetClient::new(&env, &token_id).mint(&user, &1000);

    Setup {
        token: TokenClient::new(&env, &token_id),
        env,
        pool,
        blend,
        admin,
        user,
    }
}

fn leaf(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

fn sha256_pair(env: &Env, left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut buf = [0u8; 64];
    buf[..32].copy_from_slice(left);
    buf[32..].copy_from_slice(right);
    env.crypto()
        .sha256(&Bytes::from_array(env, &buf))
        .to_array()
}

/// Sibling path for `index` in the depth-20 zero-padded tree over `leaves`,
/// built independently of the contract's root computation.
fn merkle_path(env: &Env, leaves: &[BytesN<32>], index: u32) -> Vec<BytesN<32>> {
    let mut level: StdVec<[u8; 32]> = leaves.iter().map(|l| l.to_array()).collect();
    let mut zero = [0u8; 32];
    let mut idx = index as usize;
    let mut path = Vec::new(env);
    for _ in 0..DEPTH {
        let sibling = level.get(idx ^ 1).copied().unwrap_or(zero);
        path.push_back(BytesN::from_array(env, &sibling));
        level = level
            .chunks(2)
            .map(|pair| sha256_pair(env, &pair[0], pair.get(1).unwrap_or(&zero)))
            .collect();
        zero = sha256_pair(env, &zero, &zero);
        idx >>= 1;
    }
    path
}

#[test]
fn deposit_then_withdraw_succeeds() {
    let s = setup();
    let leaves = [leaf(&s.env, 1), leaf(&s.env, 2), leaf(&s.env, 3)];
    for l in &leaves {
        s.pool.deposit(&s.user, l, &100);
    }
    assert_eq!(s.token.balance(&s.user), 700);
    assert_eq!(s.token.balance(&s.pool.address), 300);

    // Index 1 is a right child, index 2 has a zero-padded sibling.
    let recipient = Address::generate(&s.env);
    for (n, index) in [(10u8, 1u32), (11, 2)] {
        let l = &leaves[index as usize];
        let path = merkle_path(&s.env, &leaves, index);
        assert!(s.pool.verify(l, &path, &index));
        s.pool
            .withdraw(&leaf(&s.env, n), l, &path, &index, &recipient, &100);
    }

    assert_eq!(s.token.balance(&recipient), 200);
    assert_eq!(s.token.balance(&s.pool.address), 100);
}

#[test]
fn same_nullifier_twice_fails() {
    let s = setup();
    let leaves = [leaf(&s.env, 1), leaf(&s.env, 2)];
    for l in &leaves {
        s.pool.deposit(&s.user, l, &100);
    }

    let nullifier = leaf(&s.env, 10);
    let recipient = Address::generate(&s.env);
    let path = merkle_path(&s.env, &leaves, 0);
    s.pool
        .withdraw(&nullifier, &leaves[0], &path, &0, &recipient, &100);

    // Reusing the nullifier fails, even with a different valid leaf.
    assert_eq!(
        s.pool
            .try_withdraw(&nullifier, &leaves[0], &path, &0, &recipient, &100),
        Err(Ok(Error::NullifierUsed))
    );
    let path = merkle_path(&s.env, &leaves, 1);
    assert_eq!(
        s.pool
            .try_withdraw(&nullifier, &leaves[1], &path, &1, &recipient, &100),
        Err(Ok(Error::NullifierUsed))
    );

    assert_eq!(s.token.balance(&recipient), 100);
    assert_eq!(s.token.balance(&s.pool.address), 100);
}

#[test]
fn wrong_path_fails() {
    let s = setup();
    let leaves = [leaf(&s.env, 1), leaf(&s.env, 2)];
    for l in &leaves {
        s.pool.deposit(&s.user, l, &100);
    }

    let nullifier = leaf(&s.env, 10);
    let recipient = Address::generate(&s.env);
    let good = merkle_path(&s.env, &leaves, 0);

    // One sibling tampered with.
    let mut tampered = good.clone();
    tampered.set(5, leaf(&s.env, 0xff));
    // A valid path, but for a different index.
    let other = merkle_path(&s.env, &leaves, 1);
    // A path of the wrong length.
    let mut short = good.clone();
    short.pop_back();

    for path in [tampered, other, short] {
        assert!(!s.pool.verify(&leaves[0], &path, &0));
        assert_eq!(
            s.pool
                .try_withdraw(&nullifier, &leaves[0], &path, &0, &recipient, &100),
            Err(Ok(Error::InvalidProof))
        );
    }
    // The right path with the wrong index, and a leaf that was never deposited.
    assert!(!s.pool.verify(&leaves[0], &good, &1));
    assert!(!s.pool.verify(&leaf(&s.env, 9), &good, &0));

    assert_eq!(s.token.balance(&recipient), 0);
    assert_eq!(s.token.balance(&s.pool.address), 200);

    // The failed attempts did not burn the nullifier.
    s.pool
        .withdraw(&nullifier, &leaves[0], &good, &0, &recipient, &100);
    assert_eq!(s.token.balance(&recipient), 100);
}

/// Stand-in for the Blend v2 lending pool: the same submit / get_positions /
/// get_reserve interface and types (generated from the real wasm), one reserve
/// at index 3, collateral kept in bTokens at a settable b_rate.
mod mock_blend {
    use super::blend::{Positions, Request, Reserve, ReserveConfig, ReserveData};
    use super::{B_RATE_SCALAR, SUPPLY_COLLATERAL, WITHDRAW_COLLATERAL};
    use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Map, Vec};

    const INDEX: u32 = 3;

    #[contracttype]
    enum Key {
        Token,
        BRate,
        Collateral(Address),
    }

    #[contract]
    pub struct MockBlend;

    #[contractimpl]
    impl MockBlend {
        pub fn setup(env: Env, token: Address, b_rate: i128) {
            env.storage().instance().set(&Key::Token, &token);
            env.storage().instance().set(&Key::BRate, &b_rate);
        }

        /// Simulates interest accruing.
        pub fn set_b_rate(env: Env, b_rate: i128) {
            env.storage().instance().set(&Key::BRate, &b_rate);
        }

        pub fn get_reserve(env: Env, asset: Address) -> Reserve {
            Reserve {
                asset,
                config: ReserveConfig {
                    c_factor: 0,
                    decimals: 7,
                    enabled: true,
                    index: INDEX,
                    l_factor: 0,
                    max_util: 0,
                    r_base: 0,
                    r_one: 0,
                    r_three: 0,
                    r_two: 0,
                    reactivity: 0,
                    supply_cap: i128::MAX,
                    util: 0,
                },
                data: ReserveData {
                    b_rate: b_rate(&env),
                    b_supply: 0,
                    backstop_credit: 0,
                    d_rate: B_RATE_SCALAR,
                    d_supply: 0,
                    ir_mod: 0,
                    last_time: 0,
                },
                scalar: 10_000_000,
            }
        }

        pub fn get_positions(env: Env, address: Address) -> Positions {
            let mut collateral = Map::new(&env);
            let b = collateral_of(&env, &address);
            if b > 0 {
                collateral.set(INDEX, b);
            }
            Positions {
                collateral,
                liabilities: Map::new(&env),
                supply: Map::new(&env),
            }
        }

        /// Mirrors Blend v2: from (and spender, if different) must authorize,
        /// supplies are pulled with token.transfer(spender -> pool), and a
        /// withdrawal larger than the position withdraws all of it.
        pub fn submit(
            env: Env,
            from: Address,
            spender: Address,
            to: Address,
            requests: Vec<Request>,
        ) -> Positions {
            from.require_auth();
            if spender != from {
                spender.require_auth();
            }
            let me = env.current_contract_address();
            let token: Address = env.storage().instance().get(&Key::Token).unwrap();
            let client = token::TokenClient::new(&env, &token);
            let rate = b_rate(&env);
            let mut b = collateral_of(&env, &from);
            for r in requests.iter() {
                match r.request_type {
                    SUPPLY_COLLATERAL => {
                        client.transfer(&spender, &me, &r.amount);
                        b += r.amount * B_RATE_SCALAR / rate;
                    }
                    WITHDRAW_COLLATERAL => {
                        let mut burn = (r.amount * B_RATE_SCALAR + rate - 1) / rate;
                        let mut out = r.amount;
                        if burn > b {
                            burn = b;
                            out = b * rate / B_RATE_SCALAR;
                        }
                        b -= burn;
                        client.transfer(&me, &to, &out);
                    }
                    _ => panic!("unsupported request type"),
                }
            }
            env.storage().persistent().set(&Key::Collateral(from.clone()), &b);
            Self::get_positions(env, from)
        }
    }

    fn b_rate(env: &Env) -> i128 {
        env.storage().instance().get(&Key::BRate).unwrap()
    }

    fn collateral_of(env: &Env, a: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&Key::Collateral(a.clone()))
            .unwrap_or(0)
    }
}

/// Deposits 600 and 400 (two leaves) and returns them.
fn fund(s: &Setup) -> [BytesN<32>; 2] {
    let leaves = [leaf(&s.env, 1), leaf(&s.env, 2)];
    s.pool.deposit(&s.user, &leaves[0], &600);
    s.pool.deposit(&s.user, &leaves[1], &400);
    leaves
}

#[test]
fn supply_to_blend_respects_cap_and_counts_in_total_assets() {
    let s = setup();
    fund(&s);

    s.pool.supply_to_blend(&500);
    assert_eq!(s.token.balance(&s.pool.address), 500);
    assert_eq!(s.token.balance(&s.blend.address), 500);
    assert_eq!(s.pool.total_assets(), 1000);

    // 50% cap: 501 of 1000 lent would exceed it.
    assert_eq!(s.pool.try_supply_to_blend(&1), Err(Ok(Error::OverCap)));
    assert_eq!(s.pool.try_supply_to_blend(&0), Err(Ok(Error::InvalidAmount)));
}

#[test]
fn supply_to_blend_needs_only_the_admin_signature() {
    use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
    let s = setup();
    fund(&s);

    // Only the admin's authorization for supply_to_blend is provided; the
    // token transfer Blend makes from the contract must be covered by the
    // contract's own authorize_as_current_contract.
    s.env.mock_auths(&[MockAuth {
        address: &s.admin,
        invoke: &MockAuthInvoke {
            contract: &s.pool.address,
            fn_name: "supply_to_blend",
            args: (300_i128,).into_val(&s.env),
            sub_invokes: &[],
        },
    }]);
    s.pool.supply_to_blend(&300);
    assert_eq!(s.token.balance(&s.blend.address), 300);

    // Without the admin's signature it fails.
    s.env.mock_auths(&[]);
    assert!(s.pool.try_supply_to_blend(&100).is_err());
    assert!(s.pool.try_withdraw_from_blend(&100).is_err());
}

#[test]
fn interest_shows_in_total_assets() {
    let s = setup();
    fund(&s);
    s.pool.supply_to_blend(&500);

    // b_rate up 10%: the 500 lent is now worth 550.
    s.blend.set_b_rate(&(B_RATE_SCALAR * 11 / 10));
    StellarAssetClient::new(&s.env, &s.token.address).mint(&s.blend.address, &50);
    assert_eq!(s.pool.total_assets(), 1050);

    // Recalling more than the position returns all of it, interest included.
    s.pool.withdraw_from_blend(&10_000);
    assert_eq!(s.token.balance(&s.pool.address), 1050);
    assert_eq!(s.pool.total_assets(), 1050);
}

#[test]
fn withdraw_pulls_the_shortfall_from_blend() {
    let s = setup();
    let leaves = fund(&s);
    s.pool.supply_to_blend(&500);

    let recipient = Address::generate(&s.env);
    let path = merkle_path(&s.env, &leaves, 0);
    s.pool
        .withdraw(&leaf(&s.env, 10), &leaves[0], &path, &0, &recipient, &800);

    assert_eq!(s.token.balance(&recipient), 800);
    assert_eq!(s.token.balance(&s.pool.address), 0);
    assert_eq!(s.token.balance(&s.blend.address), 200);
    assert_eq!(s.pool.total_assets(), 200);

    // More than everything the pool has, liquid and lent, fails cleanly.
    let path = merkle_path(&s.env, &leaves, 1);
    assert_eq!(
        s.pool
            .try_withdraw(&leaf(&s.env, 11), &leaves[1], &path, &1, &recipient, &201),
        Err(Ok(Error::InsufficientLiquidity))
    );
}

#[test]
fn init_rejects_a_cap_over_100_percent() {
    let env = Env::default();
    let pool = PoolClient::new(&env, &env.register(Pool, ()));
    let a = Address::generate(&env);
    assert_eq!(
        pool.try_init(&a, &a, &a, &10_001),
        Err(Ok(Error::InvalidCap))
    );
}
