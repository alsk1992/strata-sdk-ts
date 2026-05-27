import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  adminRegisterMmIx,
  adminRemoveMmIx,
  adminSlashMmIx,
  bondStakeIx,
  claimStakeIx,
  crankExpiredOrdersIx,
  recordRfqTimeoutIx,
  settleTradeIx,
  migrateMarketV2Ix,
  migrateIntentV3Ix,
  setQuoteSignerIx,
} from "../src/admin.js";
import { IxTag, Side } from "../src/constants.js";

const PROGRAM = new PublicKey("2Q3GYQQbdGt6MwSUUuMANyZZ45MyfJVydWPNhzCBZ4sK");
const MARKET = new PublicKey("3Dk811jiaAwwtvsm9YghTkLKoRz1MVxZArRFc1mxrYZH");
const ADMIN = new PublicKey("HkPoCDc33gAMVpmyJEJsWZhjDAqoiMRX2x3WQVsM8NA9");
const MM = new PublicKey("2rG8TF7i8urPBQEmPqwmCFBebGR8R7cEwcXgHZWzswig");
const UA = new PublicKey("5xvUmFCiW4dK7QbfWLPSwP3cBCktgK6BMSLDmEycR584");
const INTENT = new PublicKey("Hq6rkB1ChqYzYipSzokLw5h55AUuEHzCkAbxRqd7xpJp");

describe("admin ix builders", () => {
  it("adminRegisterMmIx body shape is 42 bytes + tag", () => {
    const ix = adminRegisterMmIx(
      {
        programId: PROGRAM,
        admin: ADMIN,
        market: MARKET,
        mm: MM,
        mmUserAccount: UA,
        intentRecord: INTENT,
      },
      {
        side: Side.Buy,
        intentBump: 254,
        stakeAmount: 1_000_000_000n,
        minPrice: 99_000n,
        maxPrice: 101_000n,
        maxFillSize: 50_000_000n,
        minSpreadBps: 25,
      },
    );
    expect(ix.data[0]).toBe(IxTag.AdminRegisterMm);
    expect(ix.data.length).toBe(1 + 42);
    expect(ix.data[1]).toBe(0); // Side.Buy
    expect(ix.data[2]).toBe(254);
    expect(ix.data.readBigUInt64LE(9)).toBe(1_000_000_000n);
    expect(ix.data.readUInt16LE(41)).toBe(25);
    expect(ix.keys[0]!.isSigner).toBe(true);
    expect(ix.keys[0]!.pubkey.toBase58()).toBe(ADMIN.toBase58());
  });

  it("adminRemoveMmIx is just the tag", () => {
    const ix = adminRemoveMmIx({
      programId: PROGRAM,
      admin: ADMIN,
      market: MARKET,
      intentRecord: INTENT,
      mmUserAccount: UA,
    });
    expect(ix.data.length).toBe(1);
    expect(ix.data[0]).toBe(IxTag.AdminRemoveMm);
  });

  it("adminSlashMmIx encodes slash amount as u64 LE", () => {
    const ix = adminSlashMmIx(
      {
        programId: PROGRAM,
        admin: ADMIN,
        market: MARKET,
        intentRecord: INTENT,
        protocolVault: UA,
      },
      500_000_000n,
    );
    expect(ix.data[0]).toBe(IxTag.AdminSlashMm);
    expect(ix.data.readBigUInt64LE(1)).toBe(500_000_000n);
  });

  it("bondStakeIx + claimStakeIx symmetric account order", () => {
    const bond = bondStakeIx(
      {
        programId: PROGRAM,
        mm: MM,
        market: MARKET,
        intentRecord: INTENT,
        marketQuoteVault: UA,
        mmQuoteToken: INTENT,
      },
      1_000_000_000n,
    );
    expect(bond.data[0]).toBe(IxTag.BondStake);
    expect(bond.data.readBigUInt64LE(1)).toBe(1_000_000_000n);

    const claim = claimStakeIx({
      programId: PROGRAM,
      mm: MM,
      market: MARKET,
      intentRecord: INTENT,
      marketQuoteVault: UA,
      mmQuoteToken: INTENT,
    });
    expect(claim.data[0]).toBe(IxTag.ClaimStake);
    expect(claim.data.length).toBe(1);
  });

  it("crankExpiredOrdersIx is tag-only", () => {
    const ix = crankExpiredOrdersIx({
      programId: PROGRAM,
      cranker: ADMIN,
      market: MARKET,
      userAccount: UA,
      order: INTENT,
      rentReceiver: ADMIN,
    });
    expect(ix.data[0]).toBe(IxTag.CrankExpiredOrders);
    expect(ix.keys.length).toBe(5);
  });

  it("recordRfqTimeoutIx (IS-9) has protocol_vault writable", () => {
    const ix = recordRfqTimeoutIx({
      programId: PROGRAM,
      market: MARKET,
      intentRecord: INTENT,
      settleAuthority: ADMIN,
      protocolVault: UA,
    });
    expect(ix.data[0]).toBe(IxTag.RecordRfqTimeout);
    expect(ix.keys[2]!.isSigner).toBe(true);
    expect(ix.keys[3]!.isWritable).toBe(true); // protocol_vault
  });

  it("settleTradeIx body is 32 bytes; pyth account optional", () => {
    const without = settleTradeIx(
      {
        programId: PROGRAM,
        market: MARKET,
        maker: MM,
        takerOrder: INTENT,
        makerUserAccount: UA,
        takerUserAccount: UA,
        protocolVault: UA,
        settleAuthority: ADMIN,
      },
      {
        makerOrderId: 1n,
        takerOrderId: 2n,
        fillSize: 1_000_000_000n,
        settlePrice: 150_000_000n,
      },
    );
    expect(without.data[0]).toBe(IxTag.SettleTrade);
    expect(without.data.length).toBe(1 + 32);
    expect(without.keys.length).toBe(7);

    const withPyth = settleTradeIx(
      {
        programId: PROGRAM,
        market: MARKET,
        maker: MM,
        takerOrder: INTENT,
        makerUserAccount: UA,
        takerUserAccount: UA,
        protocolVault: UA,
        settleAuthority: ADMIN,
        pythPriceUpdate: INTENT,
      },
      {
        makerOrderId: 1n,
        takerOrderId: 2n,
        fillSize: 1_000_000_000n,
        settlePrice: 150_000_000n,
      },
    );
    expect(withPyth.keys.length).toBe(8);
  });

  it("migration ixs are tag-only", () => {
    const m2 = migrateMarketV2Ix(PROGRAM, ADMIN, MARKET);
    expect(m2.data[0]).toBe(IxTag.MigrateMarketV2);
    const i3 = migrateIntentV3Ix(PROGRAM, ADMIN, MARKET, INTENT);
    expect(i3.data[0]).toBe(IxTag.MigrateIntentV3);
  });

  it("setQuoteSignerIx requires 64-byte signer; rejects wrong size", () => {
    const signer = Buffer.alloc(64);
    signer.fill(0xaa);
    const ix = setQuoteSignerIx(
      { programId: PROGRAM, mm: MM, market: MARKET, intentRecord: INTENT },
      signer,
    );
    expect(ix.data[0]).toBe(IxTag.SetQuoteSigner);
    expect(ix.data.length).toBe(1 + 64);

    expect(() =>
      setQuoteSignerIx(
        { programId: PROGRAM, mm: MM, market: MARKET, intentRecord: INTENT },
        Buffer.alloc(32),
      ),
    ).toThrow(/64 bytes/);
  });
});
