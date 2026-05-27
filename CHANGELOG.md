# Changelog

## 0.2.0

Closed the four CRITICAL gaps from the v0.1 audit:

### Added
- `decodeOrder()` — full `Order` PDA reader (160 bytes). Anyone listing
  a user's open limit orders now has a typed decoder.
- `decodeMarket()` — **rewritten** with full v2 layout (was reading
  wrong fields entirely in v0.1). Now includes `baseDecimals`,
  `quoteDecimals`, `pythFeedId`, `avlMaxSlippageBps`, `oracleMaxAgeSecs`,
  `settleAuthority`, `admin`, `paused`, trading counters, plus v2
  fields (`allowedPythAuthority`, `pythFeedIdPending`, `l2WindowMs`).
- `decodeIntentRecord()` — added v3 fields `quoteSigner` (64 bytes,
  streaming-lane HFT path) and `lastUsedNonce`.
- `decodeProtocolVault()` — added trailing fields (`legacyReferralEarned`,
  `takerFeesAccrued`). Layout now matches Rust source's
  `core::mem::size_of` assertion.
- `tx.ts` — Compute Budget ix builders: `cuLimitIx(units)`,
  `cuPriceIx(microlamports)`, `jitoTipIx(payer, tipAccount, lamports)`.
  Plus `buildAndSend()` helper that prepends ComputeBudget ixs +
  handles blockhash + signing in one call.
- `rest.ts` — `StrataRestClient` wrapping `/health`,
  `/book/snapshot/{market}`, `/user/{pubkey}/fills`,
  `/user/{pubkey}/positions`, `/market/{market}`. Typed `FillRow`
  for the fill-journal payloads.
- `pyth.ts` — `HermesClient` thin wrapper for
  `/v2/updates/price/latest`. Includes a static
  `HermesClient.toStrataPrice(snap, quoteDecimals)` helper to convert
  Pyth `(price, expo)` into Strata's "quote atoms per whole base"
  encoding.
- `DecodeError.cause` — now structured as
  `"Truncated" | "WrongAccountKind" | "Other"` so consumers can
  switch on the cause.

### Fixed
- `USER_ACCOUNT_SIZE` corrected from `128` → `160` (matches Rust's
  `core::mem::size_of<UserAccount>`).
- `ORDER_SIZE` corrected from `144` → `160`.
- `INTENT_RECORD_SIZE` corrected from `360` → `368` (was missing
  v3's `last_used_nonce: u64`).
- `PROTOCOL_VAULT_SIZE` corrected from `144` → `120`.
- `decodeUserAccount()` — added missing fields (`openOrders`,
  `lifetimeFilledBase`, `lifetimeFilledQuote`, `lifetimeFeesPaid`,
  `nextOrderNonce`, `baseIntentReserved`, `quoteIntentReserved`).
- Constants module: added `COMPUTE_BUDGET_PROGRAM_ID` +
  `SettleTradeWithSignedQuote` (ix tag 31) entries.

### Tests
- 24/24 green (was 16). New coverage: `decodeOrder`, full `decodeMarket`,
  `decodeProtocolVault`, `decodeIntentRecord` v3 fields, all three
  Compute Budget ix builders, `HermesClient.toStrataPrice` math at
  three different exponents.

## 0.1.0

Initial scaffolding release. PDA derivers, ix builders, decoders for
UserAccount + IntentRecord (v2) + Market (partial), WS clients
(MmFeedClient + BookFeedClient), wire types.
