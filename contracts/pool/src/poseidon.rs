//! Poseidon over the BN254 scalar field, computed by the host's permutation
//! (Protocol 25+, CAP-0075) with circomlib's parameters (poseidon_params.rs),
//! so the contract hashes notes and tree nodes exactly as the spend circuit
//! (circuits/spend.circom) and the apps (poseidon-lite) do. The hash of n
//! inputs runs the state [0, inputs…] through the permutation with
//! t = n + 1 and takes the first element, as circomlib's Poseidon(n) does.
use crate::poseidon_params::{Params, ROUNDS_F, T2, T3, T4};
use soroban_sdk::{symbol_short, Bytes, BytesN, Env, Vec, U256};

/// The BN254 scalar field modulus r, big-endian.
pub const MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

/// True if the 32 big-endian bytes are a canonical field element (< r). The
/// host reduces larger values silently, which would let two different byte
/// strings hash alike, so callers check this first.
pub fn is_field(b: &BytesN<32>) -> bool {
    b.to_array() < MODULUS
}

/// A Poseidon instance for one state width, its parameters built once per
/// call (a few hundred field elements) and reused for every hash.
pub struct Poseidon {
    env: Env,
    t: u32,
    rounds_p: u32,
    mds: Vec<Vec<U256>>,
    rc: Vec<Vec<U256>>,
}

impl Poseidon {
    fn build(env: &Env, p: &Params) -> Self {
        let fe = |b: &[u8; 32]| U256::from_be_bytes(env, &Bytes::from_array(env, b));
        let t = p.t as usize;
        let mut rc = Vec::new(env);
        let mut i = 0;
        while i < p.c.len() {
            let mut row = Vec::new(env);
            for j in 0..t {
                row.push_back(fe(&p.c[i + j]));
            }
            rc.push_back(row);
            i += t;
        }
        let mut mds = Vec::new(env);
        for r in 0..t {
            let mut row = Vec::new(env);
            for c in 0..t {
                row.push_back(fe(&p.m[r * t + c]));
            }
            mds.push_back(row);
        }
        Poseidon { env: env.clone(), t: p.t, rounds_p: p.rounds_p, mds, rc }
    }

    /// Poseidon(1): one input (a public key from a secret).
    pub fn t2(env: &Env) -> Self {
        Self::build(env, &T2)
    }

    /// Poseidon(2): two inputs (tree nodes, nullifiers).
    pub fn t3(env: &Env) -> Self {
        Self::build(env, &T3)
    }

    /// Poseidon(3): three inputs (note commitments).
    pub fn t4(env: &Env) -> Self {
        Self::build(env, &T4)
    }

    /// The hash of `inputs` (t - 1 of them, each a canonical field element)
    /// as 32 big-endian bytes.
    pub fn hash(&self, inputs: &[&BytesN<32>]) -> BytesN<32> {
        let env = &self.env;
        let mut state = Vec::new(env);
        state.push_back(U256::from_u32(env, 0));
        for x in inputs {
            state.push_back(to_u256(env, x));
        }
        let out = env.crypto_hazmat().poseidon_permutation(
            &state,
            symbol_short!("BN254"),
            self.t,
            5,
            ROUNDS_F,
            self.rounds_p,
            &self.mds,
            &self.rc,
        );
        from_u256(env, &out.get(0).unwrap())
    }
}

pub fn to_u256(env: &Env, b: &BytesN<32>) -> U256 {
    U256::from_be_bytes(env, &Bytes::from(b.clone()))
}

pub fn from_u256(env: &Env, u: &U256) -> BytesN<32> {
    let mut arr = [0u8; 32];
    u.to_be_bytes().copy_into_slice(&mut arr);
    BytesN::from_array(env, &arr)
}
