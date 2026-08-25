import assert from "node:assert/strict";
import { generateKeyPairSync, sign as nodeSign, verify as nodeVerify, createPublicKey } from "node:crypto";
import test from "node:test";
import {
  base58Encode,
  decodeBase64,
  encodeBase64,
  generateSessionKeypair,
  sessionSignerFromSecretKey,
} from "../src/index.js";

function seedAndPublic(): { seed: Uint8Array; publicKey: Uint8Array; secretKey: Uint8Array; privatePem: string } {
  const pair = generateKeyPairSync("ed25519");
  const pkcs8 = new Uint8Array(pair.privateKey.export({ format: "der", type: "pkcs8" }));
  const seed = pkcs8.subarray(pkcs8.length - 32);
  const publicKey = new Uint8Array(pair.publicKey.export({ format: "der", type: "spki" })).subarray(-32);
  const secretKey = new Uint8Array(64);
  secretKey.set(seed, 0);
  secretKey.set(publicKey, 32);
  return { seed, publicKey, secretKey, privatePem: pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString() };
}

test("session signer derives the public key and signs messages verifiably", async () => {
  const { seed, publicKey, secretKey } = seedAndPublic();
  const fromSecret = await sessionSignerFromSecretKey(secretKey);
  const fromSeed = await sessionSignerFromSecretKey(seed);
  const fromBase58 = await sessionSignerFromSecretKey(base58Encode(secretKey), base58Encode(publicKey));
  assert.equal(fromSecret.publicKey, base58Encode(publicKey));
  assert.equal(fromSeed.publicKey, fromSecret.publicKey);
  assert.equal(fromBase58.publicKey, fromSecret.publicKey);
  const message = new TextEncoder().encode("strata:test");
  const signature = await fromSecret.signMessage(message);
  assert.equal(signature.length, 64);
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey)]);
  assert.ok(nodeVerify(null, message, createPublicKey({ key: spki, format: "der", type: "spki" }), signature));
  await assert.rejects(sessionSignerFromSecretKey(secretKey, base58Encode(seed)), /does not belong/);
});

test("session key generation returns a signer-compatible Solana keypair", async () => {
  const generated = await generateSessionKeypair();
  const signer = await sessionSignerFromSecretKey(generated.secretKey, generated.publicKey);
  assert.equal(signer.publicKey, generated.publicKey);
  assert.match(generated.publicKey, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  assert.match(generated.secretKey, /^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
});

test("session signer fills exactly its own signature slot in a prepared transaction", async () => {
  const feePayer = seedAndPublic();
  const session = seedAndPublic();
  const signer = await sessionSignerFromSecretKey(session.secretKey);
  // v0 message with two required signers: fee payer (pre-signed) then session.
  const message = Uint8Array.from([
    0x80, 2, 0, 1, // version, header
    3, ...feePayer.publicKey, ...session.publicKey, ...new Uint8Array(32).fill(9), // keys
    ...new Uint8Array(32).fill(5), // blockhash
    1, 2, 1, 0, 1, 0, // one instruction: program idx 2, one account (idx 0), one data byte
    0, // no lookup tables
  ]);
  const feePayerSignature = new Uint8Array(nodeSign(null, message, feePayer.privatePem));
  const prepared = Uint8Array.from([2, ...feePayerSignature, ...new Uint8Array(64), ...message]);
  const signed = decodeBase64(await signer.signTransaction(encodeBase64(prepared)));
  assert.deepEqual(signed.subarray(1, 65), feePayerSignature, "fee payer signature untouched");
  assert.deepEqual(signed.subarray(129), message, "message untouched");
  const sessionSignature = signed.subarray(65, 129);
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(session.publicKey)]);
  assert.ok(nodeVerify(null, message, createPublicKey({ key: spki, format: "der", type: "spki" }), sessionSignature));
  // A transaction that does not list the session as a signer is refused.
  const other = seedAndPublic();
  const otherSigner = await sessionSignerFromSecretKey(other.secretKey);
  await assert.rejects(otherSigner.signTransaction(encodeBase64(prepared)), /not a signer/);
});
