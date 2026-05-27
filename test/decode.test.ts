import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  decodeUserAccount,
  decodeIntentRecord,
  decodeMarket,
  decodeOrder,
  decodeProtocolVault,
  DecodeError,
} from "../src/decode.js";
import {
  AccountKind,
  INTENT_RECORD_SIZE,
  USER_ACCOUNT_SIZE,
  MARKET_SIZE,
  ORDER_SIZE,
  PROTOCOL_VAULT_SIZE,
} from "../src/constants.js";

describe("decoders", () => {
  it("rejects too-short data with Truncated cause", () => {
    const tiny = Buffer.alloc(10);
    try {
      decodeUserAccount(tiny);
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(DecodeError);
      expect((e as DecodeError).cause).toBe("Truncated");
    }
  });

  it("rejects wrong account kind with WrongAccountKind cause", () => {
    const buf = Buffer.alloc(USER_ACCOUNT_SIZE);
    buf[0] = AccountKind.Market;
    try {
      decodeUserAccount(buf);
      expect.fail("expected throw");
    } catch (e) {
      expect((e as DecodeError).cause).toBe("WrongAccountKind");
    }
  });

  it("decodes a synthetic UserAccount including v2 fields", () => {
    const buf = Buffer.alloc(USER_ACCOUNT_SIZE);
    buf[0] = AccountKind.UserAccount;
    buf[1] = 254;
    const owner = PublicKey.unique();
    owner.toBuffer().copy(buf, 8);
    const market = PublicKey.unique();
    market.toBuffer().copy(buf, 40);
    buf.writeBigUInt64LE(1_000_000_000n, 72);
    buf.writeBigUInt64LE(50_000_000n, 80);
    buf.writeBigUInt64LE(500_000_000n, 88);
    buf.writeBigUInt64LE(25_000_000n, 96);
    buf.writeUInt32LE(3, 104); // openOrders
    buf.writeBigUInt64LE(2_000_000_000n, 112); // lifetimeFilledBase
    buf.writeBigUInt64LE(15_000n, 120); // lifetimeFilledQuote
    buf.writeBigUInt64LE(150n, 128); // lifetimeFeesPaid
    buf.writeBigUInt64LE(42n, 136); // nextOrderNonce

    const ua = decodeUserAccount(buf);
    expect(ua.kind).toBe(AccountKind.UserAccount);
    expect(ua.bump).toBe(254);
    expect(ua.owner.toBase58()).toBe(owner.toBase58());
    expect(ua.market.toBase58()).toBe(market.toBase58());
    expect(ua.baseBalance).toBe(1_000_000_000n);
    expect(ua.openOrders).toBe(3);
    expect(ua.lifetimeFilledBase).toBe(2_000_000_000n);
    expect(ua.nextOrderNonce).toBe(42n);
  });

  it("decodes an Order with all fields", () => {
    const buf = Buffer.alloc(ORDER_SIZE);
    buf[0] = AccountKind.Order;
    buf[1] = 253;
    buf[2] = 1; // side = Sell
    buf[3] = 0; // orderType = Limit
    buf[4] = 1; // status = Active
    buf.writeBigUInt64LE(99n, 8); // orderId
    const owner = PublicKey.unique();
    owner.toBuffer().copy(buf, 16);
    PublicKey.unique().toBuffer().copy(buf, 48); // market
    PublicKey.unique().toBuffer().copy(buf, 80); // userAccount
    buf.writeBigUInt64LE(150_000_000n, 112); // price
    buf.writeBigUInt64LE(1_000_000_000n, 120); // size
    buf.writeBigUInt64LE(500_000_000n, 128); // remaining
    buf.writeBigUInt64LE(100n, 136); // placed_slot
    buf.writeBigUInt64LE(200n, 144); // expiry_slot

    const o = decodeOrder(buf);
    expect(o.kind).toBe(AccountKind.Order);
    expect(o.side).toBe(1);
    expect(o.status).toBe(1);
    expect(o.orderId).toBe(99n);
    expect(o.owner.toBase58()).toBe(owner.toBase58());
    expect(o.price).toBe(150_000_000n);
    expect(o.size).toBe(1_000_000_000n);
    expect(o.remainingSize).toBe(500_000_000n);
  });

  it("decodes IntentRecord v3 — incl. quote_signer + last_used_nonce", () => {
    const buf = Buffer.alloc(INTENT_RECORD_SIZE);
    buf[0] = AccountKind.IntentRecord;
    buf[1] = 253;
    buf[2] = 1; // active
    buf[3] = 0; // side = Buy
    PublicKey.unique().toBuffer().copy(buf, 8);
    PublicKey.unique().toBuffer().copy(buf, 40);
    PublicKey.unique().toBuffer().copy(buf, 72);
    buf.writeBigUInt64LE(1_000_000_000n, 104); // stake
    buf.writeUInt16LE(25, 128); // min_spread_bps
    buf.writeBigUInt64LE(50_000_000n, 136); // max_fill_size
    buf.writeBigUInt64LE(120n, 144);
    buf.writeBigUInt64LE(100n, 152);
    buf.writeBigUInt64LE(20n, 160);
    buf.writeUInt16LE(7500, 168); // reputation
    buf.writeBigUInt64LE(100_000n, 184); // registered_slot
    buf.writeInt32LE(-1000, 200); // tier_window_modifier_ms (Gold)
    PublicKey.unique().toBuffer().copy(buf, 208); // delegate
    buf.writeUInt16LE(3, 250); // consecutive_misses
    buf.writeBigUInt64LE(1_000_000_000n, 256); // epoch_start_stake
    buf.writeBigUInt64LE(50_000_000n, 264); // epoch_slashed_amount
    // v3: quote_signer at 296..360 (64 bytes); last_used_nonce at 360..368
    for (let i = 0; i < 64; i++) buf[296 + i] = i;
    buf.writeBigUInt64LE(42n, 360);

    const rec = decodeIntentRecord(buf);
    expect(rec.active).toBe(1);
    expect(rec.reputation).toBe(7500);
    expect(rec.tierWindowModifierMs).toBe(-1000);
    expect(rec.consecutiveMisses).toBe(3);
    expect(rec.epochSlashedAmount).toBe(50_000_000n);
    expect(rec.quoteSigner.length).toBe(64);
    expect(rec.quoteSigner[0]).toBe(0);
    expect(rec.quoteSigner[63]).toBe(63);
    expect(rec.lastUsedNonce).toBe(42n);
  });

  it("decodes a Market with all v2 fields (decimals + Pyth feed)", () => {
    const buf = Buffer.alloc(MARKET_SIZE);
    buf[0] = AccountKind.Market;
    buf[1] = 252;
    const baseMint = PublicKey.unique();
    baseMint.toBuffer().copy(buf, 8);
    PublicKey.unique().toBuffer().copy(buf, 40); // quoteMint
    PublicKey.unique().toBuffer().copy(buf, 72); // baseVault
    PublicKey.unique().toBuffer().copy(buf, 104); // quoteVault
    buf.writeBigUInt64LE(10_000n, 136); // tick_size
    buf.writeBigUInt64LE(1_000_000_000n, 144); // base_lot_size
    buf.writeBigUInt64LE(1n, 152); // quote_lot_size
    buf.writeUInt16LE(10, 160); // taker_fee_bps
    buf.writeUInt16LE(0, 162); // maker_rebate_bps
    PublicKey.unique().toBuffer().copy(buf, 168); // settle_authority
    PublicKey.unique().toBuffer().copy(buf, 200); // admin
    buf[232] = 0; // paused = false
    buf.writeBigUInt64LE(123n, 240); // total_orders_placed
    buf.writeBigUInt64LE(456n, 248); // total_trades_settled
    // pyth_feed_id at 256..288
    for (let i = 0; i < 32; i++) buf[256 + i] = 0xab;
    buf.writeUInt16LE(200, 288); // avl_max_slippage_bps
    buf.writeUInt32LE(60, 296); // oracle_max_age_secs
    buf.writeUInt8(9, 300); // base_decimals (SOL)
    buf.writeUInt8(6, 301); // quote_decimals (USDC)
    PublicKey.unique().toBuffer().copy(buf, 304); // allowed_pyth_authority
    buf.writeUInt32LE(1500, 376); // l2_window_ms

    const m = decodeMarket(buf);
    expect(m.baseMint.toBase58()).toBe(baseMint.toBase58());
    expect(m.tickSize).toBe(10_000n);
    expect(m.baseLotSize).toBe(1_000_000_000n);
    expect(m.takerFeeBps).toBe(10);
    expect(m.paused).toBe(0);
    expect(m.totalOrdersPlaced).toBe(123n);
    expect(m.totalTradesSettled).toBe(456n);
    expect(m.avlMaxSlippageBps).toBe(200);
    expect(m.oracleMaxAgeSecs).toBe(60);
    expect(m.baseDecimals).toBe(9);
    expect(m.quoteDecimals).toBe(6);
    expect(m.l2WindowMs).toBe(1500);
    // pyth_feed_id roundtrip
    expect(m.pythFeedId.length).toBe(32);
    expect(m.pythFeedId[0]).toBe(0xab);
  });

  it("decodes a ProtocolVault including the legacy + accrued fields", () => {
    const buf = Buffer.alloc(PROTOCOL_VAULT_SIZE);
    buf[0] = AccountKind.ProtocolVault;
    buf[1] = 251;
    PublicKey.unique().toBuffer().copy(buf, 8);
    PublicKey.unique().toBuffer().copy(buf, 40);
    buf.writeBigUInt64LE(100_000_000n, 72);
    buf.writeBigUInt64LE(50_000_000n, 80);
    buf.writeBigUInt64LE(1_000_000n, 88);
    buf.writeBigUInt64LE(99n, 96);
    buf.writeBigUInt64LE(0n, 104); // legacy referral
    buf.writeBigUInt64LE(7_500_000n, 112); // taker fees

    const v = decodeProtocolVault(buf);
    expect(v.kind).toBe(AccountKind.ProtocolVault);
    expect(v.baseBalance).toBe(100_000_000n);
    expect(v.fillCount).toBe(99n);
    expect(v.legacyReferralEarned).toBe(0n);
    expect(v.takerFeesAccrued).toBe(7_500_000n);
  });
});
