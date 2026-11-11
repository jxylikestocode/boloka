//! Groth16 verification over BN254 with the host's pairing (Protocol 25+,
//! CAP-0074), after stellar/soroban-examples/groth16_verifier (which is over
//! BLS12-381). Points use the Ethereum-style uncompressed encodings the host
//! expects: G1 is x‖y (64 bytes), G2 is x.c1‖x.c0‖y.c1‖y.c0 (128 bytes), all
//! coordinates 32-byte big-endian. circuits/export-verifier.mjs writes the key
//! in this form from snarkjs' verification_key.json, and the apps encode
//! proofs the same way.
use soroban_sdk::{
    contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    vec, BytesN, Env, Vec,
};

#[contracttype]
#[derive(Clone)]
pub struct VerificationKey {
    pub alpha: BytesN<64>,
    pub beta: BytesN<128>,
    pub gamma: BytesN<128>,
    pub delta: BytesN<128>,
    /// One more than the number of public signals.
    pub ic: Vec<BytesN<64>>,
}

#[contracttype]
#[derive(Clone)]
pub struct Proof {
    pub a: BytesN<64>,
    pub b: BytesN<128>,
    pub c: BytesN<64>,
}

/// e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) == 1, with
/// vk_x = ic[0] + Σ signals[i] · ic[i + 1]. False for a wrong proof or a key
/// of the wrong size; a malformed point makes the host trap.
pub fn verify(env: &Env, vk: &VerificationKey, proof: &Proof, signals: &Vec<Bn254Fr>) -> bool {
    if signals.len() + 1 != vk.ic.len() {
        return false;
    }
    let bn = env.crypto().bn254();
    let g1 = Bn254G1Affine::from_bytes;
    let g2 = Bn254G2Affine::from_bytes;

    let mut points = Vec::new(env);
    for p in vk.ic.iter().skip(1) {
        points.push_back(g1(p));
    }
    let vk_x = bn.g1_add(&g1(vk.ic.get(0).unwrap()), &bn.g1_msm(points, signals.clone()));

    bn.pairing_check(
        vec![env, -g1(proof.a.clone()), g1(vk.alpha.clone()), vk_x, g1(proof.c.clone())],
        vec![env, g2(proof.b.clone()), g2(vk.beta.clone()), g2(vk.gamma.clone()), g2(vk.delta.clone())],
    )
}
