pragma circom 2.1.6;

// Spending notes in the Boloka pool without revealing which ones.
//
// A note is a commitment Poseidon(amount, pk, blinding) in the pool's note
// tree (contracts/pool: deposit_note / spend), owned by whoever knows the
// secret sk with pk = Poseidon(sk). Spending proves, in zero knowledge:
//   - each input note with a non-zero amount is in the tree at `root`
//     (a zero-amount input is a filler: no membership needed);
//   - the prover owns them (the commitment opens with pk = Poseidon(sk));
//   - its nullifier is Poseidon(commitment, sk), so the pool can refuse a
//     second spend without learning which note was spent;
//   - the new notes are well-formed commitments (any owner: a transfer gives
//     one to the recipient and the change back to the sender);
//   - value is conserved: inputs = outputs + publicAmount, where publicAmount
//     is what the pool pays out to `recipient` (0 for a transfer inside the
//     pool) and all amounts are 64-bit.
// `recipient` is bound into the proof so a withdrawal cannot be redirected.
//
// Public signals, in this order (the contract rebuilds them from its
// arguments): root, publicAmount, recipient, inNullifier[2], outCommitment[2].
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

// Root of a depth-`depth` Poseidon tree from a leaf, its index bits and the
// sibling hashes, leaf level first.
template MerkleRoot(depth) {
    signal input leaf;
    signal input pathIndices[depth];
    signal input pathElements[depth];
    signal output root;

    component h[depth];
    signal cur[depth + 1];
    signal left[depth];
    signal right[depth];
    cur[0] <== leaf;
    for (var i = 0; i < depth; i++) {
        // pathIndices[i] is a bit: 0 = current node is the left child.
        left[i] <== cur[i] + pathIndices[i] * (pathElements[i] - cur[i]);
        right[i] <== pathElements[i] + pathIndices[i] * (cur[i] - pathElements[i]);
        h[i] = Poseidon(2);
        h[i].inputs[0] <== left[i];
        h[i].inputs[1] <== right[i];
        cur[i + 1] <== h[i].out;
    }
    root <== cur[depth];
}

template Spend(depth, nIns, nOuts) {
    // Public.
    signal input root;
    signal input publicAmount;
    signal input recipient;
    signal input inNullifier[nIns];
    signal input outCommitment[nOuts];

    // Private.
    signal input sk;
    signal input inAmount[nIns];
    signal input inBlinding[nIns];
    signal input inIndex[nIns];
    signal input inPathElements[nIns][depth];
    signal input outAmount[nOuts];
    signal input outPk[nOuts];
    signal input outBlinding[nOuts];

    component pkOf = Poseidon(1);
    pkOf.inputs[0] <== sk;
    signal pk <== pkOf.out;

    var sumIn = 0;
    component inCommit[nIns];
    component inNull[nIns];
    component inBits[nIns];
    component inTree[nIns];
    component inRange[nIns];
    for (var i = 0; i < nIns; i++) {
        inCommit[i] = Poseidon(3);
        inCommit[i].inputs[0] <== inAmount[i];
        inCommit[i].inputs[1] <== pk;
        inCommit[i].inputs[2] <== inBlinding[i];

        inNull[i] = Poseidon(2);
        inNull[i].inputs[0] <== inCommit[i].out;
        inNull[i].inputs[1] <== sk;
        inNull[i].out === inNullifier[i];

        inBits[i] = Num2Bits(depth);
        inBits[i].in <== inIndex[i];
        inTree[i] = MerkleRoot(depth);
        inTree[i].leaf <== inCommit[i].out;
        for (var j = 0; j < depth; j++) {
            inTree[i].pathIndices[j] <== inBits[i].out[j];
            inTree[i].pathElements[j] <== inPathElements[i][j];
        }
        // Membership is required unless the input is a zero-amount filler.
        (inTree[i].root - root) * inAmount[i] === 0;

        inRange[i] = Num2Bits(64);
        inRange[i].in <== inAmount[i];
        sumIn += inAmount[i];
    }

    var sumOut = 0;
    component outCommit[nOuts];
    component outRange[nOuts];
    for (var i = 0; i < nOuts; i++) {
        outCommit[i] = Poseidon(3);
        outCommit[i].inputs[0] <== outAmount[i];
        outCommit[i].inputs[1] <== outPk[i];
        outCommit[i].inputs[2] <== outBlinding[i];
        outCommit[i].out === outCommitment[i];

        outRange[i] = Num2Bits(64);
        outRange[i].in <== outAmount[i];
        sumOut += outAmount[i];
    }

    component pubRange = Num2Bits(64);
    pubRange.in <== publicAmount;
    sumIn === sumOut + publicAmount;

    // The same note cannot be spent twice in one proof.
    component same[nIns * (nIns - 1) / 2];
    var k = 0;
    for (var i = 0; i < nIns; i++) {
        for (var j = i + 1; j < nIns; j++) {
            same[k] = IsEqual();
            same[k].in[0] <== inNullifier[i];
            same[k].in[1] <== inNullifier[j];
            same[k].out === 0;
            k++;
        }
    }

    // Binds `recipient` into the proof (a signal must appear in a constraint).
    signal recipientSquare <== recipient * recipient;
}

component main {public [root, publicAmount, recipient, inNullifier, outCommitment]} = Spend(20, 2, 2);
