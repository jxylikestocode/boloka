# Spend fixtures

Made by `app/scripts/zk-fixture.ts` (run by `circuits/build.sh`) from the built circuit; the
contract tests replay them. A tree of two notes owned by A: 600 and 400 (`deposits.bin`, two
commitments). `spend1.bin` spends both: 300 to B, 650 change to A, 50 paid out to
`CBBEEQSCIJBEEQSCIJBEEQSCIJBEEQSCIJBEEQSCIJBEEQSCIJBEE5XW`. `spend2.bin` spends the 600 note with a filler input: 600 to B, a 0 note to A,
nothing paid out. Each file is the proof (a 64 ‖ b 128 ‖ c 64 bytes) followed by the seven public
signals as 32-byte big-endian: root, public amount, recipient hash, two nullifiers, two commitments.
`vk.bin` (from `circuits/export-verifier.mjs`) is alpha ‖ beta ‖ gamma ‖ delta ‖ ic….

Rebuild them after any change to the circuit (the key changes with it).
