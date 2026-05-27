/**
 * Instruction builders. Parameterised — no global market / program ID.
 *
 * Canonical layouts mirror the on-chain `program-rust/src/ix/*.rs`. If
 * the on-chain account orderings change, this file MUST be updated in
 * lockstep or txs revert at submit time.
 */

import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { IxTag, SPL_TOKEN_PROGRAM_ID } from "./constants.js";
import type { Side, OrderType } from "./constants.js";

function packIx(tag: number, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), body]);
}

// ── User account lifecycle ─────────────────────────────────────────

export interface InitUserAccountAccounts {
  programId: PublicKey;
  payer: PublicKey;
  market: PublicKey;
  userAccount: PublicKey;
}

export function initUserAccountIx(
  accounts: InitUserAccountAccounts,
  bump: number,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.payer, isSigner: true, isWritable: true },
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.userAccount, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: packIx(IxTag.InitUserAccount, Buffer.from([bump])),
  });
}

// ── Deposit / Withdraw ─────────────────────────────────────────────

export interface DepositWithdrawAccounts {
  programId: PublicKey;
  owner: PublicKey;
  market: PublicKey;
  userAccount: PublicKey;
  userTokenAccount: PublicKey;
  marketVault: PublicKey;
}

export function depositIx(
  accounts: DepositWithdrawAccounts,
  amount: bigint,
  /** 0 = base, 1 = quote */
  asset: 0 | 1,
): TransactionInstruction {
  const body = Buffer.alloc(9);
  body.writeBigUInt64LE(amount);
  body.writeUInt8(asset, 8);
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.owner, isSigner: true, isWritable: true },
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.userAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.marketVault, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: packIx(IxTag.Deposit, body),
  });
}

export function withdrawIx(
  accounts: DepositWithdrawAccounts,
  amount: bigint,
  asset: 0 | 1,
): TransactionInstruction {
  const body = Buffer.alloc(9);
  body.writeBigUInt64LE(amount);
  body.writeUInt8(asset, 8);
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.owner, isSigner: true, isWritable: true },
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.userAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.marketVault, isSigner: false, isWritable: true },
      { pubkey: accounts.userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: packIx(IxTag.Withdraw, body),
  });
}

// ── L1 limit orders ────────────────────────────────────────────────

export interface PlaceOrderAccounts {
  programId: PublicKey;
  owner: PublicKey;
  market: PublicKey;
  userAccount: PublicKey;
  orderPda: PublicKey;
}

export interface PlaceOrderArgs {
  side: Side;
  orderType: OrderType;
  price: bigint;
  size: bigint;
  expirySlot: bigint;
  orderBump: number;
}

export function placeOrderIx(
  accounts: PlaceOrderAccounts,
  args: PlaceOrderArgs,
): TransactionInstruction {
  return placeOrderBuild(IxTag.PlaceOrder, accounts, args);
}

/** Vault-mode variant: same wire layout, tag 33. The order PDA must be
 *  pre-funded with rent-exempt lamports BEFORE this ix runs. */
export function placeOrderForOwnerIx(
  accounts: PlaceOrderAccounts,
  args: PlaceOrderArgs,
): TransactionInstruction {
  return placeOrderBuild(IxTag.PlaceOrderForOwner, accounts, args);
}

function placeOrderBuild(
  tag: number,
  accounts: PlaceOrderAccounts,
  args: PlaceOrderArgs,
): TransactionInstruction {
  const body = Buffer.alloc(29);
  let off = 0;
  body.writeUInt8(args.side, off); off += 1;
  body.writeUInt8(args.orderType, off); off += 1;
  off += 2; // pad
  body.writeBigUInt64LE(args.price, off); off += 8;
  body.writeBigUInt64LE(args.size, off); off += 8;
  body.writeBigUInt64LE(args.expirySlot, off); off += 8;
  body.writeUInt8(args.orderBump, off);
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.owner, isSigner: true, isWritable: true },
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.userAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.orderPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: packIx(tag, body),
  });
}

export interface CancelOrderAccounts {
  programId: PublicKey;
  canceller: PublicKey;
  market: PublicKey;
  userAccount: PublicKey;
  orderPda: PublicKey;
  /** Equals order.owner for retail orders; equals vault PDA for vault-mode. */
  rentReceiver: PublicKey;
}

export function cancelOrderIx(
  accounts: CancelOrderAccounts,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.canceller, isSigner: true, isWritable: true },
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.userAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.orderPda, isSigner: false, isWritable: true },
      { pubkey: accounts.rentReceiver, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([IxTag.CancelOrder]),
  });
}

// ── L2 intent (MM lane) ────────────────────────────────────────────

export interface IntentAccounts {
  programId: PublicKey;
  mm: PublicKey;
  market: PublicKey;
  intentRecord: PublicKey;
  mmUserAccount: PublicKey;
}

export function postIntentIx(
  accounts: IntentAccounts,
  side: Side,
  minPrice: bigint,
  maxPrice: bigint,
  maxFillSize: bigint,
): TransactionInstruction {
  // Body: side(1) pad(7) min_price(8) max_price(8) max_fill_size(8) = 32 bytes
  const body = Buffer.alloc(32);
  body.writeUInt8(side, 0);
  body.writeBigUInt64LE(minPrice, 8);
  body.writeBigUInt64LE(maxPrice, 16);
  body.writeBigUInt64LE(maxFillSize, 24);
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.mm, isSigner: true, isWritable: false },
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.intentRecord, isSigner: false, isWritable: true },
      { pubkey: accounts.mmUserAccount, isSigner: false, isWritable: true },
    ],
    data: packIx(IxTag.PostIntent, body),
  });
}

export function revokeIntentIx(
  accounts: IntentAccounts,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.mm, isSigner: true, isWritable: false },
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.intentRecord, isSigner: false, isWritable: true },
      { pubkey: accounts.mmUserAccount, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([IxTag.RevokeIntent]),
  });
}

// ── Admin: pause / unpause ────────────────────────────────────────

export interface PauseAccounts {
  programId: PublicKey;
  admin: PublicKey;
  market: PublicKey;
}

export function pauseIx(accounts: PauseAccounts): TransactionInstruction {
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.admin, isSigner: true, isWritable: false },
      { pubkey: accounts.market, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([IxTag.Pause]),
  });
}

export function unpauseIx(accounts: PauseAccounts): TransactionInstruction {
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.admin, isSigner: true, isWritable: false },
      { pubkey: accounts.market, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([IxTag.Unpause]),
  });
}
