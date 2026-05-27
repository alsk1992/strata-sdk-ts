import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  postIntentIx,
  revokeIntentIx,
  cancelOrderIx,
  placeOrderIx,
  depositIx,
} from "../src/ix.js";
import { IxTag, Side, OrderType } from "../src/constants.js";

const PROGRAM = new PublicKey("2Q3GYQQbdGt6MwSUUuMANyZZ45MyfJVydWPNhzCBZ4sK");
const MARKET = new PublicKey("3Dk811jiaAwwtvsm9YghTkLKoRz1MVxZArRFc1mxrYZH");
const MM = new PublicKey("HkPoCDc33gAMVpmyJEJsWZhjDAqoiMRX2x3WQVsM8NA9");
const INTENT_PDA = new PublicKey("2rG8TF7i8urPBQEmPqwmCFBebGR8R7cEwcXgHZWzswig");
const UA_PDA = new PublicKey("5xvUmFCiW4dK7QbfWLPSwP3cBCktgK6BMSLDmEycR584");

describe("ix builders", () => {
  it("postIntentIx wire layout: 1 + 32 = 33 bytes", () => {
    const ix = postIntentIx(
      {
        programId: PROGRAM,
        mm: MM,
        market: MARKET,
        intentRecord: INTENT_PDA,
        mmUserAccount: UA_PDA,
      },
      Side.Buy,
      100n,
      99_000n,
      50_000_000n,
    );
    expect(ix.data[0]).toBe(IxTag.PostIntent);
    expect(ix.data.length).toBe(33);
    // side at byte 1
    expect(ix.data[1]).toBe(0);
    // min_price LE at byte 9
    expect(ix.data.readBigUInt64LE(9)).toBe(100n);
    expect(ix.data.readBigUInt64LE(17)).toBe(99_000n);
    expect(ix.data.readBigUInt64LE(25)).toBe(50_000_000n);
    // First account is the signer MM
    expect(ix.keys[0]!.isSigner).toBe(true);
    expect(ix.keys[0]!.pubkey.toBase58()).toBe(MM.toBase58());
  });

  it("revokeIntentIx is just the tag", () => {
    const ix = revokeIntentIx({
      programId: PROGRAM,
      mm: MM,
      market: MARKET,
      intentRecord: INTENT_PDA,
      mmUserAccount: UA_PDA,
    });
    expect(ix.data.length).toBe(1);
    expect(ix.data[0]).toBe(IxTag.RevokeIntent);
  });

  it("cancelOrderIx is just the tag", () => {
    const ix = cancelOrderIx({
      programId: PROGRAM,
      canceller: MM,
      market: MARKET,
      userAccount: UA_PDA,
      orderPda: INTENT_PDA,
      rentReceiver: MM,
    });
    expect(ix.data.length).toBe(1);
    expect(ix.data[0]).toBe(IxTag.CancelOrder);
  });

  it("placeOrderIx body shape", () => {
    const ix = placeOrderIx(
      {
        programId: PROGRAM,
        owner: MM,
        market: MARKET,
        userAccount: UA_PDA,
        orderPda: INTENT_PDA,
      },
      {
        side: Side.Sell,
        orderType: OrderType.Limit,
        price: 150_000_000n,
        size: 1_000_000_000n,
        expirySlot: 99_999n,
        orderBump: 250,
      },
    );
    expect(ix.data[0]).toBe(IxTag.PlaceOrder);
    expect(ix.data.length).toBe(1 + 29);
    expect(ix.data[1]).toBe(Side.Sell);
    expect(ix.data[2]).toBe(OrderType.Limit);
  });

  it("depositIx encodes amount + asset", () => {
    const ix = depositIx(
      {
        programId: PROGRAM,
        owner: MM,
        market: MARKET,
        userAccount: UA_PDA,
        userTokenAccount: INTENT_PDA,
        marketVault: INTENT_PDA,
      },
      1_000_000_000n,
      1,
    );
    expect(ix.data[0]).toBe(IxTag.Deposit);
    expect(ix.data.readBigUInt64LE(1)).toBe(1_000_000_000n);
    expect(ix.data[9]).toBe(1);
  });
});
