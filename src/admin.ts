/**
 * Admin + settler + migration instruction builders.
 *
 * **Most consumers don't need these** — admin ixs are for ops tooling,
 * settle ixs run on the matcher's settler service, migration ixs run
 * once at program redeploy. Exposed for completeness so admin dashboards
 * and migration scripts can be built without the Rust SDK.
 *
 * Layouts mirror `crates/strata-chain/src/ix.rs` byte-for-byte.
 */

import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { IxTag, SPL_TOKEN_PROGRAM_ID } from "./constants.js";
import type { Side } from "./constants.js";

function packIx(tag: number, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), body]);
}

// ── Admin: register / remove / slash MMs ──────────────────────────

export interface AdminRegisterMmAccounts {
  programId: PublicKey;
  admin: PublicKey;
  market: PublicKey;
  mm: PublicKey;
  mmUserAccount: PublicKey;
  intentRecord: PublicKey;
}

export interface AdminRegisterMmArgs {
  side: Side;
  intentBump: number;
  stakeAmount: bigint;
  minPrice: bigint;
  maxPrice: bigint;
  maxFillSize: bigint;
  minSpreadBps: number;
}

export function adminRegisterMmIx(
  accounts: AdminRegisterMmAccounts,
  args: AdminRegisterMmArgs,
): TransactionInstruction {
  // Body: side(1) bump(1) pad(6) stake(8) min_price(8) max_price(8) max_fill(8) min_spread_bps(2) = 42 bytes
  const body = Buffer.alloc(42);
  body.writeUInt8(args.side, 0);
  body.writeUInt8(args.intentBump, 1);
  body.writeBigUInt64LE(args.stakeAmount, 8);
  body.writeBigUInt64LE(args.minPrice, 16);
  body.writeBigUInt64LE(args.maxPrice, 24);
  body.writeBigUInt64LE(args.maxFillSize, 32);
  body.writeUInt16LE(args.minSpreadBps, 40);
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.admin, isSigner: true, isWritable: true },
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.mm, isSigner: false, isWritable: false },
      { pubkey: accounts.mmUserAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.intentRecord, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: packIx(IxTag.AdminRegisterMm, body),
  });
}

export interface AdminRemoveMmAccounts {
  programId: PublicKey;
  admin: PublicKey;
  market: PublicKey;
  intentRecord: PublicKey;
  mmUserAccount: PublicKey;
}

export function adminRemoveMmIx(
  accounts: AdminRemoveMmAccounts,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.admin, isSigner: true, isWritable: false },
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.intentRecord, isSigner: false, isWritable: true },
      { pubkey: accounts.mmUserAccount, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([IxTag.AdminRemoveMm]),
  });
}

export interface AdminSlashMmAccounts {
  programId: PublicKey;
  admin: PublicKey;
  market: PublicKey;
  intentRecord: PublicKey;
  protocolVault: PublicKey;
}

export function adminSlashMmIx(
  accounts: AdminSlashMmAccounts,
  slashAmount: bigint,
): TransactionInstruction {
  const body = Buffer.alloc(8);
  body.writeBigUInt64LE(slashAmount, 0);
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.admin, isSigner: true, isWritable: false },
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.intentRecord, isSigner: false, isWritable: true },
      { pubkey: accounts.protocolVault, isSigner: false, isWritable: true },
    ],
    data: packIx(IxTag.AdminSlashMm, body),
  });
}

// ── MM-driven: bond_stake, claim_stake ────────────────────────────

export interface BondClaimAccounts {
  programId: PublicKey;
  mm: PublicKey;
  market: PublicKey;
  intentRecord: PublicKey;
  marketQuoteVault: PublicKey;
  mmQuoteToken: PublicKey;
}

export function bondStakeIx(
  accounts: BondClaimAccounts,
  amount: bigint,
): TransactionInstruction {
  const body = Buffer.alloc(8);
  body.writeBigUInt64LE(amount, 0);
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.mm, isSigner: true, isWritable: false },
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.intentRecord, isSigner: false, isWritable: true },
      { pubkey: accounts.mmQuoteToken, isSigner: false, isWritable: true },
      { pubkey: accounts.marketQuoteVault, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: packIx(IxTag.BondStake, body),
  });
}

export function claimStakeIx(
  accounts: BondClaimAccounts,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.mm, isSigner: true, isWritable: false },
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.intentRecord, isSigner: false, isWritable: true },
      { pubkey: accounts.marketQuoteVault, isSigner: false, isWritable: true },
      { pubkey: accounts.mmQuoteToken, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([IxTag.ClaimStake]),
  });
}

// ── Cranker: expired-order cleanup, RFQ-timeout ───────────────────

export interface CrankExpiredOrdersAccounts {
  programId: PublicKey;
  cranker: PublicKey;
  market: PublicKey;
  userAccount: PublicKey;
  order: PublicKey;
  rentReceiver: PublicKey;
}

export function crankExpiredOrdersIx(
  accounts: CrankExpiredOrdersAccounts,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.cranker, isSigner: true, isWritable: true },
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.userAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.order, isSigner: false, isWritable: true },
      { pubkey: accounts.rentReceiver, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([IxTag.CrankExpiredOrders]),
  });
}

export interface RecordRfqTimeoutAccounts {
  programId: PublicKey;
  market: PublicKey;
  intentRecord: PublicKey;
  settleAuthority: PublicKey;
  protocolVault: PublicKey;
}

/// IS-9: drives the auto-slash curve at consecutive_miss thresholds
/// 3/5/10/25 → 0.5%/1%/5%/25%. protocol_vault is required even on
/// sub-threshold misses (program no-ops the PV write).
export function recordRfqTimeoutIx(
  accounts: RecordRfqTimeoutAccounts,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.intentRecord, isSigner: false, isWritable: true },
      { pubkey: accounts.settleAuthority, isSigner: true, isWritable: false },
      { pubkey: accounts.protocolVault, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([IxTag.RecordRfqTimeout]),
  });
}

// ── Settler: settle_trade with optional Pyth ──────────────────────

export interface SettleTradeAccounts {
  programId: PublicKey;
  market: PublicKey;
  maker: PublicKey;
  takerOrder: PublicKey;
  makerUserAccount: PublicKey;
  takerUserAccount: PublicKey;
  protocolVault: PublicKey;
  settleAuthority: PublicKey;
  /** M6: required when maker's IntentRecord has min_spread_bps > 0. */
  pythPriceUpdate?: PublicKey;
}

export interface SettleTradeArgs {
  makerOrderId: bigint;
  takerOrderId: bigint;
  fillSize: bigint;
  settlePrice: bigint;
}

export function settleTradeIx(
  accounts: SettleTradeAccounts,
  args: SettleTradeArgs,
): TransactionInstruction {
  const body = Buffer.alloc(32);
  body.writeBigUInt64LE(args.makerOrderId, 0);
  body.writeBigUInt64LE(args.takerOrderId, 8);
  body.writeBigUInt64LE(args.fillSize, 16);
  body.writeBigUInt64LE(args.settlePrice, 24);
  const keys = [
    { pubkey: accounts.market, isSigner: false, isWritable: false },
    { pubkey: accounts.maker, isSigner: false, isWritable: true },
    { pubkey: accounts.takerOrder, isSigner: false, isWritable: true },
    { pubkey: accounts.makerUserAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.takerUserAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.protocolVault, isSigner: false, isWritable: true },
    { pubkey: accounts.settleAuthority, isSigner: true, isWritable: false },
  ];
  if (accounts.pythPriceUpdate) {
    keys.push({
      pubkey: accounts.pythPriceUpdate,
      isSigner: false,
      isWritable: false,
    });
  }
  return new TransactionInstruction({
    programId: accounts.programId,
    keys,
    data: packIx(IxTag.SettleTrade, body),
  });
}

// ── ProtocolVault withdraw (admin) ────────────────────────────────

export interface AdminWithdrawProtocolVaultAccounts {
  programId: PublicKey;
  admin: PublicKey;
  market: PublicKey;
  protocolVault: PublicKey;
  destination: PublicKey;
  /** 0 = base, 1 = quote */
}

export function adminWithdrawProtocolVaultIx(
  accounts: AdminWithdrawProtocolVaultAccounts,
  amount: bigint,
  asset: 0 | 1,
): TransactionInstruction {
  const body = Buffer.alloc(9);
  body.writeBigUInt64LE(amount, 0);
  body.writeUInt8(asset, 8);
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.admin, isSigner: true, isWritable: false },
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.protocolVault, isSigner: false, isWritable: true },
      { pubkey: accounts.destination, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: packIx(IxTag.WithdrawProtocolVault, body),
  });
}

// ── Migrations ────────────────────────────────────────────────────

export function migrateMarketV2Ix(
  programId: PublicKey,
  admin: PublicKey,
  market: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: admin, isSigner: true, isWritable: false },
      { pubkey: market, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([IxTag.MigrateMarketV2]),
  });
}

export function migrateIntentV2Ix(
  programId: PublicKey,
  admin: PublicKey,
  market: PublicKey,
  intentRecord: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: admin, isSigner: true, isWritable: false },
      { pubkey: market, isSigner: false, isWritable: false },
      { pubkey: intentRecord, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([IxTag.MigrateIntentV2]),
  });
}

export function migrateIntentV3Ix(
  programId: PublicKey,
  admin: PublicKey,
  market: PublicKey,
  intentRecord: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: admin, isSigner: true, isWritable: false },
      { pubkey: market, isSigner: false, isWritable: false },
      { pubkey: intentRecord, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([IxTag.MigrateIntentV3]),
  });
}

// ── Streaming-lane: set_quote_signer + settle_trade_with_signed_quote ─

export interface SetQuoteSignerAccounts {
  programId: PublicKey;
  mm: PublicKey;
  market: PublicKey;
  intentRecord: PublicKey;
}

export function setQuoteSignerIx(
  accounts: SetQuoteSignerAccounts,
  /** 64-byte secp256k1 pubkey. */
  quoteSigner: Buffer,
): TransactionInstruction {
  if (quoteSigner.length !== 64) {
    throw new Error(`quoteSigner must be 64 bytes, got ${quoteSigner.length}`);
  }
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.mm, isSigner: true, isWritable: false },
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.intentRecord, isSigner: false, isWritable: true },
    ],
    data: packIx(IxTag.SetQuoteSigner, quoteSigner),
  });
}
