/**
 * Account decoders. Hand-written byte readers — no anchor / borsh
 * dependency, since the on-chain program uses C-repr structs.
 *
 * Layouts mirror `crates/strata-types/src/lib.rs`. **If those change
 * (account version migration), update the offsets here in lockstep.**
 */

import { PublicKey } from "@solana/web3.js";
import {
  AccountKind,
  INTENT_RECORD_SIZE,
  USER_ACCOUNT_SIZE,
  MARKET_SIZE,
  PROTOCOL_VAULT_SIZE,
} from "./constants.js";

export class DecodeError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "DecodeError";
  }
}

function checkKind(data: Buffer, expected: number, expectedSize: number): void {
  if (data.length < expectedSize) {
    throw new DecodeError(
      `account too short: have ${data.length}, need ${expectedSize}`,
    );
  }
  if (data[0] !== expected) {
    throw new DecodeError(
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

function readU16(data: Buffer, offset: number): number {
  return data.readUInt16LE(offset);
}

function readI32(data: Buffer, offset: number): number {
  return data.readInt32LE(offset);
}

// ── UserAccount ────────────────────────────────────────────────────

export interface UserAccountDecoded {
  kind: number;
  bump: number;
  owner: PublicKey;
  market: PublicKey;
  baseBalance: bigint;
  quoteBalance: bigint;
  baseLocked: bigint;
  quoteLocked: bigint;
}

/** Decode a `UserAccount` PDA's data field. */
export function decodeUserAccount(data: Buffer): UserAccountDecoded {
  checkKind(data, AccountKind.UserAccount, USER_ACCOUNT_SIZE);
  return {
    kind: data[0]!,
    bump: data[1]!,
    // 6 bytes pad
    owner: readPubkey(data, 8),
    market: readPubkey(data, 40),
    baseBalance: readU64(data, 72),
    quoteBalance: readU64(data, 80),
    baseLocked: readU64(data, 88),
    quoteLocked: readU64(data, 96),
  };
}

// ── IntentRecord ──────────────────────────────────────────────────

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
  // v2 fields
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
}

export function decodeIntentRecord(data: Buffer): IntentRecordDecoded {
  checkKind(data, AccountKind.IntentRecord, INTENT_RECORD_SIZE);
  return {
    kind: data[0]!,
    bump: data[1]!,
    active: data[2]!,
    side: data[3]!,
    // 4 bytes pad (offset 4..8)
    mm: readPubkey(data, 8),
    market: readPubkey(data, 40),
    userAccount: readPubkey(data, 72),
    stakeAmount: readU64(data, 104),
    minPrice: readU64(data, 112),
    maxPrice: readU64(data, 120),
    minSpreadBps: readU16(data, 128),
    // 6 bytes pad (130..136)
    maxFillSize: readU64(data, 136),
    totalRfqs: readU64(data, 144),
    successfulFills: readU64(data, 152),
    missedRfqs: readU64(data, 160),
    reputation: readU16(data, 168),
    // 6 bytes pad (170..176)
    lastActiveSlot: readU64(data, 176),
    registeredSlot: readU64(data, 184),
    revokedAtSlot: readU64(data, 192),
    // v2 starts at offset 200
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
    // 16 bytes bloom_counterparties at 280..296
    // v3: quote_signer (64 bytes) at 296..360, last_used_nonce at 360..368
    // (we skip these — MM bot doesn't need to decode them)
  };
}

// ── Market ────────────────────────────────────────────────────────

export interface MarketDecoded {
  kind: number;
  bump: number;
  paused: number;
  admin: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  protocolVault: PublicKey;
  tickSize: bigint;
  baseLotSize: bigint;
  quoteLotSize: bigint;
  takerFeeBps: number;
}

export function decodeMarket(data: Buffer): MarketDecoded {
  checkKind(data, AccountKind.Market, MARKET_SIZE);
  return {
    kind: data[0]!,
    bump: data[1]!,
    paused: data[2]!,
    // 5 bytes pad
    admin: readPubkey(data, 8),
    baseMint: readPubkey(data, 40),
    quoteMint: readPubkey(data, 72),
    baseVault: readPubkey(data, 104),
    quoteVault: readPubkey(data, 136),
    protocolVault: readPubkey(data, 168),
    tickSize: readU64(data, 200),
    baseLotSize: readU64(data, 208),
    quoteLotSize: readU64(data, 216),
    takerFeeBps: readU16(data, 224),
    // many more fields follow (decimals, Pyth feed, slippage caps, ...)
    // exposed via the .raw buffer if a consumer needs them.
  };
}

// ── ProtocolVault ─────────────────────────────────────────────────

export interface ProtocolVaultDecoded {
  kind: number;
  bump: number;
  market: PublicKey;
  admin: PublicKey;
  baseBalance: bigint;
  quoteBalance: bigint;
  totalCapturedQuote: bigint;
  fillCount: bigint;
}

export function decodeProtocolVault(data: Buffer): ProtocolVaultDecoded {
  checkKind(data, AccountKind.ProtocolVault, PROTOCOL_VAULT_SIZE);
  return {
    kind: data[0]!,
    bump: data[1]!,
    // 6 bytes pad
    market: readPubkey(data, 8),
    admin: readPubkey(data, 40),
    baseBalance: readU64(data, 72),
    quoteBalance: readU64(data, 80),
    totalCapturedQuote: readU64(data, 88),
    fillCount: readU64(data, 96),
  };
}
