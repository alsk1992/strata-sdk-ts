// Protocol constants. NO market-specific defaults — every consumer passes
// the market PDA + program ID into the ix/pdas helpers explicitly.
//
// The constants here are cluster-stable (IX tags, account kinds) plus
// well-known third-party program IDs (ATA, SPL Token).

import { PublicKey } from "@solana/web3.js";

/// IX discriminator tags. **Mirrors `strata-types::ix::IxTag` in the
/// Rust crate** — keep in sync or settle_trade reverts at submit time.
export const IxTag = {
  InitMarket: 0,
  Deposit: 1,
  Withdraw: 2,
  PlaceOrder: 3,
  CancelOrder: 4,
  CrankExpiredOrders: 5,
  SettleTrade: 6,
  SettleSwap: 7,
  PostIntent: 8,
  RevokeIntent: 9,
  InitUserAccount: 10,
  AdminRegisterMm: 11,
  AdminRemoveMm: 12,
  AdminSlashMm: 13,
  RecordRfqTimeout: 14,
  ClaimStake: 15,
  Pause: 16,
  Unpause: 17,
  AdminWithdrawProtocolVault: 19,
  SettleSwapWrapped: 20,
  PlaceOrderForOwner: 33,
} as const;
export type IxTag = (typeof IxTag)[keyof typeof IxTag];

/// Account kind discriminator (first byte of every Strata account).
export const AccountKind = {
  Market: 0,
  UserAccount: 1,
  Order: 2,
  IntentRecord: 3,
  ProtocolVault: 4,
} as const;
export type AccountKind = (typeof AccountKind)[keyof typeof AccountKind];

/// Side enum — 0 = Buy, 1 = Sell. Matches the on-chain layout.
export const Side = {
  Buy: 0,
  Sell: 1,
} as const;
export type Side = (typeof Side)[keyof typeof Side];

/// Order type enum.
export const OrderType = {
  Limit: 0,
  Ioc: 1,
  Fok: 2,
  PostOnly: 3,
} as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];

/// Canonical mainnet SPL programs.
export const SPL_TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

/// Strata account-data byte sizes. Used by [`decode`] for length-checks.
/// **Bumped when the on-chain Market or IntentRecord layout migrates.**
export const MARKET_SIZE = 384; // post Audit H6+M1 migration v2
export const INTENT_RECORD_SIZE = 360; // post-v3 (incl. quote_signer + last_used_nonce)
export const USER_ACCOUNT_SIZE = 128;
export const PROTOCOL_VAULT_SIZE = 144;
export const ORDER_SIZE = 144;
