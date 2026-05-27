import { describe, it, expect } from "vitest";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  wrapStrataIxForVault,
  VAULT_EXECUTE_WITH_DELEGATE_TAG,
} from "../src/vault.js";
import { cancelOrderIx } from "../src/ix.js";
import { IxTag } from "../src/constants.js";

const PROGRAM = new PublicKey("2Q3GYQQbdGt6MwSUUuMANyZZ45MyfJVydWPNhzCBZ4sK");
const VAULT_PROGRAM = new PublicKey("E65Y4S5NeW2tqDdgDvqDZenFnBbgGhz43KTdBLuBt8gb");
const OWNER = new PublicKey("HkPoCDc33gAMVpmyJEJsWZhjDAqoiMRX2x3WQVsM8NA9");

const session = {
  owner: OWNER.toBase58(),
  vaultPda: "2rG8TF7i8urPBQEmPqwmCFBebGR8R7cEwcXgHZWzswig",
  delegatePubkey: "5xvUmFCiW4dK7QbfWLPSwP3cBCktgK6BMSLDmEycR584",
  delegatePda: "Hq6rkB1ChqYzYipSzokLw5h55AUuEHzCkAbxRqd7xpJp",
  keyId: "5xvUmFCiW4dK7QbfWLPSwP3cBCktgK6BMSLDmEycR584",
};

function makeInner(): TransactionInstruction {
  return cancelOrderIx({
    programId: PROGRAM,
    canceller: OWNER,
    market: new PublicKey("3Dk811jiaAwwtvsm9YghTkLKoRz1MVxZArRFc1mxrYZH"),
    userAccount: OWNER,
    orderPda: OWNER,
    rentReceiver: OWNER,
  });
}

describe("vault wrap", () => {
  it("data starts with vault tag 3", () => {
    const ix = wrapStrataIxForVault({
      session,
      masterOwner: OWNER,
      innerIx: makeInner(),
      amountIn: 0n,
      vaultProgramId: VAULT_PROGRAM,
    });
    expect(ix.data[0]).toBe(VAULT_EXECUTE_WITH_DELEGATE_TAG);
  });

  it("inner ix data is embedded after the header", () => {
    const inner = makeInner();
    const ix = wrapStrataIxForVault({
      session,
      masterOwner: OWNER,
      innerIx: inner,
      amountIn: 0n,
      vaultProgramId: VAULT_PROGRAM,
    });
    // Layout: tag(1) + header(13) + inner_data(N) + roles(M)
    const headerSize = 1 + 13;
    const innerSlice = ix.data.subarray(headerSize, headerSize + inner.data.length);
    expect(Buffer.from(innerSlice).equals(inner.data)).toBe(true);
    // First byte of embedded inner == CancelOrder tag (4)
    expect(innerSlice[0]).toBe(IxTag.CancelOrder);
  });

  it("account list: delegate=signer, vault RO, delegate_pda RW, then inner keys", () => {
    const inner = makeInner();
    const ix = wrapStrataIxForVault({
      session,
      masterOwner: OWNER,
      innerIx: inner,
      amountIn: 0n,
      vaultProgramId: VAULT_PROGRAM,
    });
    expect(ix.programId.toBase58()).toBe(VAULT_PROGRAM.toBase58());
    expect(ix.keys[0]!.isSigner).toBe(true);
    expect(ix.keys[0]!.pubkey.toBase58()).toBe(session.delegatePubkey);
    expect(ix.keys[1]!.pubkey.toBase58()).toBe(session.vaultPda);
    expect(ix.keys[1]!.isWritable).toBe(false);
    expect(ix.keys[2]!.pubkey.toBase58()).toBe(session.delegatePda);
    expect(ix.keys[2]!.isWritable).toBe(true);
    expect(ix.keys[3]!.pubkey.toBase58()).toBe(inner.programId.toBase58());
    expect(ix.keys[4]!.pubkey.toBase58()).toBe(OWNER.toBase58());
    // Inner keys passthrough, signer bit stripped
    expect(ix.keys.length).toBe(5 + inner.keys.length);
    for (let i = 0; i < inner.keys.length; i++) {
      expect(ix.keys[5 + i]!.isSigner).toBe(false);
      expect(ix.keys[5 + i]!.isWritable).toBe(inner.keys[i]!.isWritable);
    }
  });

  it("amountIn is encoded as u64 LE in header", () => {
    const ix = wrapStrataIxForVault({
      session,
      masterOwner: OWNER,
      innerIx: makeInner(),
      amountIn: 123_456_789n,
      vaultProgramId: VAULT_PROGRAM,
    });
    // tag(1) + amount_in u64 LE at offset 1
    expect(ix.data.readBigUInt64LE(1)).toBe(123_456_789n);
  });
});
