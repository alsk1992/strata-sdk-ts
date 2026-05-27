import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { cuLimitIx, cuPriceIx, jitoTipIx } from "../src/tx.js";
import { COMPUTE_BUDGET_PROGRAM_ID } from "../src/constants.js";

describe("tx helpers", () => {
  it("cuLimitIx discriminator + payload", () => {
    const ix = cuLimitIx(100_000);
    expect(ix.programId.toBase58()).toBe(COMPUTE_BUDGET_PROGRAM_ID.toBase58());
    expect(ix.data[0]).toBe(2);
    expect(ix.data.readUInt32LE(1)).toBe(100_000);
    expect(ix.keys.length).toBe(0);
  });

  it("cuPriceIx discriminator + u64 LE payload", () => {
    const ix = cuPriceIx(50_000n);
    expect(ix.data[0]).toBe(3);
    expect(ix.data.readBigUInt64LE(1)).toBe(50_000n);
  });

  it("jitoTipIx writes SystemProgram::Transfer shape", () => {
    const payer = PublicKey.unique();
    const tip = PublicKey.unique();
    const ix = jitoTipIx(payer, tip, 10_000n);
    expect(ix.programId.toBase58()).toBe(PublicKey.default.toBase58());
    expect(ix.keys.length).toBe(2);
    expect(ix.keys[0]!.isSigner).toBe(true);
    expect(ix.data.readUInt32LE(0)).toBe(2);
    expect(ix.data.readBigUInt64LE(4)).toBe(10_000n);
  });
});
