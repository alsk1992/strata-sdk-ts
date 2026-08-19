/**
 * A ready-made Vault session signer from a session secret key.
 *
 * The API-sessions page (and `strata vault-setup`) hand the owner a session
 * secret key once; a bot pastes it here and gets the `StrataSessionSigner`
 * every one-call helper accepts (`orders.execute`, `algos.execute`,
 * `executeQuote`, the order-command channel). No Solana SDK is needed: Ed25519
 * comes from Web Crypto (Node 20+, modern browsers), and transaction signing
 * writes the session's signature into the exact slot the prepared transaction
 * left empty for it — nothing else in the bytes changes.
 *
 * The key never leaves the process; the SDK never transmits or stores it.
 */
import { StrataContractError, base58Decode, base58Encode, decodeBase64, encodeBase64 } from "./client.js";
import type { StrataSessionSigner } from "./types.js";

/** PKCS#8 prefix for a raw 32-byte Ed25519 seed (RFC 8410). */
const PKCS8_ED25519_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new StrataContractError("Web Crypto is required for the session signer");
  return api;
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return decodeBase64(padded);
}

/**
 * Accepts the 64-byte Solana secret key (seed ‖ public key), a 32-byte seed,
 * or either as a base58 string. Returns the seed and, when present, the public
 * key that was packed with it.
 */
function normalizeSecretKey(secretKey: Uint8Array | string): { seed: Uint8Array; packedPublicKey?: Uint8Array } {
  const bytes = typeof secretKey === "string"
    ? base58Decode(secretKey.trim(), secretKey.trim().length > 60 ? 64 : 32, "sessionSecretKey")
    : secretKey;
  if (bytes.length === 64) return { seed: bytes.slice(0, 32), packedPublicKey: bytes.slice(32) };
  if (bytes.length === 32) return { seed: bytes.slice(0, 32) };
  throw new TypeError("sessionSecretKey must be 32 or 64 bytes");
}

/**
 * Locate the signature slot for `signer` in a serialized legacy or v0
 * transaction: returns the message bytes and the byte offset of that slot.
 */
function locateSignatureSlot(
  transaction: Uint8Array,
  signer: string,
): { message: Uint8Array; slotOffset: number } {
  let cursor = 0;
  const compact = (): number => {
    let value = 0;
    let shift = 0;
    for (let i = 0; i < 3; i += 1) {
      const byte = transaction[cursor++];
      if (byte === undefined) throw new StrataContractError("transaction is truncated");
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value;
      shift += 7;
    }
    throw new StrataContractError("transaction length prefix is invalid");
  };
  const signatureCount = compact();
  const signaturesOffset = cursor;
  cursor += signatureCount * 64;
  const message = transaction.subarray(cursor);
  // Message header (skip the v0 version byte), then the static keys.
  let m = 0;
  if ((message[m]! & 0x80) !== 0) m += 1;
  const numRequiredSignatures = message[m]!;
  m += 3;
  let keyCount = 0;
  let shift = 0;
  for (let i = 0; i < 3; i += 1) {
    const byte = message[m++]!;
    keyCount |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  for (let index = 0; index < Math.min(keyCount, numRequiredSignatures); index += 1) {
    const key = base58Encode(message.subarray(m + index * 32, m + index * 32 + 32));
    if (key === signer) {
      if (index >= signatureCount) throw new StrataContractError("transaction has no signature slot for the session");
      return { message, slotOffset: signaturesOffset + index * 64 };
    }
  }
  throw new StrataContractError("the session key is not a signer of this transaction");
}

/**
 * Build a `StrataSessionSigner` from a session secret key. Verifies that the
 * key matches `expectedPublicKey` when given (e.g. the key the owner
 * registered), so a pasted key from the wrong wallet fails immediately.
 */
export async function sessionSignerFromSecretKey(
  secretKey: Uint8Array | string,
  expectedPublicKey?: string,
): Promise<StrataSessionSigner> {
  const { seed, packedPublicKey } = normalizeSecretKey(secretKey);
  const pkcs8 = new Uint8Array(PKCS8_ED25519_PREFIX.length + 32);
  pkcs8.set(PKCS8_ED25519_PREFIX, 0);
  pkcs8.set(seed, PKCS8_ED25519_PREFIX.length);
  const privateKey = await subtle().importKey("pkcs8", pkcs8.buffer, { name: "Ed25519" }, true, ["sign"]);
  const jwk = await subtle().exportKey("jwk", privateKey);
  if (typeof jwk.x !== "string") throw new StrataContractError("session key export failed");
  const publicKeyBytes = base64UrlToBytes(jwk.x);
  const publicKey = base58Encode(publicKeyBytes);
  if (packedPublicKey && base58Encode(packedPublicKey) !== publicKey) {
    throw new TypeError("sessionSecretKey public half does not match its seed");
  }
  if (expectedPublicKey !== undefined && expectedPublicKey.trim() !== publicKey) {
    throw new TypeError("sessionSecretKey does not belong to the expected session public key");
  }
  const sign = async (bytes: Uint8Array): Promise<Uint8Array> => {
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return new Uint8Array(await subtle().sign({ name: "Ed25519" }, privateKey, copy.buffer));
  };
  return {
    publicKey,
    signMessage: (message) => sign(message),
    async signTransaction(transactionBase64) {
      const transaction = new Uint8Array(decodeBase64(transactionBase64));
      const { message, slotOffset } = locateSignatureSlot(transaction, publicKey);
      const signature = await sign(message);
      transaction.set(signature, slotOffset);
      return encodeBase64(transaction);
    },
  };
}
