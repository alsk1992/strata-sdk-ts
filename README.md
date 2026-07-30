# Strata TypeScript SDK

Official TypeScript bindings and terminal access for Strata's versioned public
contract. The package works in Node 20+ and modern browsers with no runtime
dependencies.

Sonar is Strata's unified liquidity and matching system. A Sonar quote considers
the complete eligible market and returns one composition-opaque economic result.
The SDK does not expose private routing, venue selection, or matching internals.

## Install

```sh
npm install @stratabook/sdk
```

## Request a quote

```ts
import { StrataClient } from "@stratabook/sdk";

const strata = new StrataClient();
const quote = await strata.quote({
  market: "SOL/USDC",
  side: "sell",
  amountInAtoms: 10_000_000n,
  slippageBps: 50,
});

console.log(quote.amount_out_atoms);
console.log(quote.minimum_output_atoms);
```

The default production API is `https://api.stratabook.app`. Pass `apiBase` only
for a controlled test or development environment:

```ts
const strata = new StrataClient({
  apiBase: "https://api.stratabook.app",
  timeoutMs: 10_000,
});
```

## Use it from a terminal

```sh
npx -y @stratabook/sdk capabilities --json
npx -y @stratabook/sdk markets --json
npx -y @stratabook/sdk quote \
  --market SOL/USDC \
  --side sell \
  --amount-atoms 10000000 \
  --slippage-bps 50 \
  --json
```

The terminal output is human-readable by default. Use `--json` for scripts and
agents.

## Contract guarantees

- Token amounts cross the public boundary as unsigned base-10 atomic strings.
- Responses are checked against the exact supported contract version.
- Unknown or missing fields fail closed.
- Quotes are rebound to the requested market, side, and input amount.
- Expiry, minimum output, fee labels, and core economic invariants are validated.
- Product capability policy is discovered from Strata instead of hard-coded.

`StrataApiError` reports public API failures with a status, stable code, and
retryability hint. `StrataContractError` means a response or requested operation
did not satisfy the supported public contract.

## Safety boundary

Version `0.1.x` is read-only. It can discover capabilities, list markets, and
request short-lived Sonar quotes. It cannot prepare, sign, or submit a
transaction and never accepts wallet, keypair, or session-key material.

## Contract fixtures

[`contract/v1`](contract/v1) contains the public compatibility fixtures used by
the test suite. The same fixtures ship with the Rust contract crate. Automated
parity checks prevent the language clients from silently diverging.

Public product documentation lives at
[stratabook.app/docs](https://stratabook.app/docs/hello-agents). Security issues
should be reported privately as described in [SECURITY.md](SECURITY.md).
