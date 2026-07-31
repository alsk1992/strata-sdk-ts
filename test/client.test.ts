import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  StrataClient,
  StrataContractError,
  type QuoteResponse,
} from "../src/index.js";

async function fixture(name: string): Promise<Record<string, unknown>> {
  const candidates = [
    resolve(process.cwd(), "contract/v1", `${name}.json`),
    resolve(process.cwd(), "../contract/v1", `${name}.json`),
  ];
  for (const path of candidates) {
    try {
      return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error(`missing contract fixture ${name}`);
}

test("reads shared fixtures and binds a quote to its request", async () => {
  const markets = await fixture("markets");
  const quote = await fixture("quote");
  const requests: Array<{ url: URL; init: RequestInit | undefined }> = [];
  const fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    requests.push({ url, init });
    if (url.pathname === "/sonar/markets") return Response.json(markets);
    if (url.pathname === "/sonar/markets/sol-usdc/quote") return Response.json(quote);
    return new Response(null, { status: 404 });
  };
  const client = new StrataClient({ apiBase: "https://example.test", fetch });
  const response = await client.quote({
    market: "sol/usdc",
    side: "sell",
    amountInAtoms: 10_000_000n,
  });

  assert.equal(response.quote_id, "sq_0123456789abcdef0123456789abcdef");
  assert.equal(response.amount_out_atoms, "1990000");
  const quoteRequest = requests.at(-1);
  assert.equal(quoteRequest?.url.pathname, "/sonar/markets/sol-usdc/quote");
  assert.equal(quoteRequest?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(quoteRequest?.init?.body)), {
    market_id: "11111111111111111111111111111111",
    side: "sell",
    amount_in_atoms: "10000000",
    slippage_bps: 0,
  });
});

test("passes an explicit execution tolerance unchanged", async () => {
  const markets = await fixture("markets");
  const quote = await fixture("quote");
  let quoteBody: Record<string, unknown> | undefined;
  const fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname === "/sonar/markets") return Response.json(markets);
    if (init?.body) quoteBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    return Response.json(quote);
  };
  const client = new StrataClient({ apiBase: "https://example.test", fetch });

  await client.quote({
    market: "SOL/USDC",
    side: "sell",
    amountInAtoms: "10000000",
    slippageBps: 25,
  });

  assert.equal(quoteBody?.slippage_bps, 25);
});

test("fails closed when a quote gains an unreviewed field", async () => {
  const markets = await fixture("markets");
  const quote = { ...(await fixture("quote")), unexpected_field: "hidden" };
  const fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    return Response.json(url.pathname === "/sonar/markets" ? markets : quote);
  };
  const client = new StrataClient({ apiBase: "https://example.test", fetch });

  await assert.rejects(
    client.quote({
      market: "SOL/USDC",
      side: "sell",
      amountInAtoms: "10000000",
    }),
    /unrecognized or missing fields/,
  );
});

test("rejects a quote bound to a different public market", async () => {
  const markets = await fixture("markets");
  const quote = { ...(await fixture("quote")), market_id: "BTC/USDC" };
  const fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    return Response.json(url.pathname === "/sonar/markets" ? markets : quote);
  };
  const client = new StrataClient({ apiBase: "https://example.test", fetch });

  await assert.rejects(
    client.quote({
      market: "SOL/USDC",
      side: "sell",
      amountInAtoms: "10000000",
    }),
    StrataContractError,
  );
});

test("refuses a discovered operation outside the public Sonar surface", async () => {
  const markets = await fixture("markets");
  const rows = markets.markets as Array<Record<string, unknown>>;
  const first = rows[0];
  if (!first) throw new Error("missing market fixture");
  rows[0] = { ...first, quote_path: "/unsupported/operation" };
  const fetch = async (): Promise<Response> => Response.json(markets);
  const client = new StrataClient({ apiBase: "https://example.test", fetch });

  await assert.rejects(
    client.quote({
      market: "SOL/USDC",
      side: "sell",
      amountInAtoms: "10000000",
    }),
    StrataContractError,
  );
});

test("binds execution to minimum output and verifies before session signing", async () => {
  const markets = await fixture("markets");
  const quote = {
    ...(await fixture("quote")),
    server_time_ms: Date.now(),
    expires_at_ms: Date.now() + 10_000,
  } as unknown as QuoteResponse;
  const quoteId = String(quote.quote_id);
  const challengeId = "sc_0123456789abcdef0123456789abcdef";
  const owner = "11111111111111111111111111111111";
  const payload = Buffer.concat([
    Buffer.from("strata-sonar-execution:v1\0"),
    Buffer.alloc(32),
    Buffer.from(quoteId),
    Buffer.alloc(32),
    Buffer.alloc(32),
    Buffer.from([1]),
    u64(String(quote.amount_in_atoms)),
    u64(String(quote.minimum_output_atoms)),
    u64("7"),
    u64("0"),
    Buffer.alloc(32),
    u64("123456789"),
    u64(String(quote.expires_at_ms)),
    Buffer.from(challengeId.slice(3), "hex"),
    Buffer.alloc(16),
  ]);
  const challenge = {
    schema_version: 1,
    contract_version: "1.1",
    challenge_id: challengeId,
    quote_id: quoteId,
    market_id: quote.market_id,
    side: quote.side,
    amount_in_atoms: quote.amount_in_atoms,
    minimum_output_atoms: quote.minimum_output_atoms,
    authorization_payload_base64: payload.toString("base64"),
    server_time_ms: quote.server_time_ms,
    expires_at_ms: quote.expires_at_ms,
  };
  const prepared = {
    ...(await fixture("execution-prepare")),
    expires_at_ms: quote.expires_at_ms,
  };
  const submitted = await fixture("execution-submit");
  const calls: string[] = [];
  const fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const path = new URL(input instanceof Request ? input.url : input).pathname;
    if (path === "/sonar/markets") return Response.json(markets);
    if (path.endsWith("/execution/challenge")) return Response.json(challenge);
    if (path.endsWith("/execution/prepare")) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.challenge_id, challengeId);
      assert.equal(typeof body.authorization_signature, "string");
      return Response.json(prepared);
    }
    if (path.endsWith("/execution/submit")) return Response.json(submitted);
    return new Response(null, { status: 404 });
  };
  const client = new StrataClient({ apiBase: "https://example.test", fetch });
  const result = await client.executeQuote({
    quote,
    ownerWallet: owner,
    accountSequence: 7n,
    signer: {
      publicKey: owner,
      async signMessage(message) {
        calls.push("authorization");
        assert.deepEqual(message, payload);
        return new Uint8Array(64).fill(1);
      },
      async signTransaction(transaction) {
        calls.push("transaction");
        return transaction;
      },
    },
    async verifyTransaction(context) {
      calls.push("verify");
      assert.equal(context.prepared.minimum_output_atoms, quote.minimum_output_atoms);
    },
  });

  assert.equal(result.status, "submitted");
  assert.deepEqual(calls, ["authorization", "verify", "transaction"]);
});

function u64(value: string): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}
