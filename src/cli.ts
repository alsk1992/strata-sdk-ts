#!/usr/bin/env node

import { StrataClient } from "./client.js";
import { DEFAULT_API_BASE, DEFAULT_SLIPPAGE_BPS, type QuoteSide } from "./types.js";

interface ParsedArgs {
  command: string;
  flags: Map<string, string | true>;
}

function parse(argv: string[]): ParsedArgs {
  const command = argv[0] ?? "help";
  const flags = new Map<string, string | true>();
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (!token?.startsWith("--")) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(key, true);
    } else {
      flags.set(key, next);
      index++;
    }
  }
  return { command, flags };
}

function value(flags: Map<string, string | true>, key: string, fallback?: string): string {
  const found = flags.get(key);
  if (found === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${key}`);
  }
  if (found === true) throw new Error(`--${key} requires a value`);
  return found;
}

function help(): void {
  console.log(`Strata terminal agent

Usage:
  strata capabilities [--json]
  strata action-graph [--json]
  strata markets [--all] [--json]
  strata quote --market SOL/USDC --side sell --amount-atoms 10000000 [--slippage-bps N] [--json]
  strata execution-challenge --market SOL/USDC --quote-id ID --owner-wallet PUBKEY --session-public-key PUBKEY --account-sequence N [--json]
  strata execution-prepare --market SOL/USDC --challenge-id ID --authorization-signature BASE58 [--json]
  strata execution-submit --market SOL/USDC --execution-id ID --signed-transaction-base64 BASE64 --idempotency-key KEY [--json]

Global:
  --api-base URL       Public Strata API (default: ${DEFAULT_API_BASE})
  --timeout-ms N       Request timeout (default: 10000)
  --slippage-bps N     Optional maximum execution tolerance (default: 0)
  --json               Stable machine-readable output

The external agent owner controls permission and signing. This client accepts
public keys, signatures, and signed transactions, never private keys or seed phrases.`);
}

async function run(): Promise<void> {
  const parsed = parse(process.argv.slice(2));
  if (parsed.command === "help" || parsed.flags.has("help")) {
    help();
    return;
  }
  const timeoutMs = Number(value(parsed.flags, "timeout-ms", "10000"));
  const client = new StrataClient({
    apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
    timeoutMs,
  });
  const json = parsed.flags.has("json");

  if (parsed.command === "capabilities") {
    const catalog = await client.capabilities();
    if (json) console.log(JSON.stringify(catalog, null, 2));
    else {
      console.log(`Strata public contract ${catalog.contract_version}`);
      for (const capability of catalog.capabilities) {
        console.log(
          `${capability.id.padEnd(18)} ${capability.stability.padEnd(8)} `
          + `${capability.risk.padEnd(11)} default=${capability.default_enabled ? "enabled" : "disabled"}`,
        );
      }
    }
    return;
  }

  if (parsed.command === "action-graph") {
    const graph = await client.actionGraph();
    if (json) console.log(JSON.stringify(graph, null, 2));
    else {
      console.log(`Strata action graph ${graph.graph_version}`);
      console.log(`  permission: ${graph.authority.permission_source}`);
      console.log(`  signing:    ${graph.authority.signing_location}`);
      for (const node of graph.nodes) {
        console.log(`${node.available ? "ready" : "off  "} ${node.id}: ${node.summary}`);
      }
    }
    return;
  }

  if (parsed.command === "markets") {
    const response = await client.markets();
    if (!parsed.flags.has("all")) {
      response.markets = response.markets.filter((market) => market.ready);
    }
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log("MARKET             STATUS   BASE/QUOTE DECIMALS");
      for (const market of response.markets) {
        console.log(
          `${market.label.padEnd(18)} ${(market.ready ? "ready" : "paused").padEnd(8)} `
          + `${market.base_decimals}/${market.quote_decimals}`,
        );
      }
    }
    return;
  }

  if (parsed.command === "quote") {
    const side = value(parsed.flags, "side") as QuoteSide;
    const quote = await client.quote({
      market: value(parsed.flags, "market"),
      side,
      amountInAtoms: value(parsed.flags, "amount-atoms"),
      slippageBps: Number(
        value(parsed.flags, "slippage-bps", String(DEFAULT_SLIPPAGE_BPS)),
      ),
    });
    if (json) console.log(JSON.stringify(quote, null, 2));
    else {
      console.log(`${quote.market_id} ${quote.side} quote`);
      console.log(`  input atoms:    ${quote.amount_in_atoms}`);
      console.log(`  consumed atoms: ${quote.amount_in_consumed_atoms}`);
      console.log(`  output atoms (net):  ${quote.amount_out_atoms}`);
      console.log(`  minimum atoms (net): ${quote.minimum_output_atoms}`);
      console.log(`  input fee:      ${quote.input_fee_atoms}`);
      console.log(`  output fee:     ${quote.output_fee_atoms}`);
      console.log(`  reference:      ${quote.reference_price}`);
      console.log(`  price impact:   ${quote.price_impact_pct}%`);
      console.log(`  valid for:       ${quote.expires_at_ms - quote.server_time_ms} ms`);
      console.log(`  provider:        ${quote.provider}`);
    }
    return;
  }

  if (parsed.command === "execution-challenge") {
    const response = await client.executionChallenge({
      market: value(parsed.flags, "market"),
      quoteId: value(parsed.flags, "quote-id"),
      ownerWallet: value(parsed.flags, "owner-wallet"),
      sessionPublicKey: value(parsed.flags, "session-public-key"),
      accountSequence: value(parsed.flags, "account-sequence"),
    });
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`challenge:     ${response.challenge_id}`);
      console.log(`authorization: ${response.authorization_payload_base64}`);
      console.log(`expires:       ${response.expires_at_ms}`);
    }
    return;
  }

  if (parsed.command === "execution-prepare") {
    const response = await client.executionPrepare({
      market: value(parsed.flags, "market"),
      challengeId: value(parsed.flags, "challenge-id"),
      authorizationSignature: value(parsed.flags, "authorization-signature"),
    });
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`execution:   ${response.execution_id}`);
      console.log(`transaction: ${response.transaction_base64}`);
      console.log(`expires:     ${response.expires_at_ms}`);
    }
    return;
  }

  if (parsed.command === "execution-submit") {
    const response = await client.executionSubmit({
      market: value(parsed.flags, "market"),
      executionId: value(parsed.flags, "execution-id"),
      signedTransactionBase64: value(parsed.flags, "signed-transaction-base64"),
      idempotencyKey: value(parsed.flags, "idempotency-key"),
    });
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`execution: ${response.execution_id}`);
      console.log(`signature: ${response.signature}`);
      console.log(`status:    ${response.status}`);
    }
    return;
  }

  throw new Error(`unknown command: ${parsed.command}`);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
