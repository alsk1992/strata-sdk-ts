# Changelog

All notable changes to the Strata SDKs (`@stratabook/sdk`, `@stratabook/mcp`,
and the `strata-sdk` Rust crate) are recorded here. Versions move together.

## 0.2.19

- Default persistent order commands to `selfTradePrevention: "none"` instead
  of silently activating `cancel_taker`.
- Keep all four proactive cancellation policies available as explicit opt-ins
  and validate the new `none` result mode.

## 0.2.18

- Preserve the server's exact retry delay on `StrataApiError`, accepting both
  structured `retry_after_ms` and the standard HTTP `Retry-After` header.
- Carry exact retry delays from authenticated order-stream command errors.

## 0.2.17

- Default Vault sessions to strategy-controlled timing (`minimumIntervalSeconds
  = 0`) while retaining a non-zero value as an optional legacy hard floor.
- Accept and verify zero in prepared setup responses, and describe zero-SOL
  first-session sponsorship accurately in the public onboarding guide.

## 0.2.16

- Coordinated patch for Rust capability-fixture parity. TypeScript API and
  wire behavior are unchanged from 0.2.15.

## 0.2.15

- Add `marketMaking.intent.prepare`, `.submit`, and `.execute` for existing
  curated IntentBook seats controlled by the owner's Vault session.
- Add deny-by-default transaction decoding that binds every account and
  economic field before signing and rejects any changed message afterward.

## 0.2.14

- Add atomic session replacement to `platform.vault.setup`: callers can name
  the old session public key while registering a fresh key under one exact,
  owner-signed policy transaction.
- Validate that setup responses echo both the replacement identity and every
  owner-selected session limit exactly.

## 0.2.13

- Add `generateSessionKeypair`, a Web Crypto-backed helper that returns a
  Solana-compatible public/secret pair for secure local session onboarding.
- Coordinate the release with MCP's private local pairing flow. Existing API
  and wire-contract behavior is unchanged.

## 0.2.12

- Coordinated release for MCP 0.2.12's client-neutral, direct-use onboarding.
  The TypeScript API and wire contract are unchanged from 0.2.11.

## 0.2.11

- Resolve the maker conformance CLI entrypoint through npm's executable
  symlink, so the published `strata-maker-conformance` command actually runs.
- Correct the pinned `npx --package` examples and cover the installed-bin
  invocation path with a regression test.

## 0.2.10

- Add the `strata-maker-conformance` binary and reusable safe, funded, and
  full conformance functions. Safe mode verifies live SDK/MCP maker reads,
  human-size resolution, stateless preparation tokens, and native-v0 packets
  without broadcasting. Funded mode proves Current and Strand lifecycle,
  collateral stability, cancellation, and expiry. Full mode adds isolated
  partial fills and a mixed execution that requires Strand, Current, and a
  Sonar remainder while exposing only the maker's own product attribution.

## 0.2.9

- Correct the maker preparation terminology: `transaction_version=0`
  requests a browser-safe native-v0 Solana transaction, not a legacy
  transaction. Runtime behavior is unchanged from 0.2.8.

## 0.2.8

- Request browser-safe native-v0 Solana transactions from Strand and Current
  prepare endpoints for external wallet signing.

## 0.2.7

- Verify after every external signer returns that execution, order, TWAP, and
  persistent command transaction messages are byte-identical to preparation;
  require native-v0 maker controls without lookup tables.
- Let maker quickstarts use either the market label's base symbol or the
  catalog asset symbol for decimal size inputs. `SOL/USDC` therefore accepts
  the documented `0.01 SOL` even though its custody asset is `WSOL`.

## 0.2.6

- Coordinated release for the restart-safe MCP maker continuation contract;
  the TypeScript quickstart and byte-exact verification APIs are unchanged.

## 0.2.5

- Add `marketMaking.start`, `stop`, `prepareStart`, `prepareStop`, and
  `submitPrepared`: label-aware Strand/Current operation from decimal base
  size and spread, byte-exact transaction verification, idempotent submission,
  and chain-derived confirmation.
- Add `assets.resolve`, `markets.resolve`, and `marketMaking.waitUntilReady`.

## 0.2.2

- Correct order-size semantics: sizes are base-asset atoms, not lots, and any
  positive atom amount is valid.
- Rename Strand exposure and level inputs from `BaseLots` to `BaseAtoms`.

## 0.2.0

The unattended-agent release: an external agent can now onboard, hold one
balance across markets, trade instantly under a user-owned safety slider, and see the book it
trades into — all without a human signing each action, and without any venue,
route, or pool ever crossing the boundary.

### Onboarding & signing
- **One-signature onboarding.** `vault.setup` works for every user-bounded
  market — register a capped, revocable session key with a single wallet
  signature; the first deposit registers the session in the same owner-signed
  transaction.
- **One signature per action.** `orders.prepare`, `algos.twap.prepare`, and
  `execution.prepare` accept the operation itself and build immediately — the
  session's transaction signature is the whole authorization. The signed-
  challenge form still works. SDK one-call helpers (`orders.execute`,
  `algos.execute`, `executeQuote`) sign and submit in one call with a built-in
  transaction verifier; `sessionSignerFromSecretKey` turns a session secret
  into a ready signer.
- **Sponsored Vault lifecycle** (`vault.relay`): the owner needs no SOL and no
  RPC; Strata pays the fee (and pre-funds rent) when the wallet is low and
  recovers exactly what it spent from later deposits, Jupiter-style.

### Reads
- **One account read.** `GET /v2/account/{wallet}/portfolio` — balances,
  positions, open orders, and recent fills across every live market in one
  public read by wallet address (`account`/`portfolio`, `strata_portfolio`).
- **Order book, best bid/ask, and recent trades in MCP** — `strata_book`,
  `strata_bbo`, `strata_trades` (already in the SDK `books` module).
- **Maker reads public by wallet** — status, reputation, and the fills stream
  need no signature.
- **Exact-output market quotes** ("buy at least 1 SOL"): `amount_out_atoms` on
  the same quote handle and execution flow.
- Sequenced **execution**, **TWAP**, and **maker fill** streams.

### Autonomy (MCP)
- **Session-autonomy slider.** With a session key in the MCP's env
  (`STRATA_SESSION_SECRET_KEY` + `STRATA_OWNER_WALLET`), `strata_execute_quote`,
  `strata_order_execute`, and `strata_twap_execute` sign and submit within
  `STRATA_AUTONOMY` = `ask` (default; prepare only) / `limits` (up to
  `STRATA_AUTONOMY_MAX_USD_PER_TRADE` / `_PER_DAY` / `_MARKETS`) / `instant`.
  `strata_autonomy` is read-only; nothing an agent calls raises its own
  autonomy. Withdraw/policy/pause/revoke stay owner-only.

### Other
- `strata_markets` carries each market's opaque `market_id` and asset ids.
- Account sequence is optional (server-resolved).
- Tolerance is named `maximum_tolerance_bps` and echoed on every quote (never
  conflated with price impact).
- CLI: `session-keygen`, `account`, `execute-quote`, direct `twap-prepare` /
  `execution-prepare`.

Nothing about venues, routes, pools, adapters, legs, counterparties, or how a fill was built, is exposed at any surface; the contract privacy gate enforces it.

## 0.1.x

Initial public SDK: capabilities, markets, action graph, market quote, quote execution (challenge → prepare → submit), firm orders, and the
opaque market/asset contract.
