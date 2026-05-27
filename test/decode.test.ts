import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  decodeUserAccount,
  decodeIntentRecord,
  decodeMarket,
  DecodeError,
} from "../src/decode.js";
import {
  AccountKind,
  INTENT_RECORD_SIZE,
  USER_ACCOUNT_SIZE,
  MARKET_SIZE,
} from "../src/constants.js";

describe("decoders", () => {
  it("rejects too-short data", () => {
    const tiny = Buffer.alloc(10);
    expect(() => decodeUserAccount(tiny)).toThrow(DecodeError);
  });

  it("rejects wrong account kind", () => {
    const buf = Buffer.alloc(USER_ACCOUNT_SIZE);
    buf[0] = AccountKind.Market; // wrong kind for UserAccount decoder
    expect(() => decodeUserAccount(buf)).toThrow(/kind mismatch/);
  });

  it("decodes a synthetic UserAccount", () => {
    const buf = Buffer.alloc(USER_ACCOUNT_SIZE);
    buf[0] = AccountKind.UserAccount;
    buf[1] = 254; // bump
    // owner @ 8..40
    const owner = PublicKey.unique();
    owner.toBuffer().copy(buf, 8);
    // market @ 40..72
    const market = PublicKey.unique();
    market.toBuffer().copy(buf, 40);
    // baseBalance @ 72
    buf.writeBigUInt64LE(1_000_000_000n, 72);
    buf.writeBigUInt64LE(50_000_000n, 80);
    buf.writeBigUInt64LE(500_000_000n, 88);
    buf.writeBigUInt64LE(25_000_000n, 96);

    const ua = decodeUserAccount(buf);
    expect(ua.kind).toBe(AccountKind.UserAccount);
    expect(ua.bump).toBe(254);
    expect(ua.owner.toBase58()).toBe(owner.toBase58());
    expect(ua.market.toBase58()).toBe(market.toBase58());
    expect(ua.baseBalance).toBe(1_000_000_000n);
    expect(ua.quoteBalance).toBe(50_000_000n);
    expect(ua.baseLocked).toBe(500_000_000n);
    expect(ua.quoteLocked).toBe(25_000_000n);
  });

  it("decodes IntentRecord v2 fields including consecutive_misses", () => {
    const buf = Buffer.alloc(INTENT_RECORD_SIZE);
    buf[0] = AccountKind.IntentRecord;
    buf[1] = 253; // bump
    buf[2] = 1; // active
    buf[3] = 0; // side = Buy
    PublicKey.unique().toBuffer().copy(buf, 8); // mm
    PublicKey.unique().toBuffer().copy(buf, 40); // market
    PublicKey.unique().toBuffer().copy(buf, 72); // userAccount
    buf.writeBigUInt64LE(1_000_000_000n, 104); // stake
    buf.writeBigUInt64LE(99_000n, 112); // min_price
    buf.writeBigUInt64LE(101_000n, 120); // max_price
    buf.writeUInt16LE(25, 128); // min_spread_bps
    buf.writeBigUInt64LE(50_000_000n, 136); // max_fill_size
    buf.writeBigUInt64LE(120n, 144); // total_rfqs
    buf.writeBigUInt64LE(100n, 152); // successful_fills
    buf.writeBigUInt64LE(20n, 160); // missed_rfqs
    buf.writeUInt16LE(7500, 168); // reputation
    buf.writeBigUInt64LE(123_000n, 176); // last_active_slot
    buf.writeBigUInt64LE(100_000n, 184); // registered_slot
    // v2:
    buf.writeInt32LE(-1000, 200); // tier_window_modifier_ms (Gold)
    PublicKey.unique().toBuffer().copy(buf, 208); // delegate
    buf.writeBigUInt64LE(500_000_000_000n, 240); // lifetime_filled_quote
    buf.writeUInt16LE(42, 248); // distinct_counterparties
    buf.writeUInt16LE(3, 250); // consecutive_misses
    buf.writeUInt16LE(420, 252); // recent_avg_latency_ms
    buf.writeUInt16LE(20, 254); // weighted_avg_spread_bps
    buf.writeBigUInt64LE(1_000_000_000n, 256); // epoch_start_stake
    buf.writeBigUInt64LE(50_000_000n, 264); // epoch_slashed_amount
    buf.writeBigUInt64LE(123_456n, 272); // last_settle_slot

    const rec = decodeIntentRecord(buf);
    expect(rec.active).toBe(1);
    expect(rec.side).toBe(0);
    expect(rec.stakeAmount).toBe(1_000_000_000n);
    expect(rec.reputation).toBe(7500);
    expect(rec.tierWindowModifierMs).toBe(-1000);
    expect(rec.consecutiveMisses).toBe(3);
    expect(rec.epochSlashedAmount).toBe(50_000_000n);
  });

  it("decodes a synthetic Market", () => {
    const buf = Buffer.alloc(MARKET_SIZE);
    buf[0] = AccountKind.Market;
    buf[1] = 252; // bump
    buf[2] = 0; // not paused
    PublicKey.unique().toBuffer().copy(buf, 8); // admin
    PublicKey.unique().toBuffer().copy(buf, 40); // base mint
    PublicKey.unique().toBuffer().copy(buf, 72); // quote mint
    PublicKey.unique().toBuffer().copy(buf, 104); // base vault
    PublicKey.unique().toBuffer().copy(buf, 136); // quote vault
    PublicKey.unique().toBuffer().copy(buf, 168); // protocol vault
    buf.writeBigUInt64LE(10_000n, 200); // tick_size
    buf.writeBigUInt64LE(1_000_000_000n, 208); // base_lot_size
    buf.writeBigUInt64LE(1n, 216); // quote_lot_size
    buf.writeUInt16LE(10, 224); // taker_fee_bps

    const m = decodeMarket(buf);
    expect(m.kind).toBe(AccountKind.Market);
    expect(m.paused).toBe(0);
    expect(m.tickSize).toBe(10_000n);
    expect(m.baseLotSize).toBe(1_000_000_000n);
    expect(m.takerFeeBps).toBe(10);
  });
});
