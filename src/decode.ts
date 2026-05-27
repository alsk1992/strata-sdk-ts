/**
 * Account decoders. Hand-written byte readers — no anchor / borsh
 * dependency, since the on-chain program uses C-repr structs.
 *
 * Layouts mirror `crates/strata-types/src/lib.rs`. **If those change
 * (account version migration), update the offsets here in lockstep.**
 *
 * v0.2 — full decoders including all v2/v3 fields, IDs verified against
 * the Rust source's `core::mem::size_of` assertions.
 */

import { PublicKey } from "@solana/web3.js";
import {
  AccountKind,
  INTENT_RECORD_SIZE,
  USER_ACCOUNT_SIZE,
  MARKET_SIZE,
  ORDER_SIZE,
  PROTOCOL_VAULT_SIZE,
} from "./constants.js";

export class DecodeError extends Error {
  constructor(
    public readonly cause: DecodeErrorCause,
    msg: string,
  ) {
    super(msg);
    this.name = "DecodeError";
  }
}

export type DecodeErrorCause =
  | "Truncated"
  | "WrongAccountKind"
  | "Other";

function checkKind(
  data: Buffer,
  expected: number,
  expectedSize: number,
): void {
  if (data.length < expectedSize) {
    throw new DecodeError(
      "Truncated",
      `account too short: have ${data.length}, need ${expectedSize}`,
    );
  }
  if (data[0] !== expected) {
    throw new DecodeError(
      "WrongAccountKind",
      `account kind mismatch: have ${data[0]}, want ${expected}`,
    );
  }
}

function readPubkey(data: Buffer, offset: number): PublicKey {
  return new PublicKey(data.subarray(offset, offset + 32));
}

function readU64(data: Buffer, offset: number): bigint {
  return data.readBigUInt64LE(offset);
}

function readU32(data: Buffer, offset: number): number {
  return data.readUInt32LE(offset);
}

function readU16(data: Buffer, offset: number): number {
  return data.readUInt16LE(offset);
}

function readI32(data: Buffer, offset: number): number {
  return data.readInt32LE(offset);
}

function readU8(data: Buffer, offset: number): number {
  return data.readUInt8(offset);
}

// ── UserAccount (160 bytes) ────────────────────────────────────────

export interface UserAccountDecoded {
  kind: number;
  bump: number;
  owner: PublicKey;
  market: PublicKey;
  baseBalance: bigint;
  quoteBalance: bigint;
  baseLocked: bigint;
  quoteLocked: bigint;
  openOrders: number;
  lifetimeFilledBase: bigint;
  lifetimeFilledQuote: bigint;
  lifetimeFeesPaid: bigint;
  nextOrderNonce: bigint;
  baseIntentReserved: bigint;
  quoteIntentReserved: bigint;
}

export function decodeUserAccount(data: Buffer): UserAccountDecoded {
  checkKind(data, AccountKind.UserAccount, USER_ACCOUNT_SIZE);
  return {
    kind: readU8(data, 0),
    bump: readU8(data, 1),
    // 6 bytes pad
    owner: readPubkey(data, 8),
    market: readPubkey(data, 40),
    baseBalance: readU64(data, 72),
    quoteBalance: readU64(data, 80),
    baseLocked: readU64(data, 88),
    quoteLocked: readU64(data, 96),
    openOrders: readU32(data, 104),
    // 4 bytes pad
    lifetimeFilledBase: readU64(data, 112),
    lifetimeFilledQuote: readU64(data, 120),
    lifetimeFeesPaid: readU64(data, 128),
    nextOrderNonce: readU64(data, 136),
    baseIntentReserved: readU64(data, 144),
    quoteIntentReserved: readU64(data, 152),
  };
}

// ── Order (160 bytes) ──────────────────────────────────────────────

export interface OrderDecoded {
  kind: number;
  bump: number;
  side: number;
  orderType: number;
  status: number;
  orderId: bigint;
  owner: PublicKey;
  market: PublicKey;
  userAccount: PublicKey;
  price: bigint;
  size: bigint;
  remainingSize: bigint;
  placedSlot: bigint;
  expirySlot: bigint;
  quoteLockedRemaining: bigint;
}

export function decodeOrder(data: Buffer): OrderDecoded {
  checkKind(data, AccountKind.Order, ORDER_SIZE);
  return {
    kind: readU8(data, 0),
    bump: readU8(data, 1),
    side: readU8(data, 2),
    orderType: readU8(data, 3),
    status: readU8(data, 4),
    // 3 bytes pad (5..8)
    orderId: readU64(data, 8),
    owner: readPubkey(data, 16),
    market: readPubkey(data, 48),
    userAccount: readPubkey(data, 80),
    price: readU64(data, 112),
    size: readU64(data, 120),
    remainingSize: readU64(data, 128),
    placedSlot: readU64(data, 136),
    expirySlot: readU64(data, 144),
    quoteLockedRemaining: readU64(data, 152),
  };
}

// ── IntentRecord (368 bytes — v3 layout) ───────────────────────────

export interface IntentRecordDecoded {
  kind: number;
  bump: number;
  active: number;
  side: number;
  mm: PublicKey;
  market: PublicKey;
  userAccount: PublicKey;
  stakeAmount: bigint;
  minPrice: bigint;
  maxPrice: bigint;
  minSpreadBps: number;
  maxFillSize: bigint;
  totalRfqs: bigint;
  successfulFills: bigint;
  missedRfqs: bigint;
  reputation: number;
  lastActiveSlot: bigint;
  registeredSlot: bigint;
  revokedAtSlot: bigint;
  // v2
  tierWindowModifierMs: number;
  delegate: PublicKey;
  lifetimeFilledQuote: bigint;
  distinctCounterparties: number;
  consecutiveMisses: number;
  recentAvgLatencyMs: number;
  weightedAvgSpreadBps: number;
  epochStartStake: bigint;
  epochSlashedAmount: bigint;
  lastSettleSlot: bigint;
  bloomCounterparties: Buffer;
  // v3 (streaming-lane HFT path)
  quoteSigner: Buffer;
  lastUsedNonce: bigint;
}

export function decodeIntentRecord(data: Buffer): IntentRecordDecoded {
  checkKind(data, AccountKind.IntentRecord, INTENT_RECORD_SIZE);
  return {
    kind: readU8(data, 0),
    bump: readU8(data, 1),
    active: readU8(data, 2),
    side: readU8(data, 3),
    // 4 bytes pad
    mm: readPubkey(data, 8),
    market: readPubkey(data, 40),
    userAccount: readPubkey(data, 72),
    stakeAmount: readU64(data, 104),
    minPrice: readU64(data, 112),
    maxPrice: readU64(data, 120),
    minSpreadBps: readU16(data, 128),
    // 6 bytes pad
    maxFillSize: readU64(data, 136),
    totalRfqs: readU64(data, 144),
    successfulFills: readU64(data, 152),
    missedRfqs: readU64(data, 160),
    reputation: readU16(data, 168),
    // 6 bytes pad
    lastActiveSlot: readU64(data, 176),
    registeredSlot: readU64(data, 184),
    revokedAtSlot: readU64(data, 192),
    // v2
    tierWindowModifierMs: readI32(data, 200),
    // 4 bytes pad
    delegate: readPubkey(data, 208),
    lifetimeFilledQuote: readU64(data, 240),
    distinctCounterparties: readU16(data, 248),
    consecutiveMisses: readU16(data, 250),
    recentAvgLatencyMs: readU16(data, 252),
    weightedAvgSpreadBps: readU16(data, 254),
    epochStartStake: readU64(data, 256),
    epochSlashedAmount: readU64(data, 264),
    lastSettleSlot: readU64(data, 272),
    bloomCounterparties: Buffer.from(data.subarray(280, 296)),
    // v3
    quoteSigner: Buffer.from(data.subarray(296, 360)),
    lastUsedNonce: readU64(data, 360),
  };
}

// ── Market (384 bytes — v2 layout) ─────────────────────────────────

export interface MarketDecoded {
  kind: number;
  bump: number;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  tickSize: bigint;
  baseLotSize: bigint;
  quoteLotSize: bigint;
  takerFeeBps: number;
  makerRebateBps: number;
  settleAuthority: PublicKey;
  admin: PublicKey;
  paused: number;
  totalOrdersPlaced: bigint;
  totalTradesSettled: bigint;
  pythFeedId: Buffer;
  avlMaxSlippageBps: number;
  oracleMaxAgeSecs: number;
  baseDecimals: number;
  quoteDecimals: number;
  // v2
  allowedPythAuthority: PublicKey;
  pythFeedIdPending: Buffer;
  pythPendingProposedSlot: bigint;
  l2WindowMs: number;
}

export function decodeMarket(data: Buffer): MarketDecoded {
  checkKind(data, AccountKind.Market, MARKET_SIZE);
  return {
    kind: readU8(data, 0),
    bump: readU8(data, 1),
    // 6 bytes pad
    baseMint: readPubkey(data, 8),
    quoteMint: readPubkey(data, 40),
    baseVault: readPubkey(data, 72),
    quoteVault: readPubkey(data, 104),
    tickSize: readU64(data, 136),
    baseLotSize: readU64(data, 144),
    quoteLotSize: readU64(data, 152),
    takerFeeBps: readU16(data, 160),
    makerRebateBps: readU16(data, 162),
    // 4 bytes pad
    settleAuthority: readPubkey(data, 168),
    admin: readPubkey(data, 200),
    paused: readU8(data, 232),
    // 7 bytes pad
    totalOrdersPlaced: readU64(data, 240),
    totalTradesSettled: readU64(data, 248),
    pythFeedId: Buffer.from(data.subarray(256, 288)),
    avlMaxSlippageBps: readU16(data, 288),
    // 6 bytes pad
    oracleMaxAgeSecs: readU32(data, 296),
    baseDecimals: readU8(data, 300),
    quoteDecimals: readU8(data, 301),
    // 2 bytes pad
    // v2
    allowedPythAuthority: readPubkey(data, 304),
    pythFeedIdPending: Buffer.from(data.subarray(336, 368)),
    pythPendingProposedSlot: readU64(data, 368),
    l2WindowMs: readU32(data, 376),
  };
}

// ── ProtocolVault (120 bytes) ──────────────────────────────────────

export interface ProtocolVaultDecoded {
  kind: number;
  bump: number;
  market: PublicKey;
  admin: PublicKey;
  baseBalance: bigint;
  quoteBalance: bigint;
  totalCapturedQuote: bigint;
  fillCount: bigint;
  /** Legacy storage field; no longer accrues. Decode for layout parity. */
  legacyReferralEarned: bigint;
  takerFeesAccrued: bigint;
}

export function decodeProtocolVault(data: Buffer): ProtocolVaultDecoded {
  checkKind(data, AccountKind.ProtocolVault, PROTOCOL_VAULT_SIZE);
  return {
    kind: readU8(data, 0),
    bump: readU8(data, 1),
    // 6 bytes pad
    market: readPubkey(data, 8),
    admin: readPubkey(data, 40),
    baseBalance: readU64(data, 72),
    quoteBalance: readU64(data, 80),
    totalCapturedQuote: readU64(data, 88),
    fillCount: readU64(data, 96),
    legacyReferralEarned: readU64(data, 104),
    takerFeesAccrued: readU64(data, 112),
  };
}
