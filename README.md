# `@stratabook/sdk`

Strict TypeScript bindings and a terminal client for Strata's versioned public
agent contract. It works in Node 20+ and modern browsers with no runtime
dependencies.

The official hosted API currently has market, exact-output, and asset-to-asset
Sonar quotes enabled. The SDK still checks the live capability catalog before
each gated operation; that is a runtime safety check, not an inactive-feature
notice.

```ts
import { StrataClient } from "@stratabook/sdk";

const strata = new StrataClient();
const quote = await strata.quote({
  market: "SOL/USDC",
  side: "sell",
  amountInAtoms: 10_000_000n,
});

console.log(quote.amount_out_atoms);

// Exact output — "buy 1 SOL": Strata inverts its best route and returns the
// USDC that delivers it as `amount_in_atoms`. `maximumToleranceBps` is your
// usual optional lower floor (default 0 → exactly 1 SOL or the execution
// fails closed and you re-quote).
const buyOneSol = await strata.quote({
  market: "SOL/USDC",
  side: "buy",
  amountOutAtoms: 1_000_000_000n,
});

console.log(buyOneSol.amount_in_atoms);
```

Terminal usage:

```sh
npx -y @stratabook/sdk markets
npx -y @stratabook/sdk quote \
  --market SOL/USDC \
  --side sell \
  --amount-atoms 10000000 \
  --json
npx -y @stratabook/sdk quote \
  --market SOL/USDC \
  --side buy \
  --amount-out-atoms 1000000000
```

Money remains in atomic decimal strings. Quote responses are strict and
versioned; unknown fields, mismatched markets, invalid lifetimes, and
inconsistent economics fail closed. Input-asset and output-asset fees are
labelled separately. Each quote covers all eligible liquidity in the selected
Strata market while exposing no Sonar implementation details.

`amount_out_atoms` is what the user receives after `output_fee_atoms`.
Gross pre-fee output is exactly `amount_out_atoms + output_fee_atoms`; all-in
user comparisons use `amount_out_atoms`.

Two numbers on every quote are easy to mix up and are unrelated:

- `price_impact_pct` is **measured**: how far the quoted fills' average price
  sits from `reference_price`, the best price before your order. It comes from
  the book. It is not a setting.
- `maximumToleranceBps` (echoed as `maximum_tolerance_bps`) is **yours**: the most you accept below the quoted
  output, `0` by default (the quoted output exactly). It is applied in
  `minimum_output_atoms` and echoed back on the quote.

A quote can show `0` impact with 25 bps of tolerance, or 40 bps of impact with
`0` tolerance. Choosing a tolerance never changes the fills; it only sets the
floor below which execution fails closed.

For AI clients, install the separate `@stratabook/mcp` package. Keeping the
protocol adapter separate preserves this SDK's zero-runtime-dependency browser
surface.

Asset-to-asset quotes use opaque IDs from the v2 catalog and return the same
strict customer economics without exposing implementation-specific token or
path identifiers:

```ts
const platform = new StrataPlatformClient();
const assets = await platform.assets.list();
const input = assets.assets.find((asset) => asset.symbol === "SOL");
const output = assets.assets.find((asset) => asset.symbol === "USDC");
if (!input || !output) throw new Error("assets unavailable");

const swap = await platform.quotes.swap({
  inputAssetId: input.asset_id,
  outputAssetId: output.asset_id,
  amountInAtoms: 10_000_000n,
  maximumToleranceBps: 50,
});
```

## Book and market stream

`StrataPlatformClient` discovers the live `books.read` capability before any
market-data call. Market IDs are opaque; obtain them from `markets.list()`.

```ts
import { StrataPlatformClient } from "@stratabook/sdk";

const strata = new StrataPlatformClient();
const market = (await strata.markets.list()).markets[0];
if (!market) throw new Error("no active Strata market");

const [book, bestPrices, fees, status, trades] = await Promise.all([
  strata.books.snapshot(market.market_id, { depth: 200 }),
  strata.books.bestBidAsk(market.market_id),
  strata.books.fees(market.market_id),
  strata.books.status(market.market_id),
  strata.books.trades(market.market_id, { limit: 100 }),
]);

const stream = await strata.books.subscribe(market.market_id, {
  onBook: (next) => console.log(next.sequence, next.bids[0], next.asks[0]),
  onTrade: (trade) => console.log(trade.side, trade.price_atoms),
  onMarketStatus: (status) => console.log(status),
  onError: console.error,
});
await stream.ready;
```

The stream starts with a snapshot, applies strict previous-sequence changes,
sends heartbeats, reports status changes, reconnects with bounded backoff, and
replaces local state after a gap. A zero size removes a price. Stale input
removes the live local book until a fresh snapshot arrives. All prices and
quantities remain atomic decimal strings, and exact execution fees remain bound
to fresh quotes.

## Execution stream

When `execution.stream` is live, `strata.executions.subscribe(marketId, executionIds, handlers)`
follows the executions you prepared in one market — prepared → confirmed on
chain, or expired unconfirmed — without polling `executions.status`:

```ts
const executionStream = await strata.executions.subscribe(market.market_id, [executionId], {
  onExecutions: (view) => console.log(view.executions, view.unknown_execution_ids),
  onExecution: (marketId, execution) => console.log(marketId, execution.execution_id, execution.status),
  onUnknown: (marketId, executionId) => console.warn(marketId, executionId, "expired or unknown"),
  onError: console.error,
});
await executionStream.ready;
executionStream.watch([anotherExecutionId]);
```

## TWAP progress stream

When `algos.twap.stream` is live, `strata.algos.subscribe(walletAddress, handlers)`
streams sequenced progress for every schedule the wallet or its Vault owns,
per market (all discoverable markets by default, or `marketIds`):

```ts
const twapStream = await strata.algos.subscribe(ownerWallet, {
  onTwaps: (view) => console.log(view.market_id, view.twaps.length, view.recovered),
  onTwap: (marketId, twap) => console.log(marketId, twap.twap_id, twap.status, twap.slices_executed),
  onError: console.error,
});
await twapStream.ready;
```

Each market stream starts with a snapshot, applies strict previous-sequence
`twap_update` events carrying the complete sanitized schedule, sends heartbeats,
and recovers any gap or reconnect from a fresh snapshot.

## Signed account state

`StrataPlatformClient.account` reads and streams the owner's sanitized orders,
fills, and settlement updates when `account.read` is live. Supply an external
Ed25519 message signer; the SDK accepts no private-key material.

```ts
const account = await strata.account.snapshot(ownerSigner);

const accountStream = await strata.account.subscribe(ownerSigner, {
  onAccount: (view) => console.log(view.market_id, view.orders, view.fills),
  onFill: (marketId, fill) => console.log(marketId, fill.settlement),
  onError: console.error,
});
await accountStream.ready;
```

HTTP signatures bind the wallet, market, request time, and fill limit. Streams
authenticate an expiring server challenge before any private state is sent.
The SDK validates sequences, reconnects with bounded backoff, replaces state
after gaps, and stops terminal authorization failures instead of retrying
forever. Returned IDs are opaque, and account responses stay limited to the
owner's product-level order, fill, fee, settlement, and transaction state.

**The whole account in one call.** `strata.account.read(walletAddress)`
(alias `portfolio`) is public by wallet address — no signature, no session
key, no market selection — and returns everything at once across every live
market: per-asset balances as exact `total`, `available`, and `locked` atoms
with USD values, per-market positions, every open order, recent fills, the
observed slot, and USD totals that are `null` (never zero) whenever any held
asset lacks a fresh public mark. `unavailable_market_ids` names any market that
did not report orders and fills for that snapshot; balances are still complete.
`strata.account.portfolioHistory(...)` returns the genuine stored equity series
for the same identity.

```ts
const account = await strata.account.read(ownerWallet);
for (const balance of account.balances) console.log(balance.asset_id, balance.total_atoms);
console.log(account.open_orders.length, "open orders", account.recent_fills.length, "recent fills");
```

## Market making

The simple path needs only the market, product, spread, total base size, and an
external transaction signer. It resolves the public IDs and decimals, reads the
fresh Strata mark and tick grid, builds the product's fixed arrays and safety
bounds, verifies every transaction field before signing, and returns only after
the chain-derived maker state matches:

```ts
const makerSigner = {
  publicKey: makerWallet,
  signTransaction: signWithMakerWallet,
};

const live = await strata.marketMaking.start({
  market: "SOL/USDC",
  product: "current", // or "strand"
  spreadBps: 5,       // distance from Strata mark to the first level
  size: "0.01 SOL",  // total size on each enabled side
  duration: "10m",   // defaults to 10m
  signer: makerSigner,
});

console.log(live.status, live.maker_status.currents);

await strata.marketMaking.stop({
  market: "SOL/USDC",
  product: "current",
  signer: makerSigner,
});
```

`stop` is idempotent and does not ask the wallet to sign when the product is
already absent. A wallet bridge can split the same safe flow across
`prepareStart` / `prepareStop` and `submitPrepared`; the private key never
enters Strata. Maker controls are native v0 transactions, and both SDKs reject
a signer that changes any verified message byte before submitting it.

`StrataPlatformClient.marketMaking` also reads a maker's Strata liquidity in
one market. Every read is public by wallet address — no signature, like every
other read (a signer is accepted; only its public key is used); nothing about
other makers, takers, or where liquidity is sourced is ever returned.

```ts
const status = await strata.marketMaking.status(market.market_id, makerWallet);
// status.firm_orders, status.signed_quotes, status.strands,
// status.currents, status.dead_man_guards, status.active_products

const reputation = await strata.marketMaking.reputation(market.market_id, makerWallet);
// reputation.tier, reputation.tier_progress, reputation.signed_quote_stream_eligible

const makerStream = await strata.marketMaking.subscribe(market.market_id, makerWallet, {
  onMaker: (view) => console.log(view.status.active_products, view.fills.length),
  onFill: (marketId, fill) => console.log(marketId, fill.product, fill.settlement),
  onStatus: (marketId, status) => console.log(marketId, status.strands, status.currents),
  onError: console.error,
});
await makerStream.ready;
```

For advanced strategies, the low-level Strand and Current controls expose every
on-chain field through the same externally signed prepare-then-submit flow:

```ts
const prepared = await strata.marketMaking.current.prepare(market.market_id, {
  action: "upsert",
  makerWallet,
  enabled: true,
  asyncOnly: false,
  halfSpreadBps: 5,
  bandStepBps: 3,
  maxConfidenceBps: 100,
  maxOracleDeviationBps: 500,
  maxOracleAgeSeconds: 10,
  syncSpreadBps: 1,
  maxExposureBaseAtoms: "1000000000",
  bidDepthBaseAtoms: ["100000000", ...Array(7).fill("0")],
  askDepthBaseAtoms: ["100000000", ...Array(7).fill("0")],
  validUntilSlot: "0",
});

// Verify and sign prepared.transaction_base64 with makerWallet, then:
await strata.marketMaking.current.submit(market.market_id, {
  makerControlId: prepared.maker_control_id,
  signedTransactionBase64,
  idempotencyKey: "current-sol-usdc-1",
});
```

The equivalent Strand methods are `marketMaking.strand.prepare` and
`marketMaking.strand.submit`, supporting upsert, recenter, enable/disable, and
cancel. Current prices from Strata's live mark; it does not need a separate
publisher transaction.

An existing curated IntentBook seat uses the owner's capped Vault session, so
the owner wallet does not sign every update and Strata pays the network fee:

```ts
await strata.marketMaking.intent.execute(market.market_id, {
  operation: {
    action: "post",
    ownerWallet,
    side: "both",
    minPriceAtoms: "149000000",
    maxPriceAtoms: "151000000",
    maxFillSizeAtoms: "1000000000",
  },
  signer: sessionSigner,
});
```

The built-in verifier decodes the complete Vault envelope and refuses any
changed market, account, role, side, price, or fill cap before signing. Low-level
clients can use `marketMaking.intent.prepare` and `.submit`. `revoke` is a
permanent close of that curated seat, not a temporary pause.

Initialize the market Vault if needed, activate the control, then fund it with
`vault.prepareDeposit` and `vault.submit`. Available collateral remains in the
market UserAccount while at least one Strand or Current is live. It returns to
the canonical Vault balance after the final control is disabled, exhausted,
expired, or cancelled.

`status` reports resting firm orders by side, the Vault-owned intent seat,
signed-quote lane eligibility and the maker's own live quotes, each Strand and Current with levels or bands, remaining exposure,
expiry against the current slot, and live Strata mark health, plus armed dead-man guards.
The maker stream starts from a signed snapshot of that same status and recent
maker-side fills tagged with their product (`firm_order`, `strand`, `current`),
then applies contiguous `maker_fill` and `maker_status` events and
recovers any gap from a fresh signed snapshot. Signer-less adapters (terminal,
MCP) use `statusAuthorizationPayload` / `reputationAuthorizationPayload` and
submit the detached signature through `statusAuthorized` /
`reputationAuthorized`.

### One-command maker conformance

Every deployment runs the non-broadcasting suite automatically. Anyone can run
the exact same public black-box proof:

```sh
npx --yes --package @stratabook/sdk@0.2.16 strata-maker-conformance safe --pretty
```

It checks live market/mark readiness, maker status and reputation behavior,
human `SOL` versus custody `WSOL` resolution, Strand and Current preparation in
the SDK and hosted MCP, stateless MCP continuation tokens, native-v0 signer
layout, lookup-table absence, and the 1,232-byte packet limit. It never signs,
broadcasts, or prints prepared transactions or tokens.

The explicitly funded lifecycle starts and stops Current through two separate
MCP requests, repeats Strand through the SDK, keeps collateral observable while
each product is live, and waits for automatic expiry:

```sh
npx --yes --package @stratabook/sdk@0.2.16 strata-maker-conformance funded \
  --keypair /absolute/path/maker.json \
  --confirm-funded-write RUN_FUNDED_MAINNET_CONFORMANCE --pretty
```

`full` additionally needs a different funded Vault owner and its registered
session key. It executes isolated partial Current and Strand fills, then a
mixed amount larger than both controls' combined exposure. The maker stream
must attribute both products and the full execution proves a Sonar remainder
was required. Public output still never reveals internal execution details.
Run `strata-maker-conformance --help` for every bounded input.

## Vault lifecycle: prepare, owner-sign, submit

Setup, deposits, withdrawals, session changes, withdrawal policy, and pause are
owner actions. Each `vault.prepare*` call returns the exact transaction, a
`preparation_id`, and `sponsored`. When `sponsored` is `true` Strata is the fee
payer and pre-funds any account the action creates, so the owner wallet needs
**no SOL and no RPC**: sign with the owner wallet and hand it straight back.

Onboarding is one owner signature, once. Name the session key on the first
deposit and that same transaction registers it — one session then trades every
market. (`vault.prepareSetup({ walletAddress, sessionPublicKey })` does the
same without a deposit; expiry, cadence, tolerance, and per-asset limits are
optional policy on top, defaulting to permanent, 1 s, 100 bps, no limits.)

```ts
const prepared = await platform.vault.prepareDeposit({
  walletAddress: ownerWallet,
  marketId: market.market_id,
  assetId: usdc.asset_id,
  amountAtoms: 1_000_000_000n,
  sessionPublicKey: vaultSession.publicKey, // first time: registers the session too
});
const signed = await ownerWallet.signTransaction(prepared.transaction_base64);
verifySignedTransactionMessage(prepared.transaction_base64, signed);
const receipt = await platform.vault.submit({
  preparationId: prepared.preparation_id,
  signedTransactionBase64: signed,
  idempotencyKey: "deposit-2026-08-17-1",
});
const outcome = await platform.vault.submission(prepared.preparation_id); // submitted → confirmed | failed
```

Submission is idempotent per key, verifies the signed bytes are exactly the
prepared transaction, and never lets Strata sign as the owner. Every immutable
wallet-facing preparation is a native v0 transaction with no lookup tables;
the explicit post-sign comparison above catches any non-conforming signer
before a network request is made.

Who pays: an owner holding at least 0.01 SOL pays their own network fee
(`sponsored: false`; Strata still submits). Below that, Strata pays the fee
and any rent (`sponsored: true`) and later recovers exactly what it spent from
the owner's deposits — one extra transfer in the same deposit transaction,
disclosed as `network_cost_atoms`, never more than 1% of a deposit, with any
remainder carried to the next deposit. Rent for a first setup or first
withdrawal policy is sponsored only when the wallet already holds about $10 of
supported assets — the deposit that repays it is coming; an empty wallet pays
that rent itself. There is no per-wallet quota, only a global daily circuit
breaker.

## Authenticated execution

The SDK can execute an unexpired quote through a Vault session when the live
`trade.prepare` and `trade.submit` capabilities are enabled. It never accepts a
seed phrase or private key. Instead, `executeQuote` takes:

- the Sonar quote and Vault owner;
- a non-exportable session adapter;
- optionally your own transaction verifier (the SDK's built-in one runs when
  omitted); and
- optionally a pinned Vault account sequence. Leave it out and Strata resolves
  the next sequence from the Vault's confirmed market account.

**One signature per trade.** Strata binds the quote and builds the transaction
in one step; the SDK verifies the transaction, then the session signs only that
transaction. Submission is idempotent. (The two-step path — a one-time
authorization signed first, then the transaction — remains available through
`executionChallenge` / `executionPrepare` / `executionSubmit`, and
`validateExecutionAuthorizationPayload` checks its bytes.)

```ts
const receipt = await strata.executeQuote({
  quote,
  ownerWallet,
  signer: vaultSession,
});
```

The built-in verifier (`verifyExecutionTransaction`) checks that the session
key co-signs only Vault-delegated instructions of one program and never pays,
that the owner wallet is not asked to sign, and that the echoed quote economics
match. Pass `verifyTransaction` to enforce a stricter owner policy instead. MCP
exposes the same one-signature prepare and submit when the corresponding live
capabilities are available.

## Session signer: generate locally, trade

A bot needs the session key the owner registered (from the app's **Agents**
page, `strata session-keygen` + `vault-setup`, or the first deposit).
`sessionSignerFromSecretKey` turns that secret (64-byte Solana secret key or a
32-byte seed, raw or base58) into the `StrataSessionSigner` every one-call
helper accepts — Ed25519 via Web Crypto, no Solana SDK, and transaction signing
writes only the session's own signature slot:

```ts
import { generateSessionKeypair, sessionSignerFromSecretKey } from "@stratabook/sdk";

const keypair = await generateSessionKeypair();
// Register keypair.publicKey once with the owner wallet.
const signer = await sessionSignerFromSecretKey(keypair.secretKey, keypair.publicKey);
```

The key never leaves the process; the SDK never transmits or stores it. MCP
users normally run `npx -y @stratabook/mcp connect`, which performs this local
generation and wallet handoff without exposing the secret.

## Resting orders

When `orders.prepare` and `orders.submit` are live, the platform client can
place good-until-cancelled or post-only orders and cancel one or all open
orders. **One signature per order:** the one-call helper sends the operation
itself to prepare, decodes the returned transaction and requires it to
place/cancel exactly the requested orders on this market (built-in
`verifyOrderTransaction`: session co-signs only delegated instructions, never
pays, owner never signs), then asks the session adapter for the one
transaction signature. There is no per-market onboarding: the first order
in a market creates the Vault's market account inside the same sponsored
transaction, so the verifier accepts one rent transfer from the fee payer to
that account ahead of the first order only.

```ts
const receipt = await strata.orders.execute(market.market_id, {
  operation: {
    action: "place",
    ownerWallet,
    clientOrderId: "strategy-42",
    side: "buy",
    orderType: "post_only",
    limitPriceAtoms: 150_000_000n,
    sizeAtoms: 1_000_000_000n,
  },
  signer: vaultSession,
  // verifyTransaction: verifyForThisVault, // optional stricter owner policy
});
```

`accountSequence` is optional everywhere an order is placed: omit it and Strata
resolves the next Vault market account sequence itself (consecutive places in
one batch receive consecutive sequences); pass it to pin a sequence you track
locally for back-to-back orders. Use `orders.prepare({ operation })` and
`orders.submit` when an agent runtime needs to broker each boundary separately
(`orders.challenge` + `orders.prepare({ challengeId, authorizationSignature })`
is the two-step alternative). If submission times out, call
`orders.status` with the same control ID and idempotency key to recover the
durable result across process restarts. All market and order IDs are opaque,
cancel-all is bounded to the exact order set in its signed challenge, replace
is one atomic cancel-plus-place transaction, heterogeneous batches are capped
at six operations, and submission is idempotent.
