import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  findUserAccountPda,
  findIntentRecordPda,
  findMarketPda,
  findProtocolVaultPda,
  findOrderPda,
  findAta,
} from "../src/pdas.js";

const PROGRAM = new PublicKey("2Q3GYQQbdGt6MwSUUuMANyZZ45MyfJVydWPNhzCBZ4sK");
const MARKET = new PublicKey("3Dk811jiaAwwtvsm9YghTkLKoRz1MVxZArRFc1mxrYZH");
const OWNER = new PublicKey("HkPoCDc33gAMVpmyJEJsWZhjDAqoiMRX2x3WQVsM8NA9");
const BASE_MINT = new PublicKey("8yTRUa5En8TLeBAqNrMyjArCXSUBNMWZycL2ixtZrcrS");
const QUOTE_MINT = new PublicKey("6tpnmkWL3rBqV4rSExXcXBQjaT5uVi7YrUsDvdj8bJEb");

describe("PDA derivers", () => {
  it("findUserAccountPda is deterministic", () => {
    const [a, b1] = findUserAccountPda(PROGRAM, MARKET, OWNER);
    const [b, b2] = findUserAccountPda(PROGRAM, MARKET, OWNER);
    expect(a.toBase58()).toBe(b.toBase58());
    expect(b1).toBe(b2);
  });

  it("findIntentRecordPda is deterministic + different per-MM", () => {
    const [a] = findIntentRecordPda(PROGRAM, MARKET, OWNER);
    const [b] = findIntentRecordPda(PROGRAM, MARKET, BASE_MINT);
    expect(a.toBase58()).not.toBe(b.toBase58());
  });

  it("findMarketPda hashes mint pair", () => {
    const [a] = findMarketPda(PROGRAM, BASE_MINT, QUOTE_MINT);
    const [b] = findMarketPda(PROGRAM, QUOTE_MINT, BASE_MINT);
    // Order matters in the seed
    expect(a.toBase58()).not.toBe(b.toBase58());
  });

  it("findProtocolVaultPda", () => {
    const [pda] = findProtocolVaultPda(PROGRAM, MARKET);
    expect(pda).toBeInstanceOf(PublicKey);
  });

  it("findOrderPda incorporates seq", () => {
    const [a] = findOrderPda(PROGRAM, MARKET, OWNER, 0n);
    const [b] = findOrderPda(PROGRAM, MARKET, OWNER, 1n);
    expect(a.toBase58()).not.toBe(b.toBase58());
  });

  it("findAta matches standard derivation", () => {
    const ata = findAta(OWNER, BASE_MINT);
    expect(ata).toBeInstanceOf(PublicKey);
  });
});
