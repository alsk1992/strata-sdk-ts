#!/usr/bin/env node

import { generateKeyPairSync, sign as ed25519Sign } from "node:crypto";

import { base58Encode, StrataClient } from "./client.js";
import { StrataPlatformClient } from "./platform-client.js";
import { sessionSignerFromSecretKey } from "./session-signer.js";
import type { PlatformTwapPrepareInput } from "./platform.js";
import {
  certifyPlatformOrderCommandSlo,
  PRODUCTION_ORDER_COMMAND_SLO,
} from "./platform-order-slo.js";
import { DEFAULT_API_BASE, DEFAULT_MAXIMUM_TOLERANCE_BPS, type QuoteSide } from "./types.js";

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
  strata platform-graph [--json]
  strata platform-status [--json]
  strata mark --market-id ID [--json]
  strata candles --market-id ID --from-ms N --to-ms N [--resolution-seconds N] [--json]
  strata markets [--all] [--json]
  strata swap-quote --input-asset-id ID --output-asset-id ID --amount-atoms N [--tolerance-bps N] [--json]
  strata quote --market SOL/USDC --side sell (--amount-atoms 10000000 | --amount-out-atoms 1990000) [--tolerance-bps N] [--json]
  strata execution-challenge --market SOL/USDC --quote-id ID --owner-wallet PUBKEY --session-public-key PUBKEY [--account-sequence N] [--json]
  strata execution-prepare --market SOL/USDC (--quote-id ID --owner-wallet PUBKEY --session-public-key PUBKEY [--account-sequence N] | --challenge-id ID --authorization-signature BASE58) [--json]
  strata execution-submit --market SOL/USDC --execution-id ID --signed-transaction-base64 BASE64 --idempotency-key KEY [--json]
  strata execute-quote --market SOL/USDC --side buy --amount-atoms N [--tolerance-bps N] --owner-wallet PUBKEY (--session-secret KEY | env STRATA_SESSION_SECRET_KEY) [--json]  one-shot instant swap: quote → sign with the session key → submit
  strata execution-status --market-id ID --execution-id ID [--json]
  strata twaps --market-id ID --wallet PUBKEY [--json]
  strata twap-challenge --market-id ID --owner-wallet PUBKEY --session-public-key PUBKEY --side buy|sell --total-size-atoms N --slices N --tolerance-bps N --interval-slots N --limit-price-atoms N [--json]
  strata twap-cancel --market-id ID --owner-wallet PUBKEY --session-public-key PUBKEY --twap-id ID [--json]
  strata twap-prepare --market-id ID (--owner-wallet PUBKEY --session-public-key PUBKEY --side buy|sell --total-size-atoms N --slices N --tolerance-bps N --interval-slots N --limit-price-atoms N | --owner-wallet PUBKEY --session-public-key PUBKEY --twap-id ID | --challenge-id ID --authorization-signature BASE58) [--json]
  strata twap-submit --market-id ID --twap-control-id ID --signed-transaction-base64 BASE64 --idempotency-key KEY [--json]
  strata account --wallet PUBKEY [--json]        (alias: portfolio) — balances, positions, open orders, recent fills, all markets
  strata portfolio-history --wallet PUBKEY [--range 24h|7d|30d] [--json]
  strata maker-status --market-id ID --wallet PUBKEY [--json]
  strata maker-reputation --market-id ID --wallet PUBKEY [--json]
  strata session-keygen [--json]                  generate a session key pair (register it with vault-setup or on the first deposit)
  strata vault-status --wallet PUBKEY [--session-public-key PUBKEY] [--json]
  strata vault-pause --wallet PUBKEY --paused true|false [--json]
  strata vault-setup --wallet PUBKEY --session-public-key PUBKEY [--market-id ID] [--limit ASSET_ID[=MAX_ATOMS] ...] [--expires-at-ms N] [--min-interval-seconds N] [--tolerance-bps N] [--json]
  strata vault-deposit --wallet PUBKEY --market-id ID --asset-id ID --amount-atoms N [--session-public-key PUBKEY] [--json]
  strata vault-withdraw --wallet PUBKEY --market-id ID --asset-id ID --destination-wallet PUBKEY --amount-atoms N [--json]
  strata vault-submit --preparation-id ID --signed-transaction BASE64 --idempotency-key KEY [--json]
  strata vault-submission --preparation-id ID [--json]
  strata vault-delegate --wallet PUBKEY --session-public-key PUBKEY --action revoke [--json]
  strata vault-policy --wallet PUBKEY --mode blocked|restricted [--allowed-wallets PUBKEY,...] [--json]
  strata rewards [--wallet PUBKEY] [--limit N] [--json]
  strata referrals --wallet PUBKEY [--json]
  strata referral-link --wallet PUBKEY --code CODE [--authorization-signature HEX] [--json]
  strata referral-claim --wallet PUBKEY [--payout-wallet PUBKEY] [--authorization-signature HEX] [--json]
  strata bugs --wallet PUBKEY [--json]
  strata bug-payload --message TEXT [--json]
  strata bug-submit --owner-wallet PUBKEY --message TEXT --authorization-signature HEX [--json]
  strata order-slo --market-id ID --owner-wallet PUBKEY [--connections N] [--samples N] [--inflight N] [--warmup N] [--json]

Global:
  --api-base URL       Public Strata API (default: ${DEFAULT_API_BASE})
  --timeout-ms N       Request timeout (default: 10000)
  --tolerance-bps N    The most you accept below the quoted output, in bps
                       (default: 0). Your choice; unrelated to the measured
                       price impact the quote reports. --slippage-bps is the
                       legacy spelling.
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

  if (parsed.command === "order-slo") {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const spki = publicKey.export({ type: "spki", format: "der" });
    const rawPublicKey = new Uint8Array(spki.subarray(spki.length - 32));
    const signer = {
      publicKey: base58Encode(rawPublicKey),
      signMessage: async (message: Uint8Array) =>
        new Uint8Array(ed25519Sign(null, Buffer.from(message), privateKey)),
      signTransaction: async (): Promise<string> => {
        throw new Error("the non-trading SLO probe never signs a transaction");
      },
    };
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const marketId = value(parsed.flags, "market-id");
    const ownerWallet = value(parsed.flags, "owner-wallet");
    const certificate = await certifyPlatformOrderCommandSlo({
      connections: Number(value(parsed.flags, "connections", "50")),
      samples: Number(value(parsed.flags, "samples", "10000")),
      warmupSamplesPerConnection: Number(value(parsed.flags, "warmup", "10")),
      maximumInflightPerConnection: Number(value(parsed.flags, "inflight", "16")),
      thresholds: PRODUCTION_ORDER_COMMAND_SLO,
      connect: (index) => platform.orders.connect(
        marketId,
        ownerWallet,
        signer,
        {
          onError: (error) => {
            if (!json) console.error(`connection ${index}: ${error.message}`);
          },
        },
        { reconnect: false, requestTimeoutMs: timeoutMs },
      ),
    });
    console.log(JSON.stringify(certificate, null, 2));
    if (!certificate.passed) process.exitCode = 2;
    return;
  }

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

  if (parsed.command === "platform-graph") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const graph = await platform.discovery.graph();
    if (json) console.log(JSON.stringify(graph, null, 2));
    else {
      const live = graph.operations.filter((operation) => operation.available).length;
      console.log(`Strata platform graph ${graph.graph_version}`);
      console.log(`  ${graph.modules.length} modules, ${graph.entities.length} entities`);
      console.log(`  ${live}/${graph.operations.length} operations currently live`);
      for (const workflow of graph.workflows) {
        const ready = workflow.nodes.filter((node) => node.available).length;
        console.log(`  ${workflow.id}: ${ready}/${workflow.nodes.length} nodes live`);
      }
    }
    return;
  }

  if (parsed.command === "platform-status") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const status = await platform.discovery.status();
    if (json) console.log(JSON.stringify(status, null, 2));
    else {
      console.log(`Strata ${status.status}`);
      console.log(`  ${status.available_operations} mapped operations currently live`);
      console.log(`  server time: ${status.server_time_ms}`);
    }
    return;
  }

  if (parsed.command === "mark") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const mark = await platform.marketData.mark(value(parsed.flags, "market-id"));
    if (json) console.log(JSON.stringify(mark, null, 2));
    else {
      console.log(`${mark.market_id} ${mark.stale ? "stale" : "current"}`);
      console.log(`  price atoms/base unit: ${mark.price_atoms_per_base_unit ?? "unavailable"}`);
      console.log(`  quote decimals:        ${mark.quote_decimals}`);
      console.log(`  age:                   ${mark.age_ms ?? "unknown"} ms`);
    }
    return;
  }

  if (parsed.command === "candles") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const candles = await platform.marketData.candles(
      value(parsed.flags, "market-id"),
      {
        fromMs: Number(value(parsed.flags, "from-ms")),
        toMs: Number(value(parsed.flags, "to-ms")),
        resolutionSeconds: Number(value(parsed.flags, "resolution-seconds", "300")),
      },
    );
    if (json) console.log(JSON.stringify(candles, null, 2));
    else {
      console.log(`${candles.market_id}: ${candles.candles.length} candles`);
      for (const candle of candles.candles) {
        console.log(
          `${candle.started_at_ms} O=${candle.open_price} H=${candle.high_price} `
          + `L=${candle.low_price} C=${candle.close_price}`,
        );
      }
    }
    return;
  }

  if (parsed.command === "execution-status") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const receipt = await platform.executions.status(
      value(parsed.flags, "market-id"),
      value(parsed.flags, "execution-id"),
    );
    if (json) console.log(JSON.stringify(receipt, null, 2));
    else {
      console.log(`${receipt.execution_id}: ${receipt.status}`);
      console.log(`  settlement: ${receipt.settlement}`);
      console.log(`  signature:  ${receipt.signature ?? "not submitted"}`);
      console.log(`  updated:    ${receipt.updated_at_ms}`);
    }
    return;
  }

  if (parsed.command === "maker-status") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    // Public by wallet address — no signature.
    const response = await platform.marketMaking.status(
      value(parsed.flags, "market-id"),
      value(parsed.flags, "wallet"),
    );
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`${response.wallet_address} in ${response.market_id}: ${response.active_products} active maker products at slot ${response.current_slot}`);
      console.log(`  firm orders: ${response.firm_orders.resting_orders} (bids ${response.firm_orders.bid_orders}, asks ${response.firm_orders.ask_orders})`);
      console.log(`  signed lane: ${response.signed_quotes.eligible ? "eligible" : "not eligible"}, ${response.signed_quotes.live_quotes.length} live quotes`);
      console.log(`  strands:     ${response.strands.length}, currents: ${response.currents.length}, dead-man guards: ${response.dead_man_guards.length}`);
    }
    return;
  }

  if (parsed.command === "maker-reputation") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    // Public by wallet address — no signature.
    const response = await platform.marketMaking.reputation(
      value(parsed.flags, "market-id"),
      value(parsed.flags, "wallet"),
    );
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`${response.wallet_address}: ${response.tier} (${response.reputation_score})`);
      console.log(`  active:      ${response.active}`);
      console.log(`  fill rate:   ${response.fill_rate_bps} bps`);
      console.log(`  quote lane:  ${response.signed_quote_stream_eligible ? "eligible" : "not eligible"}`);
      console.log(`  next tier:   ${response.tier_progress.next_tier ?? "highest tier"}`);
    }
    return;
  }

  if (parsed.command === "twaps") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const response = await platform.algos.twaps(
      value(parsed.flags, "market-id"),
      value(parsed.flags, "wallet"),
    );
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`${response.market_id}: ${response.twaps.length} TWAP schedules`);
      for (const twap of response.twaps) {
        console.log(
          `${twap.twap_id} ${twap.side} ${twap.status} `
          + `${twap.slices_executed}/${twap.slices_total} slices`,
        );
      }
    }
    return;
  }

  if (parsed.command === "twap-challenge") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const side = value(parsed.flags, "side");
    if (side !== "buy" && side !== "sell") throw new Error("--side must be buy or sell");
    const response = await platform.algos.challenge(
      value(parsed.flags, "market-id"),
      {
        action: "place",
        ownerWallet: value(parsed.flags, "owner-wallet"),
        sessionPublicKey: value(parsed.flags, "session-public-key"),
        side,
        totalSizeAtoms: value(parsed.flags, "total-size-atoms"),
        slicesTotal: Number(value(parsed.flags, "slices")),
        maximumToleranceBps: Number(value(parsed.flags, "tolerance-bps")),
        intervalSlots: Number(value(parsed.flags, "interval-slots")),
        limitPriceAtoms: value(parsed.flags, "limit-price-atoms"),
      },
    );
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`challenge:     ${response.challenge_id}`);
      console.log(`twap:          ${response.twap_id}`);
      console.log(`authorization: ${response.authorization_payload_base64}`);
      console.log(`expires:       ${response.expires_at_ms}`);
    }
    return;
  }

  if (parsed.command === "twap-cancel") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const response = await platform.algos.challenge(
      value(parsed.flags, "market-id"),
      {
        action: "cancel",
        ownerWallet: value(parsed.flags, "owner-wallet"),
        sessionPublicKey: value(parsed.flags, "session-public-key"),
        twapId: value(parsed.flags, "twap-id"),
      },
    );
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`challenge:     ${response.challenge_id}`);
      console.log(`twap:          ${response.twap_id}`);
      console.log(`authorization: ${response.authorization_payload_base64}`);
      console.log(`expires:       ${response.expires_at_ms}`);
    }
    return;
  }

  if (parsed.command === "twap-prepare") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    // One signature: pass the action itself and sign only the returned
    // transaction. A signed challenge is still accepted.
    const challengeId = parsed.flags.get("challenge-id");
    let prepareInput: PlatformTwapPrepareInput;
    if (typeof challengeId === "string") {
      prepareInput = {
        challengeId,
        authorizationSignature: value(parsed.flags, "authorization-signature"),
      };
    } else if (typeof parsed.flags.get("twap-id") === "string") {
      prepareInput = {
        operation: {
          action: "cancel",
          ownerWallet: value(parsed.flags, "owner-wallet"),
          sessionPublicKey: value(parsed.flags, "session-public-key"),
          twapId: value(parsed.flags, "twap-id"),
        },
      };
    } else {
      const side = value(parsed.flags, "side");
      if (side !== "buy" && side !== "sell") throw new Error("--side must be buy or sell");
      prepareInput = {
        operation: {
          action: "place",
          ownerWallet: value(parsed.flags, "owner-wallet"),
          sessionPublicKey: value(parsed.flags, "session-public-key"),
          side,
          totalSizeAtoms: value(parsed.flags, "total-size-atoms"),
          slicesTotal: Number(value(parsed.flags, "slices")),
          maximumToleranceBps: Number(value(parsed.flags, "tolerance-bps")),
          intervalSlots: Number(value(parsed.flags, "interval-slots")),
          limitPriceAtoms: value(parsed.flags, "limit-price-atoms"),
        },
      };
    }
    const response = await platform.algos.prepare(value(parsed.flags, "market-id"), prepareInput);
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`control:     ${response.twap_control_id}`);
      console.log(`twap:        ${response.twap_id}`);
      console.log(`transaction: ${response.transaction_base64}`);
      console.log(`expires:     ${response.expires_at_ms}`);
    }
    return;
  }

  if (parsed.command === "twap-submit") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const response = await platform.algos.submit(
      value(parsed.flags, "market-id"),
      {
        twapControlId: value(parsed.flags, "twap-control-id"),
        signedTransactionBase64: value(parsed.flags, "signed-transaction-base64"),
        idempotencyKey: value(parsed.flags, "idempotency-key"),
      },
    );
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`control:   ${response.twap_control_id}`);
      console.log(`twap:      ${response.twap_id}`);
      console.log(`signature: ${response.signature}`);
      console.log(`status:    ${response.status}`);
    }
    return;
  }

  if (parsed.command === "portfolio" || parsed.command === "account") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const response = await platform.account.read(value(parsed.flags, "wallet"));
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(
        `${response.wallet_address}: ${response.balances.length} held assets, ${response.open_orders.length} open orders, ${response.recent_fills.length} recent fills across ${response.market_count} live markets`,
      );
      console.log(`  observed:  slot ${response.observed_slot} at ${response.observed_at_ms}`);
      console.log(`  equity:    ${response.equity_usd_micros ?? "unpriced"} USD micros`);
      console.log(`  available: ${response.available_usd_micros ?? "unpriced"} USD micros`);
      console.log(`  locked:    ${response.locked_usd_micros ?? "unpriced"} USD micros`);
      for (const balance of response.balances) {
        console.log(
          `  ${balance.asset_id}: total ${balance.total_atoms} available ${balance.available_atoms} locked ${balance.locked_atoms}`,
        );
      }
      for (const order of response.open_orders) {
        console.log(
          `  order ${order.order_id} ${order.market_id}: ${order.side} ${order.order_type} ${order.remaining_size_atoms}/${order.original_size_atoms} @ ${order.limit_price_atoms} (${order.state})`,
        );
      }
      for (const fill of response.recent_fills.slice(0, 20)) {
        console.log(
          `  fill ${fill.fill_id} ${fill.market_id}: ${fill.side} ${fill.size_atoms} @ ${fill.price_atoms} ${fill.settlement} at ${fill.executed_at_ms}`,
        );
      }
      if (response.unavailable_market_ids.length > 0) {
        console.log(`  unavailable markets: ${response.unavailable_market_ids.join(", ")}`);
      }
      if (!response.valuation_complete) {
        console.log(`  unpriced:  ${response.unpriced_asset_ids.join(", ")}`);
      }
    }
    return;
  }

  if (parsed.command === "portfolio-history") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const range = value(parsed.flags, "range", "24h") as "24h" | "7d" | "30d";
    const response = await platform.account.portfolioHistory(
      value(parsed.flags, "wallet"),
      range,
    );
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`${response.wallet_address}: ${response.points.length} stored equity samples`);
      console.log(`  range:      ${response.range}`);
      console.log(`  collecting: ${response.collecting}`);
      console.log(`  latest:     ${response.last_sample_ms ?? "none"}`);
    }
    return;
  }

  if (parsed.command === "session-keygen") {
    // A fresh session key pair for a bot. Register the public key once
    // (`vault-setup`, or `vault-deposit --session-public-key`); keep the secret
    // in the bot's secret manager and load it with `sessionSignerFromSecretKey`.
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const spki = publicKey.export({ type: "spki", format: "der" });
    const pkcs8 = privateKey.export({ type: "pkcs8", format: "der" });
    const rawPublicKey = new Uint8Array(spki.subarray(spki.length - 32));
    const seed = new Uint8Array(pkcs8.subarray(pkcs8.length - 32));
    const secretKey = new Uint8Array(64);
    secretKey.set(seed, 0);
    secretKey.set(rawPublicKey, 32);
    const out = {
      session_public_key: base58Encode(rawPublicKey),
      session_secret_key: base58Encode(secretKey),
    };
    if (json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`session public key: ${out.session_public_key}`);
      console.log(`session secret key: ${out.session_secret_key}`);
      console.log("  register: strata vault-setup --wallet OWNER --session-public-key <public key>");
      console.log("  bot:      sessionSignerFromSecretKey(<secret key>) — never share or transmit it");
    }
    return;
  }

  if (parsed.command === "vault-status") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const sessionFlag = parsed.flags.get("session-public-key");
    const response = await platform.vault.status({
      walletAddress: value(parsed.flags, "wallet"),
      ...(typeof sessionFlag === "string" ? { sessionPublicKey: sessionFlag } : {}),
    });
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`${response.wallet_address}: ${response.state}`);
      console.log(`  withdrawals: ${response.withdrawal_access.mode}`);
      if (response.session) {
        console.log(`  session:     ${response.session.state}`);
        console.log(`  executable:  ${response.session.market_execution_ready}`);
        console.log(`  expires:     ${response.session.expires_at_ms ?? "permanent or absent"}`);
      }
    }
    return;
  }

  if (parsed.command === "vault-pause") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const pausedValue = value(parsed.flags, "paused");
    if (pausedValue !== "true" && pausedValue !== "false") {
      throw new Error("--paused must be true or false");
    }
    const response = await platform.vault.preparePause({
      walletAddress: value(parsed.flags, "wallet"),
      paused: pausedValue === "true",
    });
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`${response.wallet_address}: prepare ${response.paused ? "pause" : "resume"}`);
      console.log(`  transaction: ${response.transaction_base64}`);
      console.log(`  blockhash:   ${response.recent_blockhash}`);
      console.log(`  preparation: ${response.preparation_id}`);
      console.log(`  sponsored:   ${response.sponsored ? "yes — Strata pays the fee and rent" : "no — the owner wallet pays"}`);
      console.log("  next:        verify, then owner-sign and `strata vault-submit`");
    }
    return;
  }

  if (parsed.command === "vault-setup") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const expiry = parsed.flags.get("expires-at-ms");
    const marketId = parsed.flags.get("market-id");
    const interval = parsed.flags.get("min-interval-seconds");
    const tolerance = parsed.flags.get("tolerance-bps");
    // `--limit ASSET_ID` (unlimited) or `--limit ASSET_ID=MAX_ATOMS`; the
    // parser keeps the last value per flag, so several limits are comma-joined.
    const rawLimits = parsed.flags.get("limit");
    const spendingLimits = typeof rawLimits === "string"
      ? rawLimits.split(",").filter((entry) => entry.length > 0).map((entry) => {
        const separator = entry.indexOf("=");
        return separator === -1
          ? { assetId: entry, maximumPerExecutionAtoms: null }
          : { assetId: entry.slice(0, separator), maximumPerExecutionAtoms: entry.slice(separator + 1) };
      })
      : [];
    const response = await platform.vault.prepareSetup({
      walletAddress: value(parsed.flags, "wallet"),
      sessionPublicKey: value(parsed.flags, "session-public-key"),
      marketId: typeof marketId === "string" ? marketId : null,
      expiresAtMs: typeof expiry === "string" ? Number(expiry) : null,
      minimumIntervalSeconds: typeof interval === "string" ? Number(interval) : undefined,
      maximumToleranceBps: typeof tolerance === "string" ? Number(tolerance) : undefined,
      spendingLimits,
    });
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`${response.wallet_address}: ${response.mode}`);
      console.log(`  session:     ${response.session_public_key}`);
      if (response.market_id !== null) console.log(`  market:      ${response.market_id}`);
      const cadence = response.minimum_interval_seconds === 0
        ? "strategy-controlled timing"
        : `${response.minimum_interval_seconds}s hard cadence floor`;
      console.log(`  policy:      ${response.permanent ? "permanent" : `until ${response.expires_at_ms}`}, ${cadence}, ${response.maximum_tolerance_bps} bps, ${response.spending_limits.length === 0 ? "no spending limits" : `${response.spending_limits.length} spending limit(s)`}`);
      console.log(`  transaction: ${response.transaction_base64}`);
      console.log(`  preparation: ${response.preparation_id}`);
      console.log(`  sponsored:   ${response.sponsored ? "yes — Strata pays the fee and rent" : "no — the owner wallet pays"}`);
      console.log("  next:        verify every echoed policy field, then owner-sign and `strata vault-submit`");
    }
    return;
  }

  if (parsed.command === "vault-delegate") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const action = value(parsed.flags, "action");
    if (action !== "revoke") throw new Error("--action must be revoke");
    const response = await platform.vault.prepareDelegate({
      walletAddress: value(parsed.flags, "wallet"),
      sessionPublicKey: value(parsed.flags, "session-public-key"),
      action,
    });
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`${response.wallet_address}: ${response.action}`);
      console.log(`  session:     ${response.session_public_key}`);
      console.log(`  transaction: ${response.transaction_base64}`);
      console.log(`  preparation: ${response.preparation_id}`);
      console.log(`  sponsored:   ${response.sponsored ? "yes — Strata pays the fee and rent" : "no — the owner wallet pays"}`);
      console.log("  next:        verify both identities and the action, then owner-sign and `strata vault-submit`");
    }
    return;
  }

  if (parsed.command === "vault-deposit") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const depositSession = parsed.flags.get("session-public-key");
    const response = await platform.vault.prepareDeposit({
      walletAddress: value(parsed.flags, "wallet"),
      marketId: value(parsed.flags, "market-id"),
      assetId: value(parsed.flags, "asset-id"),
      amountAtoms: value(parsed.flags, "amount-atoms"),
      sessionPublicKey: typeof depositSession === "string" ? depositSession : null,
    });
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`${response.wallet_address}: deposit ${response.amount_atoms}`);
      if (response.network_cost_atoms !== "0") {
        console.log(`  network cost recovered in this deposit: ${response.network_cost_atoms} atoms (sponsored SOL Strata already spent for you)`);
      }
      if (response.registers_session) {
        console.log(`  session:     ${response.session_public_key} — registered by this same signature (default policy)`);
      } else if (response.session_public_key !== null) {
        console.log(`  session:     ${response.session_public_key} — already registered`);
      }
      console.log(`  market:      ${response.market_id}`);
      console.log(`  asset:       ${response.asset_id}`);
      console.log(`  transaction: ${response.transaction_base64}`);
      console.log(`  preparation: ${response.preparation_id}`);
      console.log(`  sponsored:   ${response.sponsored ? "yes — Strata pays the fee and rent" : "no — the owner wallet pays"}`);
      console.log("  next:        verify the exact market, asset, and amount, then owner-sign and `strata vault-submit`");
    }
    return;
  }

  if (parsed.command === "vault-withdraw") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const response = await platform.vault.prepareWithdrawal({
      walletAddress: value(parsed.flags, "wallet"),
      marketId: value(parsed.flags, "market-id"),
      assetId: value(parsed.flags, "asset-id"),
      destinationWalletAddress: value(parsed.flags, "destination-wallet"),
      amountAtoms: value(parsed.flags, "amount-atoms"),
    });
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`${response.wallet_address}: withdraw ${response.amount_atoms}`);
      console.log(`  market:      ${response.market_id}`);
      console.log(`  asset:       ${response.asset_id}`);
      console.log(`  destination: ${response.destination_wallet_address}`);
      console.log(`  transaction: ${response.transaction_base64}`);
      console.log(`  preparation: ${response.preparation_id}`);
      console.log(`  sponsored:   ${response.sponsored ? "yes — Strata pays the fee and rent" : "no — the owner wallet pays"}`);
      console.log("  next:        verify the exact destination and amount, then owner-sign and `strata vault-submit`");
    }
    return;
  }

  if (parsed.command === "vault-submit") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const response = await platform.vault.submit({
      preparationId: value(parsed.flags, "preparation-id"),
      signedTransactionBase64: value(parsed.flags, "signed-transaction"),
      idempotencyKey: value(parsed.flags, "idempotency-key"),
    });
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`${response.wallet_address}: ${response.action} ${response.status}`);
      console.log(`  signature:   ${response.signature}`);
      console.log(`  sponsored:   ${response.sponsored ? "yes" : "no"}`);
      if (response.failure_code) console.log(`  failure:     ${response.failure_code}`);
      console.log("  next:        `strata vault-submission --preparation-id ...` until confirmed");
    }
    return;
  }

  if (parsed.command === "vault-submission") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const response = await platform.vault.submission(value(parsed.flags, "preparation-id"));
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`${response.wallet_address}: ${response.action} ${response.status}`);
      console.log(`  signature:   ${response.signature}`);
      if (response.failure_code) console.log(`  failure:     ${response.failure_code}`);
    }
    return;
  }

  if (parsed.command === "vault-policy") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const mode = value(parsed.flags, "mode");
    if (mode !== "blocked" && mode !== "restricted") {
      throw new Error("--mode must be blocked or restricted");
    }
    const allowedWallets = value(parsed.flags, "allowed-wallets", "")
      .split(",")
      .map((wallet) => wallet.trim())
      .filter(Boolean);
    const response = await platform.vault.preparePolicy({
      walletAddress: value(parsed.flags, "wallet"),
      withdrawalAccess: { mode, allowedWalletAddresses: allowedWallets },
    });
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`${response.wallet_address}: ${response.withdrawal_access.mode}`);
      console.log(`  allowed:     ${response.withdrawal_access.allowed_wallet_addresses.join(", ") || "none"}`);
      console.log(`  transaction: ${response.transaction_base64}`);
      console.log(`  preparation: ${response.preparation_id}`);
      console.log(`  sponsored:   ${response.sponsored ? "yes — Strata pays the fee and rent" : "no — the owner wallet pays"}`);
      console.log("  next:        verify the exact access policy, then owner-sign and `strata vault-submit`");
    }
    return;
  }

  if (parsed.command === "rewards") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const walletFlag = parsed.flags.get("wallet");
    const response = await platform.rewards.read({
      ...(typeof walletFlag === "string" ? { walletAddress: walletFlag } : {}),
      limit: Number(value(parsed.flags, "limit", "25")),
    });
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`Strata rewards · ${response.season}`);
      console.log(`  wallets: ${response.total_wallets}`);
      if (response.owner) {
        console.log(`  owner:   ${response.owner.points} points, rank ${response.owner.rank ?? "—"}`);
      }
      for (const row of response.standings) {
        console.log(`  #${row.rank} ${row.wallet_address} ${row.points}`);
      }
    }
    return;
  }

  if (parsed.command === "referrals") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const response = await platform.referrals.read(value(parsed.flags, "wallet"));
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`${response.wallet_address}: referrals ${response.enabled ? "enabled" : "disabled"}`);
      console.log(`  code:       ${response.referral_code ?? "none"}`);
      console.log(`  referred:   ${response.referred_wallets}`);
      console.log(`  points:     ${response.referral_points}`);
      console.log(`  claimable:  ${response.cash_claimable_atoms} atoms`);
    }
    return;
  }

  if (parsed.command === "referral-link") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const walletAddress = value(parsed.flags, "wallet");
    const referralCode = value(parsed.flags, "code");
    const signature = parsed.flags.get("authorization-signature");
    if (typeof signature !== "string") {
      const payload = platform.referrals.linkAuthorizationPayload(referralCode);
      const output = {
        wallet_address: walletAddress,
        authorization_payload_base64: Buffer.from(payload).toString("base64"),
      };
      if (json) console.log(JSON.stringify(output, null, 2));
      else console.log(output.authorization_payload_base64);
      return;
    }
    const response = await platform.referrals.link({
      walletAddress,
      referralCode,
      authorizationSignature: signature,
    });
    if (json) console.log(JSON.stringify(response, null, 2));
    else console.log(`${response.wallet_address}: ${response.status}`);
    return;
  }

  if (parsed.command === "referral-claim") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const walletAddress = value(parsed.flags, "wallet");
    const payoutFlag = parsed.flags.get("payout-wallet");
    const payoutWalletAddress = typeof payoutFlag === "string" ? payoutFlag : walletAddress;
    const signature = parsed.flags.get("authorization-signature");
    if (typeof signature !== "string") {
      const payload = platform.referrals.claimAuthorizationPayload(payoutWalletAddress);
      const output = {
        wallet_address: walletAddress,
        payout_wallet_address: payoutWalletAddress,
        authorization_payload_base64: Buffer.from(payload).toString("base64"),
      };
      if (json) console.log(JSON.stringify(output, null, 2));
      else console.log(output.authorization_payload_base64);
      return;
    }
    const response = await platform.referrals.claim({
      walletAddress,
      payoutWalletAddress,
      authorizationSignature: signature,
    });
    if (json) console.log(JSON.stringify(response, null, 2));
    else console.log(`${response.claimable_atoms} atoms: ${response.status}`);
    return;
  }

  if (parsed.command === "bugs") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const response = await platform.bugs.read(value(parsed.flags, "wallet"));
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.log(`${response.wallet_address}: ${response.reports.length} reports`);
      for (const report of response.reports) {
        console.log(`  ${report.bug_id} ${report.status} severity=${report.severity}`);
      }
    }
    return;
  }

  if (parsed.command === "bug-payload") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const payload = platform.bugs.authorizationPayload(value(parsed.flags, "message"));
    const encoded = Buffer.from(payload).toString("base64");
    if (json) console.log(JSON.stringify({ authorization_payload_base64: encoded }, null, 2));
    else console.log(encoded);
    return;
  }

  if (parsed.command === "bug-submit") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const response = await platform.bugs.submit({
      ownerWallet: value(parsed.flags, "owner-wallet"),
      message: value(parsed.flags, "message"),
      authorizationSignature: value(parsed.flags, "authorization-signature"),
    });
    if (json) console.log(JSON.stringify(response, null, 2));
    else console.log(`${response.bug_id}: ${response.status}`);
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
      ...(parsed.flags.has("amount-out-atoms")
        ? { amountOutAtoms: value(parsed.flags, "amount-out-atoms") }
        : { amountInAtoms: value(parsed.flags, "amount-atoms") }),
      maximumToleranceBps: Number(
        parsed.flags.has("tolerance-bps")
          ? value(parsed.flags, "tolerance-bps")
          : value(parsed.flags, "slippage-bps", String(DEFAULT_MAXIMUM_TOLERANCE_BPS)),
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
      console.log(`  price impact:   ${quote.price_impact_pct}%  (measured from the book)`);
      console.log(`  tolerance:      ${quote.maximum_tolerance_bps} bps  (yours; floor = minimum atoms)`);
      console.log(`  valid for:       ${quote.expires_at_ms - quote.server_time_ms} ms`);
      console.log(`  provider:        ${quote.provider}`);
    }
    return;
  }

  if (parsed.command === "swap-quote") {
    const platform = new StrataPlatformClient({
      apiBase: value(parsed.flags, "api-base", DEFAULT_API_BASE),
      timeoutMs,
    });
    const quote = await platform.quotes.swap({
      inputAssetId: value(parsed.flags, "input-asset-id"),
      outputAssetId: value(parsed.flags, "output-asset-id"),
      amountInAtoms: value(parsed.flags, "amount-atoms"),
      maximumToleranceBps: Number(value(parsed.flags, "tolerance-bps", "0")),
    });
    if (json) console.log(JSON.stringify(quote, null, 2));
    else {
      console.log(`${quote.input_asset_id} → ${quote.output_asset_id}`);
      console.log(`  consumed atoms: ${quote.amount_in_consumed_atoms}`);
      console.log(`  output atoms:   ${quote.amount_out_atoms}`);
      console.log(`  minimum atoms:  ${quote.minimum_output_atoms}`);
      console.log(`  output fee:     ${quote.output_fee_atoms}`);
      console.log(`  valid for:      ${quote.expires_at_ms - quote.server_time_ms} ms`);
    }
    return;
  }

  if (parsed.command === "execution-challenge") {
    const response = await client.executionChallenge({
      market: value(parsed.flags, "market"),
      quoteId: value(parsed.flags, "quote-id"),
      ownerWallet: value(parsed.flags, "owner-wallet"),
      sessionPublicKey: value(parsed.flags, "session-public-key"),
      ...(parsed.flags.has("account-sequence")
        ? { accountSequence: value(parsed.flags, "account-sequence") }
        : {}),
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
    // One signature: bind the quote directly and sign only the returned
    // transaction. A signed challenge is still accepted.
    const challengeId = parsed.flags.get("challenge-id");
    const accountSequence = parsed.flags.get("account-sequence");
    const response = await client.executionPrepare(
      typeof challengeId === "string"
        ? {
          market: value(parsed.flags, "market"),
          challengeId,
          authorizationSignature: value(parsed.flags, "authorization-signature"),
        }
        : {
          market: value(parsed.flags, "market"),
          quoteId: value(parsed.flags, "quote-id"),
          ownerWallet: value(parsed.flags, "owner-wallet"),
          sessionPublicKey: value(parsed.flags, "session-public-key"),
          ...(typeof accountSequence === "string" ? { accountSequence } : {}),
        },
    );
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

  if (parsed.command === "execute-quote") {
    // One-shot instant swap: quote → verify → sign with the session key → submit.
    // The session secret is read from --session-secret or STRATA_SESSION_SECRET_KEY
    // and never leaves this process. Withdraw/policy/pause stay owner-only.
    const secret = parsed.flags.has("session-secret")
      ? value(parsed.flags, "session-secret")
      : process.env.STRATA_SESSION_SECRET_KEY;
    if (!secret) {
      throw new Error(
        "execute-quote needs the session secret (--session-secret or STRATA_SESSION_SECRET_KEY)",
      );
    }
    const ownerWallet = parsed.flags.has("owner-wallet")
      ? value(parsed.flags, "owner-wallet")
      : process.env.STRATA_OWNER_WALLET;
    if (!ownerWallet) {
      throw new Error("execute-quote needs --owner-wallet (or STRATA_OWNER_WALLET)");
    }
    const signer = await sessionSignerFromSecretKey(
      secret.trim(),
      parsed.flags.has("session-public-key") ? value(parsed.flags, "session-public-key") : undefined,
    );
    const side = value(parsed.flags, "side") as QuoteSide;
    const quote = await client.quote({
      market: value(parsed.flags, "market"),
      side,
      amountInAtoms: value(parsed.flags, "amount-atoms"),
      maximumToleranceBps: Number(
        value(parsed.flags, "tolerance-bps", String(DEFAULT_MAXIMUM_TOLERANCE_BPS)),
      ),
    });
    const receipt = await client.executeQuote({
      quote,
      ownerWallet,
      signer,
      ...(parsed.flags.has("idempotency-key")
        ? { idempotencyKey: value(parsed.flags, "idempotency-key") }
        : {}),
    });
    if (json) console.log(JSON.stringify(receipt, null, 2));
    else {
      console.log(`executed ${quote.side} on ${quote.market_id}`);
      console.log(`execution: ${receipt.execution_id}`);
      console.log(`signature: ${receipt.signature}`);
      console.log(`status:    ${receipt.status}`);
    }
    return;
  }

  throw new Error(`unknown command: ${parsed.command}`);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
