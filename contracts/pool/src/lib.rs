#![no_std]
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contracterror, contractimpl, contracttype, token, vec, Address, Bytes, BytesN,
    Env, IntoVal, Symbol, Vec,
};

/// Client and types for the Blend v2 lending pool, generated from the wasm
/// deployed on testnet (blend-capital/blend-contracts-v2, sha256 a41fc53d…).
/// blend-contract-sdk needs soroban-sdk ^25, so it is imported this way.
mod blend {
    soroban_sdk::contractimport!(file = "blend/pool.wasm");
}

/// Depth of the Merkle tree: 2^20 leaf slots.
const DEPTH: u32 = 20;
/// Blend v2 request types (pool/src/pool/actions.rs).
const SUPPLY_COLLATERAL: u32 = 2;
const WITHDRAW_COLLATERAL: u32 = 3;
/// Blend v2 scales b_rate by 1e12 (pool/src/constants.rs SCALAR_12).
const B_RATE_SCALAR: i128 = 1_000_000_000_000;
const MAX_BPS: u32 = 10_000;

#[contracttype]
enum DataKey {
    Token,
    Root,
    Leaves,
    Nullifier(BytesN<32>),
    BlendPool,
    Admin,
    /// Most of total_assets() that may be lent to Blend, in basis points.
    MaxBps,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    TreeFull = 3,
    InvalidProof = 4,
    NullifierUsed = 5,
    InvalidAmount = 6,
    InvalidCap = 7,
    OverCap = 8,
    InsufficientLiquidity = 9,
}

#[contract]
pub struct Pool;

#[contractimpl]
impl Pool {
    /// `blend_pool` is the Blend lending pool idle funds are supplied to,
    /// `admin` may move funds to and from it, and at most `max_bps` / 10,000
    /// of total_assets() may be lent at a time.
    pub fn init(
        env: Env,
        token: Address,
        blend_pool: Address,
        admin: Address,
        max_bps: u32,
    ) -> Result<(), Error> {
        let s = env.storage().instance();
        if s.has(&DataKey::Token) {
            return Err(Error::AlreadyInitialized);
        }
        if max_bps > MAX_BPS {
            return Err(Error::InvalidCap);
        }
        s.set(&DataKey::Token, &token);
        s.set(&DataKey::BlendPool, &blend_pool);
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::MaxBps, &max_bps);
        Ok(())
    }

    /// Transfers `amount` of the pool token from `from` to the contract and
    /// appends `commitment` as the next leaf of the Merkle tree.
    pub fn deposit(
        env: Env,
        from: Address,
        commitment: BytesN<32>,
        amount: i128,
    ) -> Result<(), Error> {
        from.require_auth();
        let token = token(&env)?;

        let mut leaves = leaves(&env);
        if leaves.len() >= 1 << DEPTH {
            return Err(Error::TreeFull);
        }

        token::TokenClient::new(&env, &token).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );

        leaves.push_back(commitment);
        env.storage()
            .instance()
            .set(&DataKey::Root, &compute_root(&env, &leaves));
        env.storage().persistent().set(&DataKey::Leaves, &leaves);
        Ok(())
    }

    /// Pays `amount` to `to` if `leaf` is in the tree and `nullifier` is
    /// unused. If the contract holds less than `amount`, the shortfall is first
    /// withdrawn from Blend.
    pub fn withdraw(
        env: Env,
        nullifier: BytesN<32>,
        leaf: BytesN<32>,
        path: Vec<BytesN<32>>,
        index: u32,
        to: Address,
        amount: i128,
    ) -> Result<(), Error> {
        let token = token(&env)?;

        if !Self::verify(env.clone(), leaf, path, index) {
            return Err(Error::InvalidProof);
        }

        let key = DataKey::Nullifier(nullifier);
        if env.storage().persistent().has(&key) {
            return Err(Error::NullifierUsed);
        }
        env.storage().persistent().set(&key, &());

        let me = env.current_contract_address();
        let client = token::TokenClient::new(&env, &token);
        let liquid = client.balance(&me);
        if liquid < amount {
            withdraw_collateral(&env, &token, amount - liquid)?;
            if client.balance(&me) < amount {
                return Err(Error::InsufficientLiquidity);
            }
        }

        client.transfer(&me, &to, &amount);
        Ok(())
    }

    /// Returns true if `leaf` is the deposited leaf at `index`, proven by
    /// `path` (the 20 sibling hashes, leaf level first) against the stored root.
    pub fn verify(env: Env, leaf: BytesN<32>, path: Vec<BytesN<32>>, index: u32) -> bool {
        let Some(root) = env
            .storage()
            .instance()
            .get::<_, BytesN<32>>(&DataKey::Root)
        else {
            return false;
        };
        // Slots past the last deposit hold zero padding, not members.
        if path.len() != DEPTH || index >= leaves(&env).len() {
            return false;
        }

        let mut node = leaf;
        let mut idx = index;
        for sibling in path.iter() {
            node = if idx & 1 == 0 {
                hash_pair(&env, &node, &sibling)
            } else {
                hash_pair(&env, &sibling, &node)
            };
            idx >>= 1;
        }
        node == root
    }

    /// Admin only: supplies `amount` of the contract's idle tokens to Blend as
    /// collateral, provided the amount lent stays within the cap.
    pub fn supply_to_blend(env: Env, amount: i128) -> Result<(), Error> {
        admin(&env)?.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let token = token(&env)?;
        let (liquid, lent) = balances(&env, &token)?;
        if amount > liquid {
            return Err(Error::InsufficientLiquidity);
        }
        let max_bps: u32 = env.storage().instance().get(&DataKey::MaxBps).unwrap();
        // Supplying moves value from liquid to lent, so the total is unchanged.
        if (lent + amount) * MAX_BPS as i128 > (liquid + lent) * max_bps as i128 {
            return Err(Error::OverCap);
        }

        let pool = blend_pool(&env)?;
        let me = env.current_contract_address();
        // Blend pulls the tokens with token.transfer(spender = this contract),
        // a call this contract does not make directly, so authorize it here.
        env.authorize_as_current_contract(vec![
            &env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: token.clone(),
                    fn_name: Symbol::new(&env, "transfer"),
                    args: (me.clone(), pool.clone(), amount).into_val(&env),
                },
                sub_invocations: vec![&env],
            }),
        ]);
        blend::Client::new(&env, &pool).submit(
            &me,
            &me,
            &me,
            &vec![
                &env,
                blend::Request {
                    address: token,
                    amount,
                    request_type: SUPPLY_COLLATERAL,
                },
            ],
        );
        Ok(())
    }

    /// Admin only: withdraws `amount` (or the whole position, if less) from
    /// Blend back to the contract.
    pub fn withdraw_from_blend(env: Env, amount: i128) -> Result<(), Error> {
        admin(&env)?.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        withdraw_collateral(&env, &token(&env)?, amount)
    }

    /// Idle tokens held by the contract plus its Blend position, valued at the
    /// reserve's current b_rate.
    pub fn total_assets(env: Env) -> Result<i128, Error> {
        let (liquid, lent) = balances(&env, &token(&env)?)?;
        Ok(liquid + lent)
    }
}

fn token(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Token)
        .ok_or(Error::NotInitialized)
}

fn blend_pool(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::BlendPool)
        .ok_or(Error::NotInitialized)
}

fn admin(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)
}

/// (idle tokens held by the contract, value of its Blend collateral)
fn balances(env: &Env, token: &Address) -> Result<(i128, i128), Error> {
    let me = env.current_contract_address();
    let liquid = token::TokenClient::new(env, token).balance(&me);
    let pool = blend::Client::new(env, &blend_pool(env)?);
    let reserve = pool.get_reserve(token);
    let b_tokens = pool
        .get_positions(&me)
        .collateral
        .get(reserve.config.index)
        .unwrap_or(0);
    // Blend's own conversion: floor(b_tokens * b_rate / 1e12).
    Ok((liquid, b_tokens * reserve.data.b_rate / B_RATE_SCALAR))
}

fn withdraw_collateral(env: &Env, token: &Address, amount: i128) -> Result<(), Error> {
    let me = env.current_contract_address();
    blend::Client::new(env, &blend_pool(env)?).submit(
        &me,
        &me,
        &me,
        &vec![
            env,
            blend::Request {
                address: token.clone(),
                amount,
                request_type: WITHDRAW_COLLATERAL,
            },
        ],
    );
    Ok(())
}

fn leaves(env: &Env) -> Vec<BytesN<32>> {
    env.storage()
        .persistent()
        .get(&DataKey::Leaves)
        .unwrap_or_else(|| Vec::new(env))
}

/// SHA-256(left || right).
fn hash_pair(env: &Env, left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
    let mut buf = [0u8; 64];
    buf[..32].copy_from_slice(&left.to_array());
    buf[32..].copy_from_slice(&right.to_array());
    env.crypto().sha256(&Bytes::from_array(env, &buf)).to_bytes()
}

/// Root of the depth-20 tree over `leaves`. Empty slots are padded with zero
/// hashes: an all-zero leaf at level 0, and SHA-256(z || z) of the level below
/// at each level above.
fn compute_root(env: &Env, leaves: &Vec<BytesN<32>>) -> BytesN<32> {
    let mut level = leaves.clone();
    let mut zero = BytesN::from_array(env, &[0u8; 32]);
    for _ in 0..DEPTH {
        let mut next = Vec::new(env);
        let mut i = 0;
        while i < level.len() {
            let left = level.get_unchecked(i);
            let right = if i + 1 < level.len() {
                level.get_unchecked(i + 1)
            } else {
                zero.clone()
            };
            next.push_back(hash_pair(env, &left, &right));
            i += 2;
        }
        zero = hash_pair(env, &zero, &zero);
        level = next;
    }
    level.get(0).unwrap_or(zero)
}

mod test;
