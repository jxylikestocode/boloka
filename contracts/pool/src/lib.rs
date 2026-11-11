#![no_std]
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contracterror, contractevent, contractimpl, contracttype, crypto::bn254::Bn254Fr,
    token, vec, xdr::ToXdr, Address, Bytes, BytesN, Env, IntoVal, Symbol, Vec, U256,
};

mod groth16;
mod poseidon;
mod poseidon_params;
pub use groth16::{Proof, VerificationKey};
use poseidon::Poseidon;

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
/// How many past note-tree roots a spend proof may be built against: a
/// deposit landing while a proof is being made must not invalidate it.
const ROOT_HISTORY: u32 = 32;
/// Longest encrypted memo stored with a note (ciphertext of amount + blinding).
const MEMO_MAX: u32 = 256;
/// Note amounts are 64-bit in the circuit.
const MAX_NOTE_AMOUNT: i128 = 1 << 64;
/// Persistent note data lives at least this long (ledgers) past each touch.
const TTL_THRESHOLD: u32 = 518_400;
const TTL_EXTEND: u32 = 3_110_400;

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
    // The note tree (Poseidon, zero-knowledge spends); the keys above are the
    // original SHA-256 tree, left as they were.
    /// Groth16 verification key of the spend circuit.
    Vk,
    /// Zero hashes per level, leaf level first (DEPTH + 1 entries).
    NoteZeros,
    /// Left-child hash waiting for its sibling at each level (incremental insert).
    NoteFilled,
    /// Ring of the last ROOT_HISTORY roots; NoteRootAt is the latest's slot.
    NoteRoots,
    NoteRootAt,
    NoteCount,
    /// Every note commitment in order (persistent), so clients can build paths.
    NoteLeaves,
    /// A note by leaf index: commitment, encrypted memo, time (persistent).
    Note(u32),
    /// A spent note's nullifier (persistent).
    Spent(BytesN<32>),
}

/// Emitted for every note added to the tree.
#[contractevent]
pub struct NoteAdded {
    #[topic]
    pub index: u32,
    pub commitment: BytesN<32>,
}

/// A leaf of the note tree, as stored for clients to scan.
#[contracttype]
#[derive(Clone)]
pub struct Note {
    pub commitment: BytesN<32>,
    /// Encrypted to the owner: amount and blinding (see app/src/notes.ts).
    pub memo: Bytes,
    /// Ledger timestamp when it was added.
    pub at: u64,
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
    /// No verification key set: set_verifier first.
    NoVerifier = 10,
    /// The proof's root is not a recent root of the note tree.
    UnknownRoot = 11,
    /// A commitment or nullifier is not a canonical field element.
    NotAField = 12,
    /// Wrong number of nullifiers, commitments or memos, or a memo too long.
    BadArguments = 13,
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

        pay(&env, &token, &to, amount)
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

    // ----- Notes: the Poseidon tree and zero-knowledge spends -----
    //
    // A note is Poseidon(amount, pk, blinding), owned by whoever knows the
    // secret behind pk. Spending (a payout, or a transfer to another owner
    // inside the pool) proves ownership, membership and conservation of value
    // in zero knowledge (circuits/spend.circom): the chain sees two
    // nullifiers and two new commitments, never which notes were spent, who
    // the new owner is or, for a transfer, how much.

    /// Admin only: sets the Groth16 verification key of the spend circuit.
    /// Spends are refused until it is set.
    pub fn set_verifier(env: Env, vk: VerificationKey) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Vk, &vk);
        Ok(())
    }

    /// Admin only: replaces this contract's code, keeping its storage.
    pub fn upgrade(env: Env, wasm_hash: BytesN<32>) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.deployer().update_current_contract_wasm(wasm_hash);
        Ok(())
    }

    /// Transfers `amount` of the pool token from `from` and adds the note
    /// `commitment` (Poseidon(amount, owner pk, blinding)) to the note tree,
    /// with `memo` (the amount and blinding, encrypted to the owner) for the
    /// owner's app to find. Returns the note's leaf index.
    pub fn deposit_note(
        env: Env,
        from: Address,
        commitment: BytesN<32>,
        amount: i128,
        memo: Bytes,
    ) -> Result<u32, Error> {
        from.require_auth();
        let token = token(&env)?;
        if amount <= 0 || amount >= MAX_NOTE_AMOUNT {
            return Err(Error::InvalidAmount);
        }
        if !poseidon::is_field(&commitment) {
            return Err(Error::NotAField);
        }
        if memo.len() > MEMO_MAX {
            return Err(Error::BadArguments);
        }
        token::TokenClient::new(&env, &token).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );
        insert_notes(&env, &Poseidon::t3(&env), &[(commitment, memo)])
    }

    /// Spends up to two notes and adds two new ones, by zero-knowledge proof
    /// over the public signals (root, amount, hash of `to`, the nullifiers,
    /// the new commitments). `amount` is paid to `to` out of the pool: 0 for
    /// a transfer inside it. Each new note carries a memo encrypted to its
    /// owner. Returns the leaf index of the first new note.
    pub fn spend(
        env: Env,
        proof: Proof,
        root: BytesN<32>,
        nullifiers: Vec<BytesN<32>>,
        commitments: Vec<BytesN<32>>,
        memos: Vec<Bytes>,
        amount: i128,
        to: Address,
    ) -> Result<u32, Error> {
        let token = token(&env)?;
        let vk: VerificationKey = env
            .storage()
            .instance()
            .get(&DataKey::Vk)
            .ok_or(Error::NoVerifier)?;
        if nullifiers.len() != 2 || commitments.len() != 2 || memos.len() != 2 {
            return Err(Error::BadArguments);
        }
        if memos.iter().any(|m| m.len() > MEMO_MAX) {
            return Err(Error::BadArguments);
        }
        if amount < 0 || amount >= MAX_NOTE_AMOUNT {
            return Err(Error::InvalidAmount);
        }
        if nullifiers.iter().chain(commitments.iter()).any(|b| !poseidon::is_field(&b)) {
            return Err(Error::NotAField);
        }
        if !known_root(&env, &root) {
            return Err(Error::UnknownRoot);
        }
        if nullifiers.get_unchecked(0) == nullifiers.get_unchecked(1) {
            return Err(Error::NullifierUsed);
        }
        for n in nullifiers.iter() {
            if env.storage().persistent().has(&DataKey::Spent(n)) {
                return Err(Error::NullifierUsed);
            }
        }

        // The public signals, in the circuit's order.
        let mut signals = Vec::new(&env);
        signals.push_back(fr(&env, &root));
        signals.push_back(Bn254Fr::from_u256(U256::from_u128(&env, amount as u128)));
        signals.push_back(Bn254Fr::from_u256(recipient_hash(&env, &to)));
        for n in nullifiers.iter() {
            signals.push_back(fr(&env, &n));
        }
        for c in commitments.iter() {
            signals.push_back(fr(&env, &c));
        }
        if !groth16::verify(&env, &vk, &proof, &signals) {
            return Err(Error::InvalidProof);
        }

        for n in nullifiers.iter() {
            let key = DataKey::Spent(n);
            env.storage().persistent().set(&key, &());
            env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        }
        let index = insert_notes(
            &env,
            &Poseidon::t3(&env),
            &[
                (commitments.get_unchecked(0), memos.get_unchecked(0)),
                (commitments.get_unchecked(1), memos.get_unchecked(1)),
            ],
        )?;
        if amount > 0 {
            pay(&env, &token, &to, amount)?;
        }
        Ok(index)
    }

    /// The current root of the note tree.
    pub fn note_root(env: Env) -> BytesN<32> {
        let inst = env.storage().instance();
        let roots: Vec<BytesN<32>> = inst.get(&DataKey::NoteRoots).unwrap_or_else(|| Vec::new(&env));
        if roots.is_empty() {
            return empty_root(&env);
        }
        let at: u32 = inst.get(&DataKey::NoteRootAt).unwrap_or(0);
        roots.get_unchecked(at)
    }

    /// How many notes the tree holds.
    pub fn note_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::NoteCount).unwrap_or(0)
    }

    /// The note at leaf `index`, if there is one.
    pub fn note_at(env: Env, index: u32) -> Option<Note> {
        env.storage().persistent().get(&DataKey::Note(index))
    }

    /// True if `leaf` is the note at `index`: what a lender checks about a
    /// deposit an applicant has opened for them.
    pub fn verify_note(env: Env, leaf: BytesN<32>, index: u32) -> bool {
        Self::note_at(env, index).is_some_and(|n| n.commitment == leaf)
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

/// Pays `amount` of `token` to `to` from the contract, first recalling any
/// shortfall from Blend.
fn pay(env: &Env, token: &Address, to: &Address, amount: i128) -> Result<(), Error> {
    let me = env.current_contract_address();
    let client = token::TokenClient::new(env, token);
    let liquid = client.balance(&me);
    if liquid < amount {
        withdraw_collateral(env, token, amount - liquid)?;
        if client.balance(&me) < amount {
            return Err(Error::InsufficientLiquidity);
        }
    }
    client.transfer(&me, to, &amount);
    Ok(())
}

// ----- The note tree -----

/// A 32-byte field element as a circuit public signal.
fn fr(env: &Env, b: &BytesN<32>) -> Bn254Fr {
    Bn254Fr::from_u256(poseidon::to_u256(env, b))
}

/// How a payout address enters the proof: SHA-256 of the address's XDR with
/// the top byte cleared (248 bits, so always below the field modulus). The
/// apps compute the same from the address's ScVal.
fn recipient_hash(env: &Env, to: &Address) -> U256 {
    let mut h = env.crypto().sha256(&to.clone().to_xdr(env)).to_array();
    h[0] = 0;
    U256::from_be_bytes(env, &Bytes::from_array(env, &h))
}

/// Zero hashes per level, leaf level first: 0, then Poseidon(z, z) of the
/// level below. Computed once and kept.
fn note_zeros(env: &Env, h: &Poseidon) -> Vec<BytesN<32>> {
    let inst = env.storage().instance();
    if let Some(z) = inst.get::<_, Vec<BytesN<32>>>(&DataKey::NoteZeros) {
        return z;
    }
    let mut zeros = Vec::new(env);
    let mut z = BytesN::from_array(env, &[0u8; 32]);
    for _ in 0..=DEPTH {
        zeros.push_back(z.clone());
        z = h.hash(&[&z, &z]);
    }
    inst.set(&DataKey::NoteZeros, &zeros);
    zeros
}

/// The root of a note tree with no notes.
fn empty_root(env: &Env) -> BytesN<32> {
    note_zeros(env, &Poseidon::t3(env)).get_unchecked(DEPTH)
}

/// Whether `root` is one of the last ROOT_HISTORY roots (or the empty root
/// of a tree that has none yet).
fn known_root(env: &Env, root: &BytesN<32>) -> bool {
    let roots: Vec<BytesN<32>> = env
        .storage()
        .instance()
        .get(&DataKey::NoteRoots)
        .unwrap_or_else(|| Vec::new(env));
    if roots.is_empty() {
        return *root == empty_root(env);
    }
    roots.iter().any(|r| r == *root)
}

/// Appends `notes` (commitment, memo) to the note tree: an incremental Merkle
/// insert of DEPTH hashes each, the note stored by index for clients, the new
/// root recorded in the history. Returns the first note's leaf index.
fn insert_notes(env: &Env, h: &Poseidon, notes: &[(BytesN<32>, Bytes)]) -> Result<u32, Error> {
    let inst = env.storage().instance();
    let persistent = env.storage().persistent();
    let zeros = note_zeros(env, h);
    let mut filled: Vec<BytesN<32>> = inst
        .get(&DataKey::NoteFilled)
        .unwrap_or_else(|| zeros.slice(0..DEPTH));
    let mut count: u32 = inst.get(&DataKey::NoteCount).unwrap_or(0);
    let mut leaves: Vec<BytesN<32>> = persistent
        .get(&DataKey::NoteLeaves)
        .unwrap_or_else(|| Vec::new(env));
    let first = count;
    let mut root = empty_root(env);

    for (commitment, memo) in notes {
        if count >= 1 << DEPTH {
            return Err(Error::TreeFull);
        }
        let mut cur = commitment.clone();
        let mut idx = count;
        for level in 0..DEPTH {
            let (left, right) = if idx & 1 == 0 {
                // A left child: remember it for its sibling, hash with zero for now.
                filled.set(level, cur.clone());
                (cur, zeros.get_unchecked(level))
            } else {
                (filled.get_unchecked(level), cur)
            };
            cur = h.hash(&[&left, &right]);
            idx >>= 1;
        }
        root = cur;
        leaves.push_back(commitment.clone());
        let key = DataKey::Note(count);
        persistent.set(
            &key,
            &Note { commitment: commitment.clone(), memo: memo.clone(), at: env.ledger().timestamp() },
        );
        persistent.extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        NoteAdded { index: count, commitment: commitment.clone() }.publish(env);
        count += 1;
    }

    let mut roots: Vec<BytesN<32>> = inst.get(&DataKey::NoteRoots).unwrap_or_else(|| Vec::new(env));
    let at: u32 = inst.get(&DataKey::NoteRootAt).unwrap_or(0);
    let next = if roots.is_empty() { 0 } else { (at + 1) % ROOT_HISTORY };
    if next < roots.len() {
        roots.set(next, root);
    } else {
        roots.push_back(root);
    }
    inst.set(&DataKey::NoteRoots, &roots);
    inst.set(&DataKey::NoteRootAt, &next);
    inst.set(&DataKey::NoteFilled, &filled);
    inst.set(&DataKey::NoteCount, &count);
    inst.extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
    persistent.set(&DataKey::NoteLeaves, &leaves);
    persistent.extend_ttl(&DataKey::NoteLeaves, TTL_THRESHOLD, TTL_EXTEND);
    Ok(first)
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
