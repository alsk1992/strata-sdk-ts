# Strata SDK for TypeScript

Build Strata market discovery and Sonar quotes into TypeScript applications,
scripts, and agents.

`@stratabook/sdk` is the official TypeScript client for Strata. It works in
Node.js 20+ and modern browsers, includes a command-line interface, and has no
runtime dependencies.

## Quick start

Install the SDK:

```sh
npm install @stratabook/sdk
```

Request a Sonar quote:

```ts
import { StrataClient } from "@stratabook/sdk";

const strata = new StrataClient();
const quote = await strata.quote({
  market: "SOL/USDC",
  side: "sell",
  amountInAtoms: 10_000_000n,
  slippageBps: 50,
});

console.log({
  output: quote.amount_out_atoms,
  minimumOutput: quote.minimum_output_atoms,
  expiresAt: new Date(quote.expires_at_ms),
});
```

Sonar is Strata's unified liquidity and matching system. One request returns the
price, fees, minimum output, price impact, and expiry for the complete Strata
market.

## Explore markets

List markets and check whether quotes are currently available:

```ts
const { markets } = await strata.markets();

for (const market of markets) {
  console.log(market.label, market.ready ? "ready" : "unavailable");
}
```

You can also inspect the features currently available to your integration:

```ts
const { capabilities } = await strata.capabilities();
console.log(capabilities);
```

## Use it from the terminal

The package includes the `strata` command:

```sh
npx -y @stratabook/sdk markets

npx -y @stratabook/sdk quote \
  --market SOL/USDC \
  --side sell \
  --amount-atoms 10000000 \
  --slippage-bps 50
```

Add `--json` to any command for stable machine-readable output:

```sh
npx -y @stratabook/sdk quote \
  --market SOL/USDC \
  --side sell \
  --amount-atoms 10000000 \
  --json
```

## Working with quotes

Token amounts use atomic units—the smallest unit of each token—and are returned
as decimal strings so they remain exact in every JavaScript environment. You
may provide `amountInAtoms` as a `bigint` or an unsigned decimal string.

Important quote fields include:

| Field | Meaning |
| --- | --- |
| `amount_out_atoms` | Expected output from the quote |
| `minimum_output_atoms` | Minimum output at your selected slippage |
| `input_fee_atoms` | Fee charged in the input token |
| `output_fee_atoms` | Fee charged in the output token |
| `price_impact_pct` | Estimated price impact |
| `expires_at_ms` | Time at which the quote expires |

Quotes are short-lived. Request a new quote after expiry and always respect
`minimum_output_atoms`.

## Configuration

The client uses Strata's production API by default. You can set a custom timeout
or point it at a controlled development environment:

```ts
const strata = new StrataClient({
  apiBase: "https://api.stratabook.app",
  timeoutMs: 10_000,
});
```

API failures throw `StrataApiError`, including a stable error code and whether
the request may be retried. Invalid or incompatible responses throw
`StrataContractError`.

## Available today

The `0.1.x` release supports market discovery and read-only Sonar quotes. It
does not prepare, sign, or submit transactions, and it never needs wallet or
private-key material.

## Documentation and support

- [Agent quick start](https://stratabook.app/docs/hello-agents)
- [SDK documentation](https://stratabook.app/docs/agent-sdks)
- [Report a bug or request a feature](https://github.com/alsk1992/strata-sdk-ts/issues)
- [Report a security issue](SECURITY.md)

Licensed under either [Apache-2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT).
