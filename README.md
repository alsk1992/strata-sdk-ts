# `@stratabook/sdk`

Strict TypeScript bindings and a terminal client for Strata's versioned public
agent contract. It works in Node 20+ and modern browsers with no runtime
dependencies.

```ts
import { StrataClient } from "@stratabook/sdk";

const strata = new StrataClient();
const quote = await strata.quote({
  market: "SOL/USDC",
  side: "sell",
  amountInAtoms: 10_000_000n,
});

console.log(quote.amount_out_atoms);
```

Terminal usage:

```sh
npx -y @stratabook/sdk markets
npx -y @stratabook/sdk quote \
  --market SOL/USDC \
  --side sell \
  --amount-atoms 10000000 \
  --json
```

Money remains in atomic decimal strings. Quote responses are strict and
versioned; unknown fields, mismatched markets, invalid lifetimes, and
inconsistent economics fail closed. Input-asset and output-asset fees are
labelled separately. Each quote covers all eligible liquidity in the selected
Strata market while exposing no Sonar implementation details.

`amount_out_atoms` is what the user receives after `output_fee_atoms`.
Gross route output for an external route-quality comparison is exactly
`amount_out_atoms + output_fee_atoms`; all-in user comparisons use
`amount_out_atoms`.

Quotes default to zero execution tolerance, so `minimum_output_atoms` equals
the quoted output. Set `slippageBps` explicitly only when willing to accept a
lower floor. Price impact remains a separate measure of current market depth.

For AI clients, install the separate `@stratabook/mcp` package. Keeping the
protocol adapter separate preserves this SDK's zero-runtime-dependency browser
surface.

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

## Authenticated execution

The SDK can execute an unexpired quote through a Vault session when the live
`trade.prepare` and `trade.submit` capabilities are enabled. It never accepts a
seed phrase or private key. Instead, `executeQuote` takes:

- the Sonar quote and Vault owner;
- a non-exportable session adapter;
- the Vault account sequence; and
- a mandatory transaction verifier.

The session first signs a one-time authorization bound to the quote and its
`minimum_output_atoms`. Strata prepares the transaction, the application
verifies it, and only then may the session add its transaction signature.
Submission is idempotent.

Agents that already have an owner-configured signer can drive each boundary
separately with `executionChallenge`, `executionPrepare`, and
`executionSubmit`. `actionGraph()` returns the live operation topology and
transition conditions. These methods accept public keys, detached signatures,
and signed transactions—not private keys.

```ts
const receipt = await strata.executeQuote({
  quote,
  ownerWallet,
  accountSequence,
  signer: vaultSession,
  verifyTransaction: verifyForThisVault,
});
```

`verifyTransaction` protects transaction integrity; the external agent owner
decides the actual permission and signing policy. Use the verifier configured by
the signing application. MCP exposes the same challenge, prepare, and submit
sequence when the corresponding live capabilities are available.

## Resting orders

When `orders.prepare` and `orders.submit` are live, the platform client can
place good-until-cancelled or post-only orders and cancel one or all open
orders. The one-call helper parses every signed authorization field, requires
the owner's transaction verifier, then delegates both signatures to the
external session adapter.

```ts
const receipt = await strata.orders.execute(market.market_id, {
  operation: {
    action: "place",
    ownerWallet,
    accountSequence,
    clientOrderId: "strategy-42",
    side: "buy",
    orderType: "post_only",
    limitPriceAtoms: 150_000_000n,
    sizeAtoms: 1_000_000_000n,
  },
  signer: vaultSession,
  verifyTransaction: verifyForThisVault,
});
```

Use `orders.challenge`, `orders.prepare`, and `orders.submit` when an agent
runtime needs to broker each boundary separately. If submission times out, call
`orders.status` with the same control ID and idempotency key to recover the
durable result across process restarts. All market and order IDs are opaque,
cancel-all is bounded to the exact order set in its signed challenge, replace
is one atomic cancel-plus-place transaction, heterogeneous batches are capped
at six operations, and submission is idempotent.
