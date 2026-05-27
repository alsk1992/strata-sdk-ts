// Protocol constants. NO market-specific defaults — every consumer passes
// the market PDA + program ID into the ix/pdas helpers explicitly.
//
// The constants here are cluster-stable (IX tags, account kinds) plus
// well-known third-party program IDs (ATA, SPL Token, Compute Budget).

import { PublicKey } from "@solana/web3.js";

/// IX discriminator tags. **Mirrors `strata-types::ix::IxTag`** —
/// verified against the Rust enum. Any mismatch routes ixs to the
/// wrong on-chain handler and reverts at submit time.
export const IxTag = {
  InitializeMarket: 0,
  Deposit: 1,
  Withdraw: 2,
  PlaceOrder: 3,
  CancelOrder: 4,
  CrankExpiredOrders: 5,
  SettleTrade: 6,
  SettleSwap: 7,
  RecordRfqTimeout: 8,
  PostIntent: 9,
  RevokeIntent: 10,
  AdminRegisterMm: 11,
  AdminRemoveMm: 12,
  AdminSlashMm: 13,
  Pause: 14,
  Unpause: 15,
  InitUserAccount: 16,
  BondStake: 17,
  ClaimStake: 18,
  WithdrawProtocolVault: 19,
  ProposeOracle: 20,
  SettleSwapWrapped: 21,
  CommitOracle: 22,
  SetPythAuthority: 23,
  MigrateMarketV2: 24,
  SetSwapFee: 25,
  SetMarketL2WindowMs: 26,
  MigrateIntentV2: 27,
  RecordSettleLatency: 28,
  MigrateIntentV3: 29,
  SetQuoteSigner: 30,
  SettleTradeWithSignedQuote: 31,
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

/// Canonical Solana program IDs (cluster-stable).
export const SYSTEM_PROGRAM_ID = PublicKey.default;
export const SPL_TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
export const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey(
  "ComputeBudget111111111111111111111111111111",
);

/// Strata account-data byte sizes. **Verified against the Rust source's
/// `core::mem::size_of` assertions** — if the on-chain layout migrates,
/// bump these in lockstep.
export const MARKET_SIZE = 384;
export const USER_ACCOUNT_SIZE = 160;
export const ORDER_SIZE = 160;
export const INTENT_RECORD_SIZE = 368;
export const PROTOCOL_VAULT_SIZE = 120;
