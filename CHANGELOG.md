# Changelog

## 0.3.0

### Fixed (CRITICAL — broken in v0.1/v0.2)

- **`IxTag` enum had wrong values** — `PostIntent` was 8 but on-chain
  is 9; `RevokeIntent` was 9 but on-chain is 10; `Pause` was 16 but
  on-chain is 14; `Unpause` was 17 but on-chain is 15; `ClaimStake`
  was 15 but on-chain is 18; `InitUserAccount` was 10 but on-chain
  is 16; `RecordRfqTimeout` was 14 but on-chain is 8;
  `SettleSwapWrapped` was 20 but on-chain is 21. Every ix the SDK
  built routed to the WRONG on-chain handler and reverted at submit
  time. Now matches `strata-types::ix::IxTag` exactly.
- Added missing tag entries: `BondStake=17`, `ProposeOracle=20`,
  `CommitOracle=22`, `SetPythAuthority=23`, `MigrateMarketV2=24`,
  `SetSwapFee=25`, `SetMarketL2WindowMs=26`, `MigrateIntentV2=27`,
  `RecordSettleLatency=28`, `MigrateIntentV3=29`, `SetQuoteSigner=30`,
  `InitializeMarket=0` (was `InitMarket`).

### Added

- `admin.ts` — full admin ix builder surface:
  - `adminRegisterMmIx` / `adminRemoveMmIx` / `adminSlashMmIx`
  - `bondStakeIx` / `claimStakeIx`
  - `crankExpiredOrdersIx` / `recordRfqTimeoutIx` (IS-9 auto-slash
    protocol_vault account)
  - `settleTradeIx` (with optional Pyth account for M6)
  - `adminWithdrawProtocolVaultIx`
  - `migrateMarketV2Ix` / `migrateIntentV2Ix` / `migrateIntentV3Ix`
  - `setQuoteSignerIx` (64-byte secp256k1 signer for streaming lane)
- `vault.ts` — vault-mode helpers:
  - `wrapStrataIxForVault(opts)` wraps a Strata-native inner ix in
    the vault's `execute_with_delegate` (tag 3) envelope. Session
    key signs; vault PDA is the downstream signer via CPI seeds.
  - `VaultSession` interface (owner / vaultPda / delegatePubkey /
    delegatePda / keyId).
- `.github/workflows/publish.yml` — npm publish on `v*` tag push,
  with provenance + matrix-verified build.

### Tests

- 41/41 green (was 24). New coverage:
  - `admin.test.ts` — 9 tests across all admin/settler/migration ixs
    (body sizes, tag bytes, signer/writable account flags, optional
    Pyth slot in settleTrade)
  - `vault.test.ts` — 4 tests: tag-3 header, inner ix embedded after
    header, 5-slot fixed account prefix + inner-key passthrough with
    signer bit stripped, amount_in encoding
  - `ws.test.ts` — 4 tests: MmFeedClient full handshake (mm_hello →
    sign → mm_auth → mm_auth_ok), Fill dispatch after auth,
    BookFeedClient message dispatch, error on bad JSON

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
