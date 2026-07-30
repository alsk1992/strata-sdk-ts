import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { StrataClient, StrataContractError } from "../src/index.js";

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
    slippageBps: 50,
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
    slippage_bps: 50,
  });
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
