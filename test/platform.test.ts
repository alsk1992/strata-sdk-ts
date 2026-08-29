import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  base58Decode,
  base58Encode,
  certifyPlatformOrderCommandSlo,
  StrataContractError,
  StrataPlatformClient,
  validateOrderAuthorization,
  verifySignedTransactionMessage,
  type PlatformAccountView,
  type PlatformBookView,
  type PlatformMakerView,
  type PlatformTwapsView,
  type PlatformExecutionsView,
} from "../src/index.js";

class FakeWebSocket {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  readonly url: string;
  closed = false;
  /** 0 = CONNECTING, 1 = OPEN, 3 = CLOSED — mirrors the WebSocket constants the SDK inspects. */
  readyState = 1;
  readonly sent: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  emit(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent);
  }

  /** Simulate Node's behaviour for a rejected handshake: `error` only, no `close`. */
  rejectHandshake(): void {
    this.readyState = 0;
    this.onerror?.({} as Event);
  }

  send(value: string): void {
    this.sent.push(value);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.({} as CloseEvent);
  }
}

async function v2Fixture(name: string): Promise<Record<string, unknown>> {
  const candidates = [
    resolve(process.cwd(), "contract/v2", `${name}.json`),
    resolve(process.cwd(), "../contract/v2", `${name}.json`),
  ];
  for (const path of candidates) {
    try {
      return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error(`missing v2 contract fixture ${name}`);
}

function addPlatformCapabilities(
  discovery: Record<string, unknown>,
  definitions: ReadonlyArray<{
    id: string;
    risk?: "read" | "prepare" | "submit" | "destructive";
    transports: readonly ("http" | "websocket" | "mcp")[];
  }>,
): void {
  const capabilities = discovery.capabilities as Array<Record<string, unknown>>;
  for (const definition of definitions) {
    const risk = definition.risk ?? "read";
    capabilities.push({
      id: definition.id,
      risk,
      required_scope: "test",
      transports: definition.transports,
      mcp_exposure: definition.transports.includes("mcp")
        ? risk === "read" ? "read" : risk === "prepare" ? "prepare" : "submit"
        : "none",
    });
  }
}

test("discovers the complete live-gated platform action graph", async () => {
  const graph = await v2Fixture("platform-action-graph");
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      assert.equal(url.pathname, "/v2/action-graph");
      return Response.json(graph);
    },
  });

  const result = await client.discovery.graph();
  assert.equal(result.entry_operation_id, "platform.capabilities.read");
  assert.equal(result.operations.length, 70);
  assert.ok(result.operations.some((operation) => operation.id === "twap.place.submit"));
  assert.ok(result.operations.some((operation) => operation.id === "twap.cancel.submit"));
  assert.ok(result.operations.some((operation) => operation.id === "vault.relay"));
  assert.ok(result.workflows.some((workflow) => workflow.id === "market_making"));
  assert.equal(result.workflows.length, 11);
  assert.deepEqual(
    new Set(result.workflows.flatMap((workflow) => workflow.nodes.flatMap((node) => node.operation_ids))),
    new Set(result.operations.map((operation) => operation.id)),
  );
  assert.ok(!result.entities.includes("perp_market"));
});

test("rejects a platform graph with an orphaned operation", async () => {
  const graph = await v2Fixture("platform-action-graph");
  const operations = graph.operations as Array<Record<string, unknown>>;
  operations.push({
    ...operations[0],
    id: "platform.unmapped.read",
    summary: "This test operation is deliberately absent from every workflow.",
  });
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async () => Response.json(graph),
  });

  await assert.rejects(
    client.discovery.graph(),
    /operation orphaned from every workflow/,
  );
});

test("reads sealed product-level readiness through live discovery", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  capabilities.capabilities = [
    ...(capabilities.capabilities as Array<Record<string, unknown>>),
    {
      id: "platform.status.read",
      risk: "read",
      required_scope: "platform:read",
      transports: ["http", "mcp"],
      mcp_exposure: "read",
    },
  ];
  const status = await v2Fixture("platform-status");
  const requests: string[] = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push(url.pathname);
      if (url.pathname === "/v2/capabilities") return Response.json(capabilities);
      if (url.pathname === "/v2/status") return Response.json(status);
      return new Response(null, { status: 404 });
    },
  });

  const result = await client.discovery.status();
  assert.equal(result.status, "operational");
  assert.equal(result.available_operations, 59);
  assert.deepEqual(requests, ["/v2/capabilities", "/v2/status"]);
});

test("discovers live v2 reads before calling modular asset and market APIs", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  const assets = await v2Fixture("assets");
  const markets = await v2Fixture("markets");
  const requests: string[] = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push(`${url.pathname}${url.search}`);
      if (url.pathname.endsWith("/capabilities")) return Response.json(capabilities);
      if (url.pathname.endsWith("/assets")) return Response.json(assets);
      if (url.pathname.endsWith("/markets")) return Response.json(markets);
      return new Response(null, { status: 404 });
    },
  });

  const discovery = await client.discovery.read();
  const assetPage = await client.assets.list({ limit: 1, cursor: "YQ" });
  const marketPage = await client.markets.list();

  assert.equal(discovery.authority.permission_source, "external_agent_owner");
  assert.equal(assetPage.assets[0]?.symbol, "SOL");
  assert.equal(marketPage.markets[0]?.label, "SOL/USDC");
  assert.deepEqual(requests, [
    "/v2/capabilities",
    "/v2/assets?limit=1&cursor=YQ",
    "/v2/markets",
  ]);
});

test("requests an asset swap quote with exact opaque bindings", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  (capabilities.capabilities as Array<Record<string, unknown>>).push({
    id: "quotes.swap.read",
    risk: "read",
    required_scope: "market:read",
    transports: ["http", "mcp"],
    mcp_exposure: "read",
  });
  const fixture = await v2Fixture("swap-quote");
  let body: Record<string, unknown> | undefined;
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname.endsWith("/capabilities")) return Response.json(capabilities);
      assert.equal(url.pathname, "/v2/quotes");
      assert.equal(init?.method, "POST");
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json(fixture);
    },
  });

  const quote = await client.quotes.swap({
    inputAssetId: "asset_11111111111111111111111111111111",
    outputAssetId: "asset_22222222222222222222222222222222",
    amountInAtoms: 10_000_000n,
    maximumToleranceBps: 50,
  });

  assert.equal(quote.provider, "Sonar");
  assert.equal(quote.amount_out_atoms, "1990000");
  assert.deepEqual(body, {
    input_asset_id: "asset_11111111111111111111111111111111",
    output_asset_id: "asset_22222222222222222222222222222222",
    amount_in_atoms: "10000000",
    maximum_tolerance_bps: 50,
  });
  await assert.rejects(
    client.quotes.swap({
      inputAssetId: "asset_11111111111111111111111111111111",
      outputAssetId: "asset_11111111111111111111111111111111",
      amountInAtoms: "1",
    }),
    /must differ/,
  );
});

test("shares one capability request across concurrent gated connections", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  capabilities.capabilities = [
    ...(capabilities.capabilities as Array<Record<string, unknown>>),
    {
      id: "orders.prepare",
      risk: "prepare",
      required_scope: "orders:prepare",
      transports: ["http", "websocket", "mcp"],
      mcp_exposure: "prepare",
    },
    {
      id: "orders.submit",
      risk: "submit",
      required_scope: "orders:submit",
      transports: ["http", "websocket", "mcp"],
      mcp_exposure: "submit",
    },
  ];
  let capabilityRequests = 0;
  let releaseRequest: (() => void) | undefined;
  const requestGate = new Promise<void>((resolve) => { releaseRequest = resolve; });
  const sockets: FakeWebSocket[] = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async () => {
      capabilityRequests += 1;
      await requestGate;
      return Response.json(capabilities);
    },
  });
  const signer = {
    publicKey: "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2",
    signMessage: async () => new Uint8Array(64),
    signTransaction: async () => "AQIDBA==",
  };
  const pending = Array.from({ length: 50 }, () => client.orders.connect(
    "market_33333333333333333333333333333333",
    "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL",
    signer,
    {},
    {
      reconnect: false,
      webSocketFactory: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    },
  ));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(capabilityRequests, 1);
  releaseRequest!();
  const connections = await Promise.all(pending);
  assert.equal(sockets.length, 50);
  const closedReadiness = connections.map((connection) =>
    connection.ready.catch(() => undefined));
  connections.forEach((connection) => connection.close());
  await Promise.all(closedReadiness);
});

test("reads the complete book, status, fee schedule, and recent trades by opaque market ID", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  addPlatformCapabilities(capabilities, [
    { id: "market_data.book.snapshot", transports: ["http"] },
    { id: "fees.read", transports: ["http"] },
    { id: "markets.status.read", transports: ["http"] },
    { id: "market_data.trades.read", transports: ["http"] },
  ]);
  const fixtures = new Map([
    ["book", await v2Fixture("book")],
    ["bbo", await v2Fixture("bbo")],
    ["fees", await v2Fixture("fees")],
    ["status", await v2Fixture("status")],
    ["trades", await v2Fixture("trades")],
  ]);
  const requests: string[] = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push(`${url.pathname}${url.search}`);
      if (url.pathname.endsWith("/capabilities")) return Response.json(capabilities);
      const resource = url.pathname.split("/").at(-1) ?? "";
      const fixture = fixtures.get(resource);
      return fixture ? Response.json(fixture) : new Response(null, { status: 404 });
    },
  });
  const marketId = "market_33333333333333333333333333333333";

  const book = await client.books.snapshot(marketId, { depth: 50 });
  const bbo = await client.books.bestBidAsk(marketId);
  const fees = await client.books.fees(marketId);
  const status = await client.books.status(marketId);
  const trades = await client.books.trades(marketId, { limit: 25 });

  assert.equal(book.bids[0]?.price_atoms, "149990000");
  assert.equal(bbo.best_ask?.price_atoms, "150010000");
  assert.equal(fees.maximum_immediate_execution_fee_bps, 10);
  assert.equal(status.tick_size_atoms, "10000");
  assert.equal(trades.trades[0]?.side, "buy");
  assert.deepEqual(requests, [
    "/v2/capabilities",
    `/v2/markets/${marketId}/book?depth=50`,
    `/v2/markets/${marketId}/bbo`,
    `/v2/markets/${marketId}/fees`,
    `/v2/markets/${marketId}/status`,
    `/v2/markets/${marketId}/trades?limit=25`,
  ]);
});

test("reads bounded candles and a sanitized market mark without implementation provenance", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  capabilities.capabilities = [
    ...(capabilities.capabilities as Array<Record<string, unknown>>),
    {
      id: "market_data.candles.read",
      risk: "read",
      required_scope: "market:read",
      transports: ["http", "mcp"],
      mcp_exposure: "read",
    },
    {
      id: "market_data.marks.read",
      risk: "read",
      required_scope: "market:read",
      transports: ["http", "websocket", "mcp"],
      mcp_exposure: "read",
    },
  ];
  const candles = await v2Fixture("candles");
  const mark = await v2Fixture("mark");
  const requests: string[] = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push(`${url.pathname}${url.search}`);
      if (url.pathname.endsWith("/capabilities")) return Response.json(capabilities);
      if (url.pathname.endsWith("/candles")) return Response.json(candles);
      if (url.pathname.endsWith("/marks")) return Response.json(mark);
      return new Response(null, { status: 404 });
    },
  });
  const marketId = "market_33333333333333333333333333333333";

  const candlePage = await client.marketData.candles(marketId, {
    fromMs: 1786549800000,
    toMs: 1786550400000,
    resolutionSeconds: 300,
  });
  const currentMark = await client.marketData.mark(marketId);

  assert.equal(candlePage.candles[1]?.close_price, "149.995");
  assert.equal(currentMark.price_atoms_per_base_unit, "149995000");
  assert.equal("source" in currentMark, false);
  assert.deepEqual(requests, [
    "/v2/capabilities",
    `/v2/markets/${marketId}/candles?from_ms=1786549800000&to_ms=1786550400000&resolution_seconds=300`,
    `/v2/markets/${marketId}/marks`,
  ]);
});

test("recovers a restart-durable immediate execution receipt", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  capabilities.capabilities = [
    ...(capabilities.capabilities as Array<Record<string, unknown>>),
    {
      id: "execution.status.read",
      risk: "read",
      required_scope: "trade:read",
      transports: ["http", "mcp"],
      mcp_exposure: "read",
    },
  ];
  const receipt = await v2Fixture("execution-status");
  const marketId = "market_33333333333333333333333333333333";
  const executionId = "se_0123456789abcdef0123456789abcdef";
  const requests: string[] = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push(url.pathname);
      if (url.pathname.endsWith("/capabilities")) return Response.json(capabilities);
      return Response.json(receipt);
    },
  });

  const result = await client.executions.status(marketId, executionId);
  assert.equal(result.status, "confirmed");
  assert.equal(result.settlement, "confirmed");
  assert.deepEqual(requests, [
    "/v2/capabilities",
    `/v2/markets/${marketId}/executions/${executionId}`,
  ]);
});

test("reads sanitized TWAP progress without route or counterparty fields", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  capabilities.capabilities = [
    ...(capabilities.capabilities as Array<Record<string, unknown>>),
    {
      id: "algos.twap.read",
      risk: "read",
      required_scope: "account:read",
      transports: ["http", "mcp"],
      mcp_exposure: "read",
    },
  ];
  const twaps = await v2Fixture("twaps");
  const marketId = "market_33333333333333333333333333333333";
  const wallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname.endsWith("/capabilities")) return Response.json(capabilities);
      assert.equal(url.pathname, `/v2/markets/${marketId}/account/${wallet}/twaps`);
      return Response.json(twaps);
    },
  });

  const result = await client.algos.twaps(marketId, wallet);
  assert.equal(result.twaps[0]?.status, "active");
  assert.equal(result.twaps[0]?.fills[0]?.gross_quote_atoms, "1499500000");
  assert.equal("source" in (result.twaps[0]?.fills[0] ?? {}), false);
  assert.equal("maker_order" in (result.twaps[0]?.fills[0] ?? {}), false);
});

test("reads typed portfolio and community state and submits only an externally signed bug", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  capabilities.capabilities = [
    ...(capabilities.capabilities as Array<Record<string, unknown>>),
    ...[
      ["portfolio.read", "read", "account:read", "read"],
      ["portfolio.history.read", "read", "account:read", "read"],
      ["vault.status.read", "read", "vault:read", "read"],
      ["vault.setup", "submit", "vault:write", "submit"],
      ["vault.deposit", "submit", "vault:write", "submit"],
      ["vault.withdraw", "destructive", "vault:write", "submit"],
      ["vault.delegate.manage", "destructive", "vault:admin", "submit"],
      ["vault.policy.manage", "destructive", "vault:admin", "submit"],
      ["vault.pause", "destructive", "vault:admin", "submit"],
      ["vault.relay", "submit", "vault:write", "submit"],
      ["rewards.read", "read", "rewards:read", "read"],
      ["referrals.read", "read", "rewards:read", "read"],
      ["referrals.link", "submit", "rewards:write", "submit"],
      ["referrals.claim", "submit", "rewards:write", "submit"],
      ["bugs.read", "read", "bugs:read", "read"],
      ["bugs.submit", "submit", "bugs:write", "submit"],
    ].map(([id, risk, required_scope, mcp_exposure]) => ({
      id, risk, required_scope, transports: ["http", "mcp"], mcp_exposure,
    })),
  ];
  const portfolio = await v2Fixture("portfolio-history");
  const livePortfolio = await v2Fixture("portfolio");
  const vaultStatus = await v2Fixture("vault-status");
  const vaultSetup = await v2Fixture("vault-setup-prepare");
  const vaultDeposit = await v2Fixture("vault-deposit-prepare");
  const vaultWithdraw = await v2Fixture("vault-withdraw-prepare");
  const vaultDelegate = await v2Fixture("vault-delegate-prepare");
  const vaultPolicy = await v2Fixture("vault-policy-prepare");
  const vaultPause = await v2Fixture("vault-pause-prepare");
  const vaultSubmit = await v2Fixture("vault-submit");
  let vaultSubmitRequest: Record<string, unknown> | undefined;
  const rewards = await v2Fixture("rewards");
  const referrals = await v2Fixture("referrals");
  const referralLink = await v2Fixture("referral-link");
  const referralClaim = await v2Fixture("referral-claim");
  const bugs = await v2Fixture("bugs");
  const bugSubmit = await v2Fixture("bug-submit");
  const wallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  const requests: string[] = [];
  let submitted: Record<string, unknown> | undefined;
  let linked: Record<string, unknown> | undefined;
  let claimed: Record<string, unknown> | undefined;
  let pauseRequest: Record<string, unknown> | undefined;
  let setupRequest: Record<string, unknown> | undefined;
  let depositRequest: Record<string, unknown> | undefined;
  let withdrawRequest: Record<string, unknown> | undefined;
  let delegateRequest: Record<string, unknown> | undefined;
  let policyRequest: Record<string, unknown> | undefined;
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
      if (url.pathname.endsWith("/capabilities")) return Response.json(capabilities);
      if (url.pathname.includes("portfolio/history")) return Response.json(portfolio);
      if (url.pathname.endsWith("/portfolio")) return Response.json(livePortfolio);
      if (url.pathname === "/v2/vault/status") return Response.json(vaultStatus);
      if (url.pathname === "/v2/vault/setup/prepare" && init?.method === "POST") {
        setupRequest = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json(vaultSetup);
      }
      if (url.pathname === "/v2/vault/deposits/prepare" && init?.method === "POST") {
        depositRequest = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json(vaultDeposit);
      }
      if (url.pathname === "/v2/vault/withdrawals/prepare" && init?.method === "POST") {
        withdrawRequest = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json(vaultWithdraw);
      }
      if (url.pathname === "/v2/vault/delegates/prepare" && init?.method === "POST") {
        delegateRequest = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json(vaultDelegate);
      }
      if (url.pathname === "/v2/vault/policies/prepare" && init?.method === "POST") {
        policyRequest = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json(vaultPolicy);
      }
      if (url.pathname === "/v2/vault/pause/prepare" && init?.method === "POST") {
        pauseRequest = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json(vaultPause);
      }
      if (url.pathname === "/v2/vault/submit" && init?.method === "POST") {
        vaultSubmitRequest = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json(vaultSubmit);
      }
      if (url.pathname === `/v2/vault/submissions/${vaultSubmit.preparation_id}`) {
        return Response.json({ ...vaultSubmit, status: "confirmed", updated_at_ms: 1786896005000 });
      }
      if (url.pathname === "/v2/rewards") return Response.json(rewards);
      if (url.pathname === "/v2/referrals/link" && init?.method === "POST") {
        linked = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json(referralLink);
      }
      if (url.pathname === "/v2/referrals/claim" && init?.method === "POST") {
        claimed = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json(referralClaim);
      }
      if (url.pathname.startsWith("/v2/referrals/")) return Response.json(referrals);
      if (url.pathname === "/v2/bugs" && init?.method === "POST") {
        submitted = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json(bugSubmit);
      }
      if (url.pathname.startsWith("/v2/bugs/")) return Response.json(bugs);
      return new Response(null, { status: 404 });
    },
  });

  const snapshot = await client.account.portfolio(wallet);
  const history = await client.account.portfolioHistory(wallet, "24h");
  const vault = await client.vault.status({
    walletAddress: wallet,
    sessionPublicKey: "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2",
  });
  // Only the wallet and the session key are required; the policy defaults
  // (1 s interval, 100 bps) are filled in and echoed back.
  const setup = await client.vault.prepareSetup({
    walletAddress: wallet,
    sessionPublicKey: "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2",
    replaceSessionPublicKey: null,
    marketId: "market_33333333333333333333333333333333",
    spendingLimits: [
      {
        assetId: "asset_0123456789abcdef0123456789abcdef",
      },
      {
        assetId: "asset_fedcba9876543210fedcba9876543210",
        maximumPerExecutionAtoms: "100000000",
      },
    ],
  });
  // A first deposit that names the session key onboards in the same signature.
  const deposit = await client.vault.prepareDeposit({
    walletAddress: wallet,
    marketId: "market_33333333333333333333333333333333",
    assetId: "asset_0123456789abcdef0123456789abcdef",
    amountAtoms: "10000000",
    sessionPublicKey: "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2",
  });
  const withdrawal = await client.vault.prepareWithdrawal({
    walletAddress: wallet,
    marketId: "market_33333333333333333333333333333333",
    assetId: "asset_fedcba9876543210fedcba9876543210",
    destinationWalletAddress: wallet,
    amountAtoms: "5000000",
  });
  const pause = await client.vault.preparePause({ walletAddress: wallet, paused: true });
  const delegate = await client.vault.prepareDelegate({
    walletAddress: wallet,
    sessionPublicKey: "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2",
    action: "revoke",
  });
  const policy = await client.vault.preparePolicy({
    walletAddress: wallet,
    withdrawalAccess: { mode: "restricted", allowedWalletAddresses: [wallet] },
  });
  // Every preparation carries its handle and whether Strata pays; the owner
  // signs and hands it straight back — no RPC, no SOL.
  assert.equal(deposit.sponsored, true);
  assert.equal(deposit.preparation_id, vaultSubmit.preparation_id);
  assert.ok(deposit.submit_by_ms > deposit.server_time_ms);
  const vaultReceipt = await client.vault.submit({
    preparationId: deposit.preparation_id,
    signedTransactionBase64: "AQIDBA==",
    idempotencyKey: "deposit-1",
  });
  assert.equal(vaultReceipt.status, "submitted");
  assert.equal(vaultReceipt.action, "deposit");
  assert.equal(vaultReceipt.sponsored, true);
  assert.deepEqual(vaultSubmitRequest, {
    preparation_id: deposit.preparation_id,
    signed_transaction_base64: "AQIDBA==",
    idempotency_key: "deposit-1",
  });
  const outcome = await client.vault.submission(deposit.preparation_id);
  assert.equal(outcome.status, "confirmed");
  await assert.rejects(
    client.vault.submit({
      preparationId: "or_4d5e6f708192a3b4c5d6e7f8091a2b3c",
      signedTransactionBase64: "AQIDBA==",
      idempotencyKey: "deposit-1",
    }),
    /preparationId/,
  );
  const rewardsResult = await client.rewards.read({ walletAddress: wallet, limit: 2 });
  const referralsResult = await client.referrals.read(wallet);
  const linkPayload = client.referrals.linkAuthorizationPayload(" STRATA1 ");
  const claimPayload = client.referrals.claimAuthorizationPayload(wallet);
  const linkResult = await client.referrals.link({
    walletAddress: wallet,
    referralCode: "STRATA1",
    authorizationSignature: "22".repeat(64),
  });
  const claimResult = await client.referrals.claim({
    walletAddress: wallet,
    authorizationSignature: "33".repeat(64),
  });
  const bugsResult = await client.bugs.read(wallet);
  const payload = client.bugs.authorizationPayload("  chart stopped updating  ");
  const submitResult = await client.bugs.submit({
    ownerWallet: wallet,
    message: "  chart stopped updating  ",
    authorizationSignature: "11".repeat(64),
  });

  assert.equal(history.points[1]?.equity_usd_micros, "127500000");
  assert.equal(vault.session?.market_execution_ready, true);
  assert.equal(vault.session?.spending_limits[0]?.asset_id, "asset_0123456789abcdef0123456789abcdef");
  assert.equal(setup.mode, "create");
  assert.equal(setup.owner_signature_required, true);
  assert.equal(setup.minimum_interval_seconds, 0);
  assert.equal(setup.maximum_tolerance_bps, 100);
  assert.deepEqual(setupRequest, {
    wallet_address: wallet,
    session_public_key: "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2",
    replace_session_public_key: null,
    market_id: "market_33333333333333333333333333333333",
    expires_at_ms: null,
    minimum_interval_seconds: 0,
    maximum_tolerance_bps: 100,
    spending_limits: [
      {
        asset_id: "asset_0123456789abcdef0123456789abcdef",
        maximum_per_execution_atoms: null,
      },
      {
        asset_id: "asset_fedcba9876543210fedcba9876543210",
        maximum_per_execution_atoms: "100000000",
      },
    ],
  });
  assert.equal(deposit.amount_atoms, "10000000");
  assert.equal(deposit.owner_signature_required, true);
  assert.equal(deposit.registers_session, true);
  assert.equal(deposit.session_public_key, "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2");
  assert.deepEqual(depositRequest, {
    wallet_address: wallet,
    market_id: "market_33333333333333333333333333333333",
    asset_id: "asset_0123456789abcdef0123456789abcdef",
    amount_atoms: "10000000",
    session_public_key: "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2",
  });
  assert.equal(withdrawal.amount_atoms, "5000000");
  assert.equal(withdrawal.owner_signature_required, true);
  assert.deepEqual(withdrawRequest, {
    wallet_address: wallet,
    market_id: "market_33333333333333333333333333333333",
    asset_id: "asset_fedcba9876543210fedcba9876543210",
    destination_wallet_address: wallet,
    amount_atoms: "5000000",
  });
  assert.equal(pause.owner_signature_required, true);
  assert.equal(delegate.action, "revoke");
  assert.equal(delegate.owner_signature_required, true);
  assert.deepEqual(delegateRequest, {
    wallet_address: wallet,
    session_public_key: "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2",
    action: "revoke",
  });
  assert.equal(policy.withdrawal_access.mode, "restricted");
  assert.equal(policy.owner_signature_required, true);
  assert.deepEqual(policyRequest, {
    wallet_address: wallet,
    withdrawal_access: {
      mode: "restricted",
      allowed_wallet_addresses: [wallet],
    },
  });
  assert.deepEqual(pauseRequest, { wallet_address: wallet, paused: true });
  assert.equal(rewardsResult.owner?.wallet_address, wallet);
  assert.equal(referralsResult.referral_code, "STRATA1");
  assert.equal(new TextDecoder().decode(linkPayload), "strata-referral:v1:STRATA1");
  assert.equal(
    new TextDecoder().decode(claimPayload),
    `strata-referral-claim:v1:${wallet}`,
  );
  assert.equal(linkResult.status, "pending_first_fill");
  assert.equal(claimResult.status, "requested");
  assert.equal(bugsResult.reports[0]?.status, "confirmed");
  assert.equal(new TextDecoder().decode(payload), "strata-bug-report:v1:chart stopped updating");
  assert.deepEqual(submitted, {
    owner_wallet: wallet,
    message: "chart stopped updating",
    authorization_signature: "11".repeat(64),
  });
  assert.deepEqual(linked, {
    wallet_address: wallet,
    referral_code: "STRATA1",
    authorization_signature: "22".repeat(64),
  });
  assert.deepEqual(claimed, {
    wallet_address: wallet,
    payout_wallet_address: wallet,
    authorization_signature: "33".repeat(64),
  });
  assert.equal(submitResult.status, "pending");
  assert.ok(requests.includes(`GET /v2/account/${wallet}/portfolio`));
  assert.equal(snapshot.wallet_address, wallet);
  assert.equal(snapshot.balances.length, 2);
  assert.equal(snapshot.positions[0]?.market_id, "market_33333333333333333333333333333333");
  // One public read carries the whole account: open orders and fills too.
  assert.equal(snapshot.open_orders[0]?.market_id, "market_33333333333333333333333333333333");
  assert.equal(snapshot.open_orders[0]?.order_id, "order_0123456789abcdef0123456789abcdef");
  assert.equal(snapshot.recent_fills[0]?.fill_id, "fill_0123456789abcdef0123456789abcdef");
  assert.deepEqual(snapshot.unavailable_market_ids, []);
  assert.deepEqual(await client.account.read(wallet), snapshot);
  assert.equal(snapshot.equity_usd_micros, "439989500");
  assert.ok(snapshot.valuation_complete);
  assert.ok(requests.includes(`GET /v2/account/${wallet}/portfolio/history?range=24h`));
  assert.ok(requests.includes(
    `GET /v2/vault/status?wallet_address=${wallet}&session_public_key=9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2`,
  ));
  assert.ok(requests.includes(`GET /v2/rewards?wallet_address=${wallet}&limit=2`));
});

test("reads sanitized account state with an externally signed request", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  const account = await v2Fixture("account");
  const signedMessages: string[] = [];
  let requestHeaders = new Headers();
  let requestPath = "";
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname.endsWith("/capabilities")) return Response.json(capabilities);
      requestPath = `${url.pathname}${url.search}`;
      requestHeaders = new Headers(init?.headers);
      return Response.json(account);
    },
  });
  const marketId = "market_33333333333333333333333333333333";
  const wallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  const signer = {
    publicKey: wallet,
    signMessage: async (message: Uint8Array) => {
      signedMessages.push(new TextDecoder().decode(message));
      return new Uint8Array(64).fill(7);
    },
  };

  const result = await client.account.market(marketId, signer, { fillLimit: 20 });

  assert.equal(result.orders[0]?.state, "partially_filled");
  assert.equal(result.fills[0]?.settlement, "confirmed");
  assert.equal(requestPath, `/v2/markets/${marketId}/account/${wallet}?fill_limit=20`);
  assert.match(signedMessages[0] ?? "", new RegExp(`^strata:account-read:v2\\n${marketId}\\n${wallet}\\n\\d+\\n20$`));
  assert.equal(requestHeaders.get("x-strata-auth-time"), signedMessages[0]?.split("\n").at(-2));
  assert.equal(requestHeaders.get("x-strata-auth-signature"), "07".repeat(64));
  assert.equal("counterparty" in (result.fills[0] ?? {}), false);
  assert.equal("source" in (result.fills[0] ?? {}), false);
});

test("reads owner-scoped maker reputation with the external wallet signer", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  (capabilities.capabilities as Array<Record<string, unknown>>).push({
    id: "mm.reputation.read",
    risk: "read",
    required_scope: "mm:read",
    transports: ["http", "mcp"],
    mcp_exposure: "read",
  });
  const reputation = await v2Fixture("maker-reputation");
  const signedMessages: string[] = [];
  let requestHeaders = new Headers();
  let requestPath = "";
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname.endsWith("/capabilities")) return Response.json(capabilities);
      requestPath = url.pathname;
      requestHeaders = new Headers(init?.headers);
      return Response.json(reputation);
    },
  });
  const marketId = "market_33333333333333333333333333333333";
  const wallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  // Public by wallet address: no signature is requested or sent. A signer is
  // still accepted for compatibility; only its public key is used.
  const result = await client.marketMaking.reputation(marketId, wallet);
  const viaSigner = await client.marketMaking.reputation(marketId, {
    publicKey: wallet,
    signMessage: async (message) => {
      signedMessages.push(new TextDecoder().decode(message));
      return new Uint8Array(64).fill(8);
    },
  });
  assert.deepEqual(viaSigner, result);
  assert.deepEqual(signedMessages, []);

  assert.equal(result.tier, "gold");
  assert.equal(result.tier_progress.next_tier, "platinum");
  assert.equal(requestPath, `/v2/markets/${marketId}/makers/${wallet}/reputation`);
  assert.equal(requestHeaders.get("x-strata-auth-signature"), null);
  const text = JSON.stringify(result);
  for (const forbidden of ["intent_pda", "delegate", "source", "venue"]) {
    assert.equal(text.includes(forbidden), false);
  }
});

test("reads owner-scoped maker status with the external wallet signer", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  (capabilities.capabilities as Array<Record<string, unknown>>).push({
    id: "mm.status.read",
    risk: "read",
    required_scope: "mm:read",
    transports: ["http", "mcp"],
    mcp_exposure: "read",
  });
  const status = await v2Fixture("maker-status");
  const signedMessages: string[] = [];
  let requestHeaders = new Headers();
  let requestPath = "";
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname.endsWith("/capabilities")) return Response.json(capabilities);
      requestPath = url.pathname;
      requestHeaders = new Headers(init?.headers);
      return Response.json(status);
    },
  });
  const marketId = "market_33333333333333333333333333333333";
  const wallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  // Public by wallet address; a signer is accepted but never asked to sign.
  const result = await client.marketMaking.status(marketId, wallet);
  await client.marketMaking.status(marketId, {
    publicKey: wallet,
    signMessage: async (message) => {
      signedMessages.push(new TextDecoder().decode(message));
      return new Uint8Array(64).fill(9);
    },
  });
  assert.deepEqual(signedMessages, []);

  assert.equal(result.active_products, 3);
  assert.equal(result.intent?.side, "sell");
  assert.equal(result.strands[0]?.bids[0]?.price_atoms, "149950000");
  assert.equal(result.currents[0]?.oracle_health, "fresh");
  assert.equal(result.dead_man_guards[0]?.status, "armed");
  assert.equal(requestPath, `/v2/markets/${marketId}/makers/${wallet}`);
  assert.equal(requestHeaders.get("x-strata-auth-signature"), null);
  const text = JSON.stringify(result);
  for (const forbidden of ["intent_pda", "user_account", "delegate", "counterparty", "venue"]) {
    assert.equal(text.includes(forbidden), false);
  }
  const payload = new TextDecoder().decode(
    client.marketMaking.statusAuthorizationPayload(marketId, wallet, 1_786_896_000_000),
  );
  assert.equal(payload, `strata:mm-status-read:v2\n${marketId}\n${wallet}\n1786896000000`);
});

test("authenticates and recovers sequenced private account streams", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  addPlatformCapabilities(capabilities, [
    { id: "account.stream", transports: ["websocket"] },
  ]);
  const account = await v2Fixture("account");
  const sockets: FakeWebSocket[] = [];
  const views: PlatformAccountView[] = [];
  const fills: string[] = [];
  const errors: Error[] = [];
  const signedMessages: string[] = [];
  const wallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  const marketId = "market_33333333333333333333333333333333";
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async () => Response.json(capabilities),
  });
  const subscription = await client.account.subscribe(
    {
      publicKey: wallet,
      signMessage: async (message) => {
        signedMessages.push(new TextDecoder().decode(message));
        return new Uint8Array(64).fill(9);
      },
    },
    {
      onAccount: (view) => views.push(view),
      onFill: (_id, fill) => fills.push(fill.fill_id),
      onError: (error) => errors.push(error),
    },
    {
      marketIds: [marketId],
      reconnect: false,
      webSocketFactory: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    },
  );
  const challenge = "ab".repeat(32);
  sockets[0]!.emit({
    type: "auth_challenge",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    wallet_address: wallet,
    challenge,
    server_time_ms: 1786550400000,
    expires_at_ms: 1786550405000,
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(
    signedMessages[0],
    `strata:account-stream:v2\n${marketId}\n${wallet}\n${challenge}`,
  );
  assert.deepEqual(JSON.parse(sockets[0]!.sent[0] ?? "{}"), {
    type: "authenticate",
    signature: "09".repeat(64),
  });
  const streamId = "account_stream_66666666666666666666666666666666";
  sockets[0]!.emit({ type: "account_snapshot", ...account, stream_id: streamId, sequence: "1" });
  await subscription.ready;
  sockets[0]!.emit({
    type: "orders_snapshot",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    wallet_address: wallet,
    stream_id: streamId,
    sequence: "2",
    previous_sequence: "1",
    server_time_ms: 1786550400100,
    orders: [],
  });
  sockets[0]!.emit({
    type: "fill",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    wallet_address: wallet,
    stream_id: streamId,
    sequence: "3",
    previous_sequence: "2",
    server_time_ms: 1786550400200,
    fill: (account.fills as unknown[])[0],
  });
  assert.equal(views.length, 3);
  assert.equal(views[1]?.orders.length, 0);
  assert.equal(fills.length, 1);
  sockets[0]!.emit({
    type: "account_snapshot",
    ...account,
    stream_id: streamId,
    sequence: "4",
    orders: [],
  });
  assert.equal(views.length, 4);
  assert.equal(views[3]?.recovered, true);
  sockets[0]!.emit({
    type: "heartbeat",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    wallet_address: wallet,
    stream_id: streamId,
    sequence: "6",
    previous_sequence: "5",
    server_time_ms: 1786550400300,
  });
  assert.equal(sockets[0]!.closed, true);
  assert.match(errors.at(-1)?.message ?? "", /sequence gap/);
  subscription.close();
});

test("settles stream readiness when the handshake is rejected without a close event", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  (capabilities.capabilities as Array<Record<string, unknown>>).push({
    id: "algos.twap.stream",
    risk: "read",
    required_scope: "account:read",
    transports: ["websocket"],
    mcp_exposure: "none",
  });
  const sockets: FakeWebSocket[] = [];
  const errors: Error[] = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async () => Response.json(capabilities),
  });
  const subscription = await client.algos.subscribe(
    "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL",
    { onError: (error) => errors.push(error) },
    {
      marketIds: ["market_33333333333333333333333333333333"],
      reconnect: false,
      webSocketFactory: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    },
  );
  const readiness = assert.rejects(subscription.ready, /closed before its snapshot/);
  sockets[0]!.rejectHandshake();
  await readiness;
  assert.ok(errors.some((error) => /transport failed/.test(error.message)));
});

test("watches executions over the sequenced execution stream and recovers on gaps", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  (capabilities.capabilities as Array<Record<string, unknown>>).push({
    id: "execution.stream",
    risk: "read",
    required_scope: "trade:read",
    transports: ["websocket"],
    mcp_exposure: "none",
  });
  const snapshot = await v2Fixture("execution-stream");
  const marketId = snapshot.market_id as string;
  const rows = snapshot.executions as Record<string, unknown>[];
  const sockets: FakeWebSocket[] = [];
  const views: PlatformExecutionsView[] = [];
  const updates: string[] = [];
  const unknowns: string[] = [];
  const errors: Error[] = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async () => Response.json(capabilities),
  });
  const watched = [rows[0]!.execution_id as string, rows[1]!.execution_id as string, "se_00000000000000000000000000000000"];
  const subscription = await client.executions.subscribe(
    marketId,
    watched,
    {
      onExecutions: (view) => views.push(view),
      onExecution: (_id, execution) => updates.push(`${execution.execution_id}:${execution.status}`),
      onUnknown: (_id, executionId) => unknowns.push(executionId),
      onError: (error) => errors.push(error),
    },
    {
      reconnect: false,
      webSocketFactory: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    },
  );
  assert.match(sockets[0]!.url, new RegExp(`/v2/markets/${marketId}/executions/stream$`));
  sockets[0]!.onopen?.({} as Event);
  assert.deepEqual(JSON.parse(sockets[0]!.sent[0] ?? "{}"), { type: "watch", execution_ids: watched });
  sockets[0]!.emit(snapshot);
  await subscription.ready;
  assert.equal(views.length, 1);
  assert.equal(views[0]?.executions.length, 2);
  assert.deepEqual(views[0]?.unknown_execution_ids, ["se_00000000000000000000000000000000"]);
  const streamId = snapshot.stream_id as string;
  sockets[0]!.emit({
    type: "execution_update",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    stream_id: streamId,
    sequence: "2",
    previous_sequence: "1",
    server_time_ms: 1786550400100,
    execution: { ...rows[1], status: "confirmed", signature: "2".repeat(64), settlement: "confirmed", updated_at_ms: 1786550400100 },
  });
  assert.equal(updates.at(-1), `${rows[1]!.execution_id}:confirmed`);
  subscription.watch(["se_abcdefabcdefabcdefabcdefabcdefab"]);
  assert.deepEqual(JSON.parse(sockets[0]!.sent[1] ?? "{}"), {
    type: "watch",
    execution_ids: ["se_abcdefabcdefabcdefabcdefabcdefab"],
  });
  sockets[0]!.emit({
    type: "execution_unknown",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    stream_id: streamId,
    sequence: "3",
    previous_sequence: "2",
    server_time_ms: 1786550400200,
    execution_id: "se_abcdefabcdefabcdefabcdefabcdefab",
  });
  assert.deepEqual(unknowns, ["se_abcdefabcdefabcdefabcdefabcdefab"]);
  assert.equal(views.at(-1)?.unknown_execution_ids.length, 2);
  sockets[0]!.emit({ ...snapshot, sequence: "4" });
  assert.equal(views.at(-1)?.recovered, true);
  sockets[0]!.emit({
    type: "heartbeat",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    stream_id: streamId,
    sequence: "6",
    previous_sequence: "5",
    server_time_ms: 1786550400300,
  });
  assert.equal(sockets[0]!.closed, true);
  assert.match(errors.at(-1)?.message ?? "", /sequence gap/);
  subscription.close();
});

test("streams sequenced TWAP progress per market with snapshot recovery", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  (capabilities.capabilities as Array<Record<string, unknown>>).push({
    id: "algos.twap.stream",
    risk: "read",
    required_scope: "account:read",
    transports: ["websocket"],
    mcp_exposure: "none",
  });
  const snapshot = await v2Fixture("twap-stream");
  const sockets: FakeWebSocket[] = [];
  const views: PlatformTwapsView[] = [];
  const updates: string[] = [];
  const errors: Error[] = [];
  const wallet = snapshot.wallet_address as string;
  const marketId = snapshot.market_id as string;
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async () => Response.json(capabilities),
  });
  const subscription = await client.algos.subscribe(
    wallet,
    {
      onTwaps: (view) => views.push(view),
      onTwap: (_id, twap) => updates.push(`${twap.twap_id}:${twap.slices_executed}`),
      onError: (error) => errors.push(error),
    },
    {
      marketIds: [marketId],
      reconnect: false,
      webSocketFactory: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    },
  );
  assert.match(
    sockets[0]!.url,
    new RegExp(`/v2/markets/${marketId}/account/${wallet}/twaps/stream$`),
  );
  sockets[0]!.emit(snapshot);
  await subscription.ready;
  assert.equal(views.length, 1);
  assert.equal(views[0]?.twaps.length, 1);
  const twap = (snapshot.twaps as Record<string, unknown>[])[0]!;
  const streamId = snapshot.stream_id as string;
  sockets[0]!.emit({
    type: "twap_update",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    wallet_address: wallet,
    stream_id: streamId,
    sequence: "2",
    previous_sequence: "1",
    server_time_ms: 1786550400100,
    twap: { ...twap, slices_executed: (twap.slices_executed as number) + 1 },
  });
  sockets[0]!.emit({
    type: "heartbeat",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    wallet_address: wallet,
    stream_id: streamId,
    sequence: "3",
    previous_sequence: "2",
    server_time_ms: 1786550400200,
  });
  assert.equal(updates.length, 1);
  assert.equal(views.length, 2);
  assert.equal(views[1]?.twaps[0]?.slices_executed, (twap.slices_executed as number) + 1);
  sockets[0]!.emit({ ...snapshot, sequence: "4" });
  assert.equal(views[2]?.recovered, true);
  sockets[0]!.emit({
    type: "heartbeat",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    wallet_address: wallet,
    stream_id: streamId,
    sequence: "6",
    previous_sequence: "5",
    server_time_ms: 1786550400300,
  });
  assert.equal(sockets[0]!.closed, true);
  assert.match(errors.at(-1)?.message ?? "", /sequence gap/);
  subscription.close();
});

test("authenticates and recovers the sequenced owner-only maker stream", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  (capabilities.capabilities as Array<Record<string, unknown>>).push({
    id: "mm.fills.stream",
    risk: "read",
    required_scope: "mm:read",
    transports: ["websocket"],
    mcp_exposure: "none",
  });
  const snapshot = await v2Fixture("maker-stream");
  const status = snapshot.status as Record<string, unknown>;
  const sockets: FakeWebSocket[] = [];
  const views: PlatformMakerView[] = [];
  const fills: string[] = [];
  const statuses: number[] = [];
  const errors: Error[] = [];
  const signedMessages: string[] = [];
  const wallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  const marketId = "market_33333333333333333333333333333333";
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async () => Response.json(capabilities),
  });
  const subscription = await client.marketMaking.subscribe(
    marketId,
    {
      publicKey: wallet,
      signMessage: async (message) => {
        signedMessages.push(new TextDecoder().decode(message));
        return new Uint8Array(64).fill(7);
      },
    },
    {
      onMaker: (view) => views.push(view),
      onFill: (_id, fill) => fills.push(fill.fill_id),
      onStatus: (_id, next) => statuses.push(next.active_products),
      onError: (error) => errors.push(error),
    },
    {
      reconnect: false,
      webSocketFactory: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    },
  );
  assert.match(sockets[0]!.url, new RegExp(`/v2/markets/${marketId}/makers/${wallet}/stream$`));
  const challenge = "cd".repeat(32);
  sockets[0]!.emit({
    type: "auth_challenge",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    wallet_address: wallet,
    challenge,
    server_time_ms: 1786550400000,
    expires_at_ms: 1786550405000,
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(
    signedMessages[0],
    `strata:mm-fills-stream:v2\n${marketId}\n${wallet}\n${challenge}`,
  );
  assert.deepEqual(JSON.parse(sockets[0]!.sent[0] ?? "{}"), {
    type: "authenticate",
    signature: "07".repeat(64),
  });
  const streamId = snapshot.stream_id as string;
  sockets[0]!.emit(snapshot);
  await subscription.ready;
  assert.equal(views.length, 1);
  assert.equal(views[0]?.status.active_products, 3);
  assert.equal(views[0]?.fills[0]?.product, "strand");
  sockets[0]!.emit({
    type: "maker_fill",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    wallet_address: wallet,
    stream_id: streamId,
    sequence: "2",
    previous_sequence: "1",
    server_time_ms: 1786896000100,
    fill: { ...(snapshot.fills as Record<string, unknown>[])[0], fill_id: "fill_99999999999999999999999999999999", product: "intent" },
  });
  sockets[0]!.emit({
    type: "maker_status",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    wallet_address: wallet,
    stream_id: streamId,
    sequence: "3",
    previous_sequence: "2",
    server_time_ms: 1786896000200,
    status: { ...status, intent: null, active_products: 2 },
  });
  assert.equal(fills.length, 1);
  assert.deepEqual(statuses, [2]);
  assert.equal(views.length, 3);
  assert.equal(views[2]?.fills.length, 2);
  assert.equal(views[2]?.status.intent, null);
  sockets[0]!.emit({ ...snapshot, sequence: "4" });
  assert.equal(views[3]?.recovered, true);
  sockets[0]!.emit({
    type: "heartbeat",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    wallet_address: wallet,
    stream_id: streamId,
    sequence: "6",
    previous_sequence: "5",
    server_time_ms: 1786896000300,
  });
  assert.equal(sockets[0]!.closed, true);
  assert.match(errors.at(-1)?.message ?? "", /sequence gap/);
  subscription.close();
});

test("rejects account readiness and stops reconnecting after signer failure", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  addPlatformCapabilities(capabilities, [
    { id: "account.stream", transports: ["websocket"] },
  ]);
  const sockets: FakeWebSocket[] = [];
  const marketId = "market_33333333333333333333333333333333";
  const wallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  const errors: Error[] = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async () => Response.json(capabilities),
  });
  const subscription = await client.account.subscribe(
    { publicKey: wallet, signMessage: async () => new Uint8Array(1) },
    { onError: (error) => errors.push(error) },
    {
      marketIds: [marketId],
      webSocketFactory: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    },
  );
  const readiness = assert.rejects(subscription.ready, /64-byte Ed25519 signature/);
  sockets[0]!.emit({
    type: "auth_challenge",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    wallet_address: wallet,
    challenge: "cd".repeat(32),
    server_time_ms: 1786550400000,
    expires_at_ms: 1786550405000,
  });
  await readiness;
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0]?.closed, true);
  assert.match(errors[0]?.message ?? "", /64-byte Ed25519 signature/);
});

test("applies sequenced book changes and removes zero-sized prices", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  addPlatformCapabilities(capabilities, [
    { id: "market_data.book.stream", transports: ["websocket"] },
    { id: "market_data.bbo.stream", transports: ["websocket"] },
    { id: "market_data.trades.stream", transports: ["websocket"] },
    { id: "market_data.marks.read", transports: ["websocket"] },
  ]);
  const snapshot = { type: "book_snapshot", ...(await v2Fixture("book")) };
  const sockets: FakeWebSocket[] = [];
  const views: PlatformBookView[] = [];
  const bestPrices: string[] = [];
  const statuses: string[] = [];
  const errors: Error[] = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async () => Response.json(capabilities),
  });
  const marketId = "market_33333333333333333333333333333333";
  const subscription = await client.books.subscribe(
    marketId,
    {
      onBook: (book) => views.push(book),
      onBestBidAsk: (value) => bestPrices.push(value.best_ask?.price_atoms ?? "none"),
      onMarketStatus: (status) => statuses.push(status),
      onError: (error) => errors.push(error),
    },
    {
      reconnect: false,
      webSocketFactory: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    },
  );
  assert.equal(
    sockets[0]?.url,
    `wss://example.test/v2/markets/${marketId}/stream`,
  );
  sockets[0]!.emit(snapshot);
  await subscription.ready;
  sockets[0]!.emit({ type: "best_bid_ask", ...(await v2Fixture("bbo")) });
  sockets[0]!.emit({
    type: "book_delta",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    stream_id: `book:${marketId}`,
    sequence: "43",
    previous_sequence: "42",
    server_time_ms: 1786550400100,
    changes: [
      { side: "bid", price_atoms: "149990000", size_atoms: "0" },
      { side: "ask", price_atoms: "150005000", size_atoms: "700000000" },
    ],
  });

  assert.equal(views.length, 2);
  assert.deepEqual(bestPrices, ["150010000"]);
  assert.equal(views[1]?.sequence, "43");
  assert.equal(views[1]?.bids.some((row) => row.price_atoms === "149990000"), false);
  assert.equal(views[1]?.asks[0]?.price_atoms, "150005000");
  assert.equal(errors.length, 0);
  sockets[0]!.emit({
    type: "book_delta",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    stream_id: `book:${marketId}`,
    sequence: "45",
    previous_sequence: "44",
    server_time_ms: 1786550400200,
    changes: [{ side: "ask", price_atoms: "150005000", size_atoms: "600000000" }],
  });
  assert.equal(sockets[0]!.closed, true);
  assert.match(errors[0]?.message ?? "", /sequence gap/);
  sockets[0]!.emit({
    type: "market_status",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    server_time_ms: 1786550400250,
    status: "warming",
  });
  assert.deepEqual(statuses, ["warming"]);
  subscription.close();
});

test("refuses a modular operation missing from live discovery", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  capabilities.capabilities = (capabilities.capabilities as Array<Record<string, unknown>>)
    .filter((capability) => capability.id !== "assets.read");
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async () => Response.json(capabilities),
  });

  await assert.rejects(
    client.assets.list(),
    (error: unknown) =>
      error instanceof StrataContractError
      && /assets\.read/.test(error.message),
  );
});

test("fails closed when a v2 read response gains an unreviewed field", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  const assets = { ...(await v2Fixture("assets")), internal_hint: true };
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      return Response.json(path.endsWith("/capabilities") ? capabilities : assets);
    },
  });

  await assert.rejects(client.assets.list(), /unrecognized or missing fields/);
});

test("exposes resting-order prepare, idempotent submit, and durable status", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  (capabilities.capabilities as Array<Record<string, unknown>>).push(
    {
      id: "orders.prepare",
      risk: "prepare",
      required_scope: "orders:prepare",
      transports: ["http", "mcp"],
      mcp_exposure: "prepare",
    },
    {
      id: "orders.submit",
      risk: "submit",
      required_scope: "orders:submit",
      transports: ["http", "mcp"],
      mcp_exposure: "submit",
    },
  );
  const challenge = await v2Fixture("order-challenge");
  const prepared = await v2Fixture("order-prepare");
  const submitted = await v2Fixture("order-submit");
  const status = await v2Fixture("order-status");
  const requests: Array<{ path: string; body: unknown }> = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const path = url.pathname;
      if (path.endsWith("/capabilities")) return Response.json(capabilities);
      requests.push({ path, body: JSON.parse(String(init?.body)) });
      if (path.endsWith("/challenge")) return Response.json(challenge);
      if (path.endsWith("/prepare")) return Response.json(prepared);
      if (path.endsWith("/status")) return Response.json(status);
      return Response.json(submitted);
    },
  });
  const marketId = "market_22222222222222222222222222222222";
  const ownerWallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  const sessionPublicKey = "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2";

  const bound = await client.orders.challenge(marketId, {
    action: "place",
    ownerWallet,
    sessionPublicKey,
    accountSequence: 7n,
    clientOrderId: "agent-42",
    side: "buy",
    orderType: "post_only",
    limitPriceAtoms: 150_000_000n,
    sizeAtoms: 1_000_000_000n,
  });
  const tx = await client.orders.prepare(marketId, {
    challengeId: bound.challenge_id,
    authorizationSignature: "2".repeat(64),
  });
  const receipt = await client.orders.submit(marketId, {
    orderControlId: tx.order_control_id,
    signedTransactionBase64: "AQIDBA==",
    idempotencyKey: "agent-42-attempt-1",
  });
  const recovered = await client.orders.status(marketId, {
    orderControlId: tx.order_control_id,
    idempotencyKey: "agent-42-attempt-1",
  });

  assert.equal(bound.action, "place");
  assert.deepEqual(tx.order_ids, bound.order_ids);
  assert.equal(receipt.status, "submitted");
  assert.equal(recovered.status, "submitting");
  assert.deepEqual(requests.map((request) => request.path), [
    `/v2/markets/${marketId}/orders/challenge`,
    `/v2/markets/${marketId}/orders/prepare`,
    `/v2/markets/${marketId}/orders/submit`,
    `/v2/markets/${marketId}/orders/status`,
  ]);
  assert.deepEqual((requests[0]?.body as Record<string, unknown>), {
    action: "place",
    owner_wallet: ownerWallet,
    session_public_key: sessionPublicKey,
    account_sequence: "7",
    client_order_id: "agent-42",
    side: "buy",
    order_type: "post_only",
    limit_price_atoms: "150000000",
    size_atoms: "1000000000",
  });
  assert.equal("venue" in (requests[0]?.body as Record<string, unknown>), false);
  assert.equal("program" in (requests[0]?.body as Record<string, unknown>), false);
});

test("prepares and submits exact Strand and Current maker controls", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  (capabilities.capabilities as Array<Record<string, unknown>>).push(
    {
      id: "mm.strand.manage",
      risk: "submit",
      required_scope: "mm:write",
      transports: ["http", "mcp"],
      mcp_exposure: "submit",
    },
    {
      id: "mm.current.manage",
      risk: "submit",
      required_scope: "mm:write",
      transports: ["http", "mcp"],
      mcp_exposure: "submit",
    },
  );
  const marketId = "market_22222222222222222222222222222222";
  const makerWallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const path = url.pathname;
      if (path.endsWith("/capabilities")) return Response.json(capabilities);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ path: `${path}${url.search}`, body });
      const product = path.includes("/strands/") ? "strand" : "current";
      const action = path.includes("/strands/") ? "strand_upsert" : "current_cancel";
      if (path.endsWith("/prepare")) {
        return Response.json({
          schema_version: 2,
          contract_version: "2.0",
          maker_control_id: "mc_0123456789abcdef0123456789abcdef",
          market_id: marketId,
          maker_wallet: makerWallet,
          product,
          action,
          transaction_base64: "AQIDBA==",
          recent_blockhash: "11111111111111111111111111111111",
          last_valid_block_height: 123,
          expires_at_ms: 1_786_550_460_000,
        });
      }
      return Response.json({
        schema_version: 2,
        contract_version: "2.0",
        maker_control_id: "mc_0123456789abcdef0123456789abcdef",
        market_id: marketId,
        maker_wallet: makerWallet,
        product,
        action,
        signature: "2".repeat(64),
        status: "submitted",
      });
    },
  });

  const strand = await client.marketMaking.strand.prepare(marketId, {
    action: "upsert",
    makerWallet,
    enabled: true,
    asyncOnly: false,
    syncSpreadTicks: 2,
    midPriceAtoms: 150_000_000n,
    maxExposureBaseAtoms: 1_000n,
    bidOffsetsTicks: Array.from({ length: 16 }, (_, index) => index + 1),
    askOffsetsTicks: Array.from({ length: 16 }, (_, index) => index + 1),
    bidSizesBaseAtoms: ["10", ...Array(15).fill("0")],
    askSizesBaseAtoms: ["10", ...Array(15).fill("0")],
    validUntilSlot: 0n,
  });
  const current = await client.marketMaking.current.prepare(marketId, {
    action: "cancel",
    makerWallet,
  });
  const receipt = await client.marketMaking.strand.submit(marketId, {
    makerControlId: strand.maker_control_id,
    signedTransactionBase64: "AQIDBA==",
    idempotencyKey: "maker-strand-1",
  });

  assert.equal(strand.action, "strand_upsert");
  assert.equal(current.action, "current_cancel");
  assert.equal(receipt.status, "submitted");
  assert.deepEqual(requests.map(({ path }) => path), [
    `/v2/markets/${marketId}/makers/strands/prepare?transaction_version=0`,
    `/v2/markets/${marketId}/makers/currents/prepare?transaction_version=0`,
    `/v2/markets/${marketId}/makers/strands/submit`,
  ]);
  assert.equal(requests[0]?.body.mid_price_atoms, "150000000");
  assert.equal(requests[0]?.body.max_exposure_base_atoms, "1000");
  assert.equal(requests[1]?.body.action, "cancel");
  await assert.rejects(
    client.marketMaking.strand.prepare(marketId, {
      action: "upsert",
      makerWallet,
      enabled: true,
      asyncOnly: false,
      syncSpreadTicks: 1,
      midPriceAtoms: "1",
      maxExposureBaseAtoms: "1",
      bidOffsetsTicks: [1],
      askOffsetsTicks: [1],
      bidSizesBaseAtoms: ["1"],
      askSizesBaseAtoms: ["1"],
      validUntilSlot: "0",
    }),
    /exactly 16/,
  );
});

test("executes one exact sponsored IntentBook update through a Vault session", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  addPlatformCapabilities(capabilities, [{
    id: "mm.intent.manage",
    risk: "submit",
    transports: ["http", "mcp"],
  }]);
  const ownerWallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  const sessionPublicKey = "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2";
  const feePayer = new Uint8Array(32).fill(1);
  const delegate = new Uint8Array(32).fill(2);
  const intent = new Uint8Array(32).fill(3);
  const userAccount = new Uint8Array(32).fill(4);
  const vault = new Uint8Array(32).fill(5);
  const strataProgram = new Uint8Array(32).fill(6);
  const market = new Uint8Array(32).fill(7);
  const vaultProgram = new Uint8Array(32).fill(8);
  const blockhash = new Uint8Array(32).fill(9);
  const join = (...parts: readonly Uint8Array[]): Uint8Array => {
    const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  };
  const compact = (value: number): Uint8Array => {
    const output: number[] = [];
    let remaining = value;
    do {
      const byte = remaining & 0x7f;
      remaining >>= 7;
      output.push(remaining === 0 ? byte : byte | 0x80);
    } while (remaining !== 0);
    return Uint8Array.from(output);
  };
  const u16 = (value: number): Uint8Array => {
    const output = new Uint8Array(2);
    new DataView(output.buffer).setUint16(0, value, true);
    return output;
  };
  const u64 = (value: bigint): Uint8Array => {
    const output = new Uint8Array(8);
    new DataView(output.buffer).setBigUint64(0, value, true);
    return output;
  };
  const opaqueMarketId = async (): Promise<string> => {
    const input = new TextEncoder().encode(
      `strata-sdk-product:v1\0market\0${base58Encode(market)}`,
    );
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
    return `market_${Array.from(digest.slice(0, 16), (byte) =>
      byte.toString(16).padStart(2, "0")).join("")}`;
  };
  const marketId = await opaqueMarketId();
  const keys = [
    feePayer,
    base58Decode(sessionPublicKey, 32, "session"),
    delegate,
    intent,
    userAccount,
    vault,
    strataProgram,
    base58Decode(ownerWallet, 32, "owner"),
    market,
    vaultProgram,
  ];
  const inner = join(
    new Uint8Array([9, 2]),
    new Uint8Array(7),
    u64(149_000_000n),
    u64(151_000_000n),
    u64(1_000_000_000n),
  );
  const envelope = join(
    new Uint8Array([3]),
    u64(0n),
    new Uint8Array([0, 0]),
    u16(inner.length),
    new Uint8Array([4]),
    inner,
    new Uint8Array([1, 0, 2, 2]),
  );
  const accounts = new Uint8Array([
    1, 5, 2, 6, 7, 0,
    5, 8, 3, 4,
    8,
  ]);
  const instruction = join(
    new Uint8Array([9]),
    compact(accounts.length),
    accounts,
    compact(envelope.length),
    envelope,
  );
  const transactionBase64 = Buffer.from(join(
    compact(2),
    new Uint8Array(128),
    new Uint8Array([2, 1, 5]),
    compact(keys.length),
    ...keys,
    blockhash,
    compact(1),
    instruction,
  )).toString("base64");
  const prepared = {
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    owner_wallet: ownerWallet,
    vault_address: base58Encode(vault),
    session_public_key: sessionPublicKey,
    intent_address: base58Encode(intent),
    action: "post",
    transaction_base64: transactionBase64,
    recent_blockhash: base58Encode(blockhash),
    last_valid_block_height: 400_000_000,
    expires_at_ms: Date.now() + 30_000,
    sponsored: true,
  };
  const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      if (path.endsWith("/capabilities")) return Response.json(capabilities);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ path, body });
      if (path.endsWith("/prepare")) return Response.json(prepared);
      return Response.json({ signature: "1".repeat(64) });
    },
  });
  let signed = 0;
  const signer = {
    publicKey: sessionPublicKey,
    signMessage: async () => new Uint8Array(64),
    signTransaction: async (transaction: string) => {
      signed += 1;
      assert.equal(transaction, transactionBase64);
      return transaction;
    },
  };
  const operation = {
    action: "post" as const,
    ownerWallet,
    side: "both" as const,
    minPriceAtoms: 149_000_000n,
    maxPriceAtoms: 151_000_000n,
    maxFillSizeAtoms: 1_000_000_000n,
  };
  const receipt = await client.marketMaking.intent.execute(marketId, { operation, signer });
  assert.equal(receipt.signature, "1".repeat(64));
  assert.equal(signed, 1);
  assert.deepEqual(requests.map(({ path }) => path), [
    `/v2/markets/${marketId}/makers/intents/prepare`,
    `/v2/markets/${marketId}/makers/intents/submit`,
  ]);
  assert.deepEqual(requests[0]?.body, {
    action: "post",
    market_id: marketId,
    owner_wallet: ownerWallet,
    session_public_key: sessionPublicKey,
    side: "both",
    min_price_atoms: "149000000",
    max_price_atoms: "151000000",
    max_fill_size_atoms: "1000000000",
  });
  assert.equal(requests[1]?.body.signed_transaction_base64, transactionBase64);

  const changedSide = new Uint8Array(Buffer.from(transactionBase64, "base64"));
  const innerOffset = Buffer.from(changedSide).indexOf(Buffer.from(inner));
  assert.ok(innerOffset >= 0);
  changedSide[innerOffset + 1] = 0;
  const badClient = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      if (path.endsWith("/capabilities")) return Response.json(capabilities);
      return Response.json({
        ...prepared,
        transaction_base64: Buffer.from(changedSide).toString("base64"),
      });
    },
  });
  await assert.rejects(
    badClient.marketMaking.intent.execute(marketId, { operation, signer }),
    /requested economics/,
  );
  assert.equal(signed, 1, "a changed packet must be rejected before session signing");
});

test("starts a Current from human inputs and waits for exact chain-derived state", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  addPlatformCapabilities(capabilities, [
    { id: "markets.status.read", transports: ["http"] },
    { id: "market_data.marks.read", transports: ["http"] },
    { id: "mm.status.read", transports: ["http"] },
    { id: "mm.current.manage", risk: "submit", transports: ["http", "mcp"] },
  ]);
  const assets = await v2Fixture("assets");
  const markets = await v2Fixture("markets");
  const marketStatus = await v2Fixture("status");
  const mark = await v2Fixture("mark");
  const makerStatus = await v2Fixture("maker-status");

  const makerKey = new Uint8Array(32).fill(2);
  const marketKey = new Uint8Array(32).fill(3);
  const recentBlockhash = new Uint8Array(32).fill(7);
  const makerWallet = base58Encode(makerKey);
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`strata-sdk-product:v1\0market\0${base58Encode(marketKey)}`),
  ));
  const marketId = `market_${Array.from(
    digest.slice(0, 16),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("")}`;
  const market = (markets.markets as Array<Record<string, unknown>>)[0]!;
  const baseAsset = (assets.assets as Array<Record<string, unknown>>)
    .find((asset) => asset.asset_id === market.base_asset_id);
  assert.ok(baseAsset);
  baseAsset.symbol = "WSOL";
  baseAsset.name = "Wrapped SOL";
  market.market_id = marketId;
  marketStatus.market_id = marketId;
  mark.market_id = marketId;
  mark.price_atoms_per_base_unit = "150000000";
  makerStatus.market_id = marketId;
  makerStatus.wallet_address = makerWallet;
  makerStatus.current_slot = "1000";
  makerStatus.firm_orders = {
    resting_orders: 0,
    bid_orders: 0,
    ask_orders: 0,
    bid_size_atoms: "0",
    ask_size_atoms: "0",
  };
  makerStatus.intent = null;
  makerStatus.signed_quotes = { eligible: false, live_quotes: [] };
  makerStatus.strands = [];
  makerStatus.currents = [];
  makerStatus.dead_man_guards = [];
  makerStatus.active_products = 0;

  const u16 = (value: number): Uint8Array => {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setUint16(0, value, true);
    return bytes;
  };
  const u32 = (value: number): Uint8Array => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, true);
    return bytes;
  };
  const u64 = (value: bigint): Uint8Array => {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, value, true);
    return bytes;
  };
  const compact = (value: number): Uint8Array => {
    const bytes: number[] = [];
    let remaining = value;
    do {
      const byte = remaining & 0x7f;
      remaining >>= 7;
      bytes.push(remaining === 0 ? byte : byte | 0x80);
    } while (remaining !== 0);
    return Uint8Array.from(bytes);
  };
  const join = (...parts: readonly Uint8Array[]): Uint8Array => {
    const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    return bytes;
  };
  const depth = [3_333_334n, 3_333_333n, 3_333_333n, 0n, 0n, 0n, 0n, 0n];
  const instructionData = join(
    new Uint8Array([47, 1, 255]),
    u16(5),
    u16(5),
    u16(100),
    u16(500),
    u32(10),
    u16(0),
    u64(10_000_000n),
    ...depth.map(u64),
    ...depth.map(u64),
    u64(2_500n),
  );
  assert.equal(instructionData.length, 161);
  const staticKeys = [
    makerKey,
    marketKey,
    new Uint8Array(32).fill(4),
    new Uint8Array(32).fill(5),
    new Uint8Array(32),
    new Uint8Array(32).fill(6),
  ];
  const instruction = join(
    new Uint8Array([5]),
    compact(5),
    new Uint8Array([0, 1, 2, 3, 4]),
    compact(instructionData.length),
    instructionData,
  );
  const transactionBase64 = Buffer.from(join(
    compact(1),
    new Uint8Array(64),
    new Uint8Array([0x80, 1, 0, 2]),
    compact(staticKeys.length),
    ...staticKeys,
    recentBlockhash,
    compact(1),
    instruction,
    compact(0),
  )).toString("base64");
  const prepared = {
    schema_version: 2,
    contract_version: "2.0",
    maker_control_id: "mc_0123456789abcdef0123456789abcdef",
    market_id: marketId,
    maker_wallet: makerWallet,
    product: "current",
    action: "current_upsert",
    transaction_base64: transactionBase64,
    recent_blockhash: base58Encode(recentBlockhash),
    last_valid_block_height: 400_000_000,
    expires_at_ms: Date.now() + 60_000,
  };
  const receipt = {
    schema_version: 2,
    contract_version: "2.0",
    maker_control_id: prepared.maker_control_id,
    market_id: marketId,
    maker_wallet: makerWallet,
    product: "current",
    action: "current_upsert",
    signature: "2".repeat(64),
    status: "submitted",
  };
  let submitted = false;
  let prepareBody: Record<string, unknown> | undefined;
  let submitBody: Record<string, unknown> | undefined;
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      if (path.endsWith("/capabilities")) return Response.json(capabilities);
      if (path === "/v2/assets") return Response.json(assets);
      if (path === "/v2/markets") return Response.json(markets);
      if (path.endsWith("/status")) return Response.json(marketStatus);
      if (path.endsWith("/marks")) return Response.json(mark);
      if (path.endsWith("/makers/currents/prepare")) {
        prepareBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json(prepared);
      }
      if (path.endsWith("/makers/currents/submit")) {
        submitBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        submitted = true;
        return Response.json(receipt);
      }
      if (path.endsWith(`/makers/${makerWallet}`)) {
        if (!submitted) return Response.json(makerStatus);
        return Response.json({
          ...makerStatus,
          currents: [{
            enabled: true,
            async_only: false,
            expired: false,
            half_spread_bps: 5,
            band_step_bps: 5,
            maximum_confidence_bps: 100,
            maximum_oracle_age_seconds: 10,
            sync_spread_bps: 0,
            valid_until_slot: "2500",
            bid_depth_atoms: depth.slice(0, 3).map(String),
            ask_depth_atoms: depth.slice(0, 3).map(String),
            maximum_exposure_atoms: "10000000",
            remaining_exposure_atoms: "10000000",
            oracle_health: "fresh",
          }],
          active_products: 1,
        });
      }
      return new Response(null, { status: 404 });
    },
  });
  let signed = 0;
  const result = await client.marketMaking.start({
    market: "sol/usdc",
    product: "current",
    spreadBps: 5,
    size: "0.01 SOL",
    duration: "10m",
    signer: {
      publicKey: makerWallet,
      signTransaction: async (transaction) => {
        signed += 1;
        assert.equal(transaction, transactionBase64);
        return transaction;
      },
    },
  });

  assert.equal(result.status, "confirmed");
  assert.equal(result.market.label, "SOL/USDC");
  assert.equal(result.base_asset.symbol, "WSOL");
  assert.equal(signed, 1);
  assert.deepEqual(prepareBody, {
    action: "upsert",
    maker_wallet: makerWallet,
    enabled: true,
    async_only: false,
    half_spread_bps: 5,
    band_step_bps: 5,
    max_conf_bps: 100,
    max_oracle_dev_bps: 500,
    max_oracle_age_secs: 10,
    sync_spread_bps: 0,
    max_exposure_base_atoms: "10000000",
    bid_depth_base_atoms: depth.map(String),
    ask_depth_base_atoms: depth.map(String),
    valid_until_slot: "2500",
  });
  assert.equal(submitBody?.idempotency_key, prepared.maker_control_id);
  assert.equal(result.maker_status.currents[0]?.valid_until_slot, "2500");

  const signatureOnly = new Uint8Array(Buffer.from(transactionBase64, "base64"));
  signatureOnly[1] = 9;
  assert.doesNotThrow(() => verifySignedTransactionMessage(
    transactionBase64,
    Buffer.from(signatureOnly).toString("base64"),
  ));
  const messageByte = signatureOnly.length - 1;
  signatureOnly[messageByte] = signatureOnly[messageByte]! ^ 1;
  assert.throws(
    () => verifySignedTransactionMessage(
      transactionBase64,
      Buffer.from(signatureOnly).toString("base64"),
    ),
    /message changed/,
  );
});

test("uses the live destructive capability classification for TWAP cancellation", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  addPlatformCapabilities(capabilities, [{
    id: "algos.twap.cancel",
    risk: "destructive",
    transports: ["http", "mcp"],
  }]);
  const challenge = await v2Fixture("twap-challenge");
  challenge.action = "cancel";
  const marketId = challenge.market_id as string;
  let posted = false;
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      if (path.endsWith("/capabilities")) return Response.json(capabilities);
      posted = true;
      return Response.json(challenge);
    },
  });

  const result = await client.algos.challenge(marketId, {
    action: "cancel",
    ownerWallet: "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL",
    sessionPublicKey: "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2",
    twapId: challenge.twap_id as string,
  });
  assert.equal(posted, true);
  assert.equal(result.action, "cancel");
});

test("executes a resting order with one signature after decoding and verifying the transaction", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  (capabilities.capabilities as Array<Record<string, unknown>>).push(
    {
      id: "orders.prepare",
      risk: "prepare",
      required_scope: "orders:prepare",
      transports: ["http", "mcp"],
      mcp_exposure: "prepare",
    },
    {
      id: "orders.submit",
      risk: "submit",
      required_scope: "orders:submit",
      transports: ["http", "mcp"],
      mcp_exposure: "submit",
    },
  );
  const ownerWallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  const sessionPublicKey = "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2";
  const feePayer = new Uint8Array(32).fill(1);
  const marketPda = new Uint8Array(32).fill(2);
  const orderPda = new Uint8Array(32).fill(3);
  const recentBlockhash = new Uint8Array(32).fill(5);
  const vaultProgram = new Uint8Array(32).fill(11);
  const strataProgram = new Uint8Array(32).fill(12);
  const vaultPda = new Uint8Array(32).fill(13);
  const delegatePda = new Uint8Array(32).fill(14);
  const userAccount = new Uint8Array(32).fill(15);
  const rentBank = new Uint8Array(32).fill(16);
  const systemProgram = base58Decode("11111111111111111111111111111111", 32, "system");
  const computeBudget = base58Decode("ComputeBudget111111111111111111111111111111", 32, "cb");
  const expiresAtMs = 1_786_550_460_000;
  const encoder = new TextEncoder();
  const opaque = async (kind: string, value: string): Promise<string> => {
    const digest = new Uint8Array(await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(`strata-sdk-product:v1\0${kind}\0${value}`),
    ));
    return `${kind}_${Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  };
  const marketId = await opaque("market", base58Encode(marketPda));
  const orderId = await opaque("order", `${marketId}:${base58Encode(orderPda)}`);
  const u16 = (value: number): Uint8Array => {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setUint16(0, value, true);
    return bytes;
  };
  const u64 = (value: bigint): Uint8Array => {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, value, true);
    return bytes;
  };
  const join = (...parts: readonly Uint8Array[]): Uint8Array => {
    const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  };
  const compact = (value: number): Uint8Array => {
    const out: number[] = [];
    let remaining = value;
    for (;;) {
      const byte = remaining & 0x7f;
      remaining >>= 7;
      if (remaining === 0) { out.push(byte); break; }
      out.push(byte | 0x80);
    }
    return Uint8Array.from(out);
  };
  // Static keys: [feePayer, session] sign; the rest are read/write accounts and programs.
  const keys = [
    feePayer, base58Decode(sessionPublicKey, 32, "session"),
    vaultPda, delegatePda, userAccount, orderPda, rentBank, marketPda,
    base58Decode(ownerWallet, 32, "owner"), vaultProgram, strataProgram, systemProgram, computeBudget,
  ];
  const index = (key: Uint8Array): number => keys.findIndex((candidate) => base58Encode(candidate) === base58Encode(key));
  const envelope = (inner: Uint8Array): Uint8Array => join(
    new Uint8Array([3]), u64(0n), new Uint8Array([0, 0]), u16(inner.length), new Uint8Array([6]), inner,
    new Uint8Array(6).fill(2),
  );
  const placeInner = (side: number, orderType: number, price: bigint, size: bigint): Uint8Array =>
    join(new Uint8Array([33, side, orderType, 0, 0]), u64(price), u64(size), u64(0n), new Uint8Array([255]));
  const buildTx = (options: {
    readonly side?: number;
    readonly sessionPays?: boolean;
    readonly extraSystemTransfer?: boolean;
    readonly market?: Uint8Array;
  } = {}): string => {
    const baseKeys = options.sessionPays ? [keys[1]!, keys[0]!, ...keys.slice(2)] : keys;
    const orderedKeys = options.market ? [...baseKeys, options.market] : baseKeys;
    const at = (key: Uint8Array): number =>
      orderedKeys.findIndex((candidate) => base58Encode(candidate) === base58Encode(key));
    const instructions: Uint8Array[] = [];
    // Compute budget (fee payer only).
    instructions.push(join(new Uint8Array([at(computeBudget)]), compact(0), compact(5), new Uint8Array([2, 0, 0, 0, 0])));
    // Delegated place: [session, vault, delegate, strataProgram, owner, feePayer, inner: vault, market, ua, order, system, rentBank]
    const placeAccounts = [
      at(keys[1]!), at(vaultPda), at(delegatePda), at(strataProgram), at(keys[8]!), at(feePayer),
      at(vaultPda), at(options.market ?? marketPda), at(userAccount), at(orderPda), at(systemProgram), at(rentBank),
    ];
    const placeData = envelope(placeInner(options.side ?? 0, 3, 150_000_000n, 1_000_000_000n));
    instructions.push(join(
      new Uint8Array([at(vaultProgram)]), compact(placeAccounts.length), Uint8Array.from(placeAccounts),
      compact(placeData.length), placeData,
    ));
    if (options.extraSystemTransfer) {
      instructions.push(join(
        new Uint8Array([at(systemProgram)]), compact(2), Uint8Array.from([at(keys[1]!), at(feePayer)]),
        compact(12), join(new Uint8Array([2, 0, 0, 0]), u64(1n)),
      ));
    }
    const message = join(
      new Uint8Array([0x80, 2, 0, 5]),
      compact(orderedKeys.length), ...orderedKeys,
      recentBlockhash,
      compact(instructions.length), ...instructions,
      compact(0),
    );
    return Buffer.from(join(compact(2), new Uint8Array(128), message)).toString("base64");
  };
  const prepared = {
    schema_version: 2,
    contract_version: "2.0",
    order_control_id: "or_44444444444444444444444444444444",
    market_id: marketId,
    action: "place",
    order_ids: [orderId],
    transaction_base64: buildTx(),
    recent_blockhash: base58Encode(recentBlockhash),
    last_valid_block_height: 400_000_000,
    expires_at_ms: expiresAtMs,
  };
  const submitted = {
    schema_version: 2,
    contract_version: "2.0",
    order_control_id: prepared.order_control_id,
    market_id: marketId,
    action: "place",
    order_ids: [orderId],
    signature: "1".repeat(64),
    status: "submitted",
  };
  const signedMessages: Uint8Array[] = [];
  const prepareBodies: Array<Record<string, unknown>> = [];
  let submitBody: Record<string, unknown> | undefined;
  let nextTransaction = prepared.transaction_base64;
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      if (path.endsWith("/capabilities")) return Response.json(capabilities);
      if (path.endsWith("/challenge")) throw new Error("one-signature path must not challenge");
      if (path.endsWith("/prepare")) {
        prepareBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({ ...prepared, transaction_base64: nextTransaction });
      }
      submitBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json(submitted);
    },
  });
  const signer = {
    publicKey: sessionPublicKey,
    signMessage: async (message: Uint8Array) => {
      signedMessages.push(message);
      return new Uint8Array(64).fill(7);
    },
    signTransaction: async (transaction: string) => {
      assert.equal(transaction, nextTransaction);
      return transaction;
    },
  };
  const operation = {
    action: "place" as const,
    ownerWallet,
    clientOrderId: "agent-42",
    side: "buy" as const,
    orderType: "post_only" as const,
    limitPriceAtoms: 150_000_000n,
    sizeAtoms: 1_000_000_000n,
  };
  // Default path: no verifier supplied — the SDK decodes the transaction and
  // requires it to be exactly this operation before the one signature.
  const receipt = await client.orders.execute(marketId, { operation, signer });
  assert.deepEqual(signedMessages, []);
  assert.equal(prepareBodies.length, 1);
  assert.equal(prepareBodies[0]?.action, "place");
  assert.equal(prepareBodies[0]?.session_public_key, sessionPublicKey);
  assert.equal("account_sequence" in (prepareBodies[0] ?? {}), false);
  assert.equal(submitBody?.signed_transaction_base64, prepared.transaction_base64);
  assert.equal(receipt.status, "submitted");

  // A custom verifier still receives the operation and prepared transaction.
  let verified = false;
  await client.orders.execute(marketId, {
    operation,
    signer,
    verifyTransaction: ({ challenge, operation: bound, prepared: transaction, ownerWallet: owner }) => {
      assert.equal(challenge, undefined);
      assert.equal(bound?.action, "place");
      assert.equal(transaction.recent_blockhash, base58Encode(recentBlockhash));
      assert.equal(owner, ownerWallet);
      verified = true;
    },
  });
  assert.equal(verified, true);

  // A custom signer may fill signature bytes, but it may never rebuild the
  // exact message the SDK verified.
  const mutatingSigner = {
    ...signer,
    signTransaction: async (transaction: string) => {
      const wire = new Uint8Array(Buffer.from(transaction, "base64"));
      wire[wire.length - 1] = wire[wire.length - 1]! ^ 1;
      return Buffer.from(wire).toString("base64");
    },
  };
  await assert.rejects(
    client.orders.execute(marketId, { operation, signer: mutatingSigner }),
    /message changed after verification/,
  );

  // Built-in verifier refusals: a different side, the session as fee payer,
  // a session-signed system transfer, another market.
  nextTransaction = buildTx({ side: 1 });
  await assert.rejects(client.orders.execute(marketId, { operation, signer }), /exactly the requested orders/);
  nextTransaction = buildTx({ sessionPays: true });
  await assert.rejects(client.orders.execute(marketId, { operation, signer }), /fee payer/);
  nextTransaction = buildTx({ extraSystemTransfer: true });
  await assert.rejects(client.orders.execute(marketId, { operation, signer }), /system or token instruction/);
  nextTransaction = buildTx({ market: new Uint8Array(32).fill(7) });
  await assert.rejects(client.orders.execute(marketId, { operation, signer }), /another market/);
});

test("executes a bounded TWAP only after byte-exact authorization and transaction verification", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  (capabilities.capabilities as Array<Record<string, unknown>>).push({
    id: "algos.twap.place",
    risk: "submit",
    required_scope: "algos:submit",
    transports: ["http", "mcp"],
    mcp_exposure: "submit",
  });
  const marketId = "market_22222222222222222222222222222222";
  const ownerWallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  const sessionPublicKey = "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2";
  const twapPda = new Uint8Array(32).fill(3);
  const nonce = new Uint8Array(16).fill(4);
  const recentBlockhash = new Uint8Array(32).fill(5);
  const expiresAtMs = 1_786_550_460_000;
  const encoder = new TextEncoder();
  const join = (...parts: readonly Uint8Array[]): Uint8Array => {
    const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  };
  const u16 = (value: number): Uint8Array => {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setUint16(0, value, true);
    return bytes;
  };
  const u32 = (value: number): Uint8Array => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, true);
    return bytes;
  };
  const u64 = (value: bigint): Uint8Array => {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, value, true);
    return bytes;
  };
  const authorization = join(
    encoder.encode("strata-twap-control:v1\0"),
    new Uint8Array(32).fill(9),
    new Uint8Array(32).fill(8),
    base58Decode(ownerWallet, 32, "ownerWallet"),
    base58Decode(sessionPublicKey, 32, "sessionPublicKey"),
    new Uint8Array([0, 0]),
    u64(10_000_000n),
    u16(10),
    u16(100),
    u32(100),
    u64(150_000_000n),
    u64(7n),
    twapPda,
    recentBlockhash,
    u64(400_000_000n),
    u64(BigInt(expiresAtMs)),
    nonce,
  );
  const opaqueInput = encoder.encode(
    `strata-sdk-product:v1\0twap\0${base58Encode(twapPda)}`,
  );
  const opaqueDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", opaqueInput));
  const twapId = `twap_${Array.from(opaqueDigest.slice(0, 16), (byte) =>
    byte.toString(16).padStart(2, "0")).join("")}`;
  const challenge = {
    schema_version: 2,
    contract_version: "2.0",
    challenge_id: `twc_${Array.from(nonce, (byte) =>
      byte.toString(16).padStart(2, "0")).join("")}`,
    market_id: marketId,
    action: "place",
    twap_id: twapId,
    authorization_payload_base64: Buffer.from(authorization).toString("base64"),
    server_time_ms: expiresAtMs - 60_000,
    expires_at_ms: expiresAtMs,
  };
  const prepared = {
    schema_version: 2,
    contract_version: "2.0",
    twap_control_id: "twctl_44444444444444444444444444444444",
    market_id: marketId,
    action: "place",
    twap_id: twapId,
    transaction_base64: Buffer.from(join(
      new Uint8Array([1]),
      new Uint8Array(64),
      new Uint8Array([0x80, 1, 0, 0, 1]),
      base58Decode(sessionPublicKey, 32, "sessionPublicKey"),
      recentBlockhash,
      new Uint8Array([0, 0]),
    )).toString("base64"),
    recent_blockhash: base58Encode(recentBlockhash),
    last_valid_block_height: 400_000_000,
    expires_at_ms: expiresAtMs,
  };
  const submitted = {
    schema_version: 2,
    contract_version: "2.0",
    twap_control_id: prepared.twap_control_id,
    market_id: marketId,
    action: "place",
    twap_id: twapId,
    signature: "1".repeat(64),
    status: "submitted",
  };
  const signedMessages: Uint8Array[] = [];
  let verified = false;
  let submitBody: Record<string, unknown> | undefined;
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      if (path.endsWith("/capabilities")) return Response.json(capabilities);
      if (path.endsWith("/challenge")) return Response.json(challenge);
      if (path.endsWith("/prepare")) return Response.json(prepared);
      submitBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json(submitted);
    },
  });
  const receipt = await client.algos.execute(marketId, {
    operation: {
      action: "place",
      ownerWallet,
      side: "buy",
      totalSizeAtoms: 10_000_000n,
      slicesTotal: 10,
      maximumToleranceBps: 100,
      intervalSlots: 100,
      limitPriceAtoms: 150_000_000n,
    },
    signer: {
      publicKey: sessionPublicKey,
      signMessage: async (message) => {
        signedMessages.push(message);
        return new Uint8Array(64).fill(7);
      },
      signTransaction: async (transaction) => {
        assert.equal(verified, true);
        assert.equal(transaction, prepared.transaction_base64);
        return transaction;
      },
    },
    verifyTransaction: ({ challenge: bound, operation, prepared: transaction, ownerWallet: owner }) => {
      // One signature: no challenge round trip, the operation itself is bound.
      assert.equal(bound, undefined);
      assert.equal(operation?.action, "place");
      assert.equal(transaction.twap_id, twapId);
      assert.equal(transaction.recent_blockhash, base58Encode(recentBlockhash));
      assert.equal(owner, ownerWallet);
      verified = true;
    },
  });

  // The session never signs a message any more — only the transaction.
  assert.deepEqual(signedMessages, []);
  assert.ok(authorization.length > 0);
  assert.equal(verified, true);
  assert.equal(submitBody?.signed_transaction_base64, prepared.transaction_base64);
  assert.equal(receipt.twap_id, twapId);
  assert.equal(receipt.status, "submitted");
});

test("serializes atomic replace and mixed batch order controls without implementation details", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  (capabilities.capabilities as Array<Record<string, unknown>>).push({
    id: "orders.prepare",
    risk: "prepare",
    required_scope: "orders:prepare",
    transports: ["http", "mcp"],
    mcp_exposure: "prepare",
  });
  const fixture = await v2Fixture("order-challenge");
  const marketId = "market_22222222222222222222222222222222";
  const ownerWallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  const sessionPublicKey = "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2";
  const oldOrder = "order_11111111111111111111111111111111";
  const bodies: Array<Record<string, unknown>> = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      if (path.endsWith("/capabilities")) return Response.json(capabilities);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      return Response.json({
        ...fixture,
        action: body.action,
        order_ids: body.action === "replace"
          ? [oldOrder, "order_22222222222222222222222222222222"]
          : [oldOrder, "order_33333333333333333333333333333333"],
      });
    },
  });
  const place = {
    accountSequence: 8n,
    clientOrderId: "replacement-8",
    side: "sell" as const,
    orderType: "post_only" as const,
    limitPriceAtoms: 151_000_000n,
    sizeAtoms: 2_000_000n,
  };
  await client.orders.challenge(marketId, {
    action: "replace",
    ownerWallet,
    sessionPublicKey,
    orderId: oldOrder,
    ...place,
  });
  await client.orders.challenge(marketId, {
    action: "batch",
    ownerWallet,
    sessionPublicKey,
    operations: [
      { action: "cancel", orderId: oldOrder },
      { action: "place", ...place, accountSequence: 9n, clientOrderId: "batch-9" },
    ],
  });
  assert.deepEqual(bodies[0], {
    action: "replace",
    owner_wallet: ownerWallet,
    session_public_key: sessionPublicKey,
    order_id: oldOrder,
    account_sequence: "8",
    client_order_id: "replacement-8",
    side: "sell",
    order_type: "post_only",
    limit_price_atoms: "151000000",
    size_atoms: "2000000",
  });
  assert.deepEqual((bodies[1]?.operations as unknown[]), [
    { action: "cancel", order_id: oldOrder },
    {
      action: "place",
      account_sequence: "9",
      client_order_id: "batch-9",
      side: "sell",
      order_type: "post_only",
      limit_price_atoms: "151000000",
      size_atoms: "2000000",
    },
  ]);
  assert.equal(JSON.stringify(bodies).includes("venue"), false);
  assert.equal(JSON.stringify(bodies).includes("program"), false);
});

test("rejects a changed nested replacement after batch authorization", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  (capabilities.capabilities as Array<Record<string, unknown>>).push({
    id: "orders.prepare",
    risk: "prepare",
    required_scope: "orders:prepare",
    transports: ["http", "mcp"],
    mcp_exposure: "prepare",
  });
  const marketId = "market_22222222222222222222222222222222";
  const ownerWallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  const sessionPublicKey = "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2";
  const cancelled = new Uint8Array(32).fill(3);
  const replaced = new Uint8Array(32).fill(4);
  const replacement = new Uint8Array(32).fill(5);
  const nonce = new Uint8Array(16).fill(6);
  const expiresAtMs = 1_786_550_460_000;
  const encoder = new TextEncoder();
  const u16 = (value: number): Uint8Array => {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setUint16(0, value, true);
    return bytes;
  };
  const u64 = (value: bigint): Uint8Array => {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, value, true);
    return bytes;
  };
  const join = (...parts: readonly Uint8Array[]): Uint8Array => {
    const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  };
  const opaqueOrderId = async (pda: Uint8Array): Promise<string> => {
    const input = encoder.encode(
      `strata-sdk-product:v1\0order\0${marketId}:${base58Encode(pda)}`,
    );
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
    return `order_${Array.from(digest.slice(0, 16), (byte) =>
      byte.toString(16).padStart(2, "0")).join("")}`;
  };
  const replacementClientId = encoder.encode("replacement-8");
  const authorization = join(
    encoder.encode("strata-platform-order-control:v1\0"),
    new Uint8Array(32).fill(9),
    base58Decode(ownerWallet, 32, "ownerWallet"),
    base58Decode(sessionPublicKey, 32, "sessionPublicKey"),
    new Uint8Array([4, 2]),
    new Uint8Array([1]),
    cancelled,
    new Uint8Array([1]),
    new Uint8Array([3]),
    replaced,
    new Uint8Array([0]),
    u64(8n),
    u16(replacementClientId.length),
    replacementClientId,
    new Uint8Array([1, 3]),
    u64(151_000_000n),
    u64(2_000_000n),
    replacement,
    new Uint8Array(32).fill(7),
    u64(400_000_000n),
    u64(BigInt(expiresAtMs)),
    nonce,
    new Uint8Array(16).fill(8),
  );
  const challenge = {
    schema_version: 2,
    contract_version: "2.0",
    challenge_id: `oc_${Array.from(nonce, (byte) =>
      byte.toString(16).padStart(2, "0")).join("")}`,
    market_id: marketId,
    action: "batch",
    order_ids: await Promise.all([cancelled, replaced, replacement].map(opaqueOrderId)),
    authorization_payload_base64: Buffer.from(authorization).toString("base64"),
    server_time_ms: expiresAtMs - 60_000,
    expires_at_ms: expiresAtMs,
  };
  // Two-step (challenge) integrators validate the payload before signing it;
  // any drift between the request and the server's bound bytes is refused.
  assert.ok(capabilities);
  await assert.rejects(
    validateOrderAuthorization(
      challenge as never,
      {
        action: "batch",
        ownerWallet,
        operations: [
          { action: "cancel", orderId: await opaqueOrderId(cancelled) },
          {
            action: "replace",
            orderId: await opaqueOrderId(replaced),
            accountSequence: 8n,
            clientOrderId: "replacement-8",
            side: "sell",
            orderType: "post_only",
            limitPriceAtoms: 151_000_000n,
            sizeAtoms: 2_000_001n,
          },
        ],
      },
      sessionPublicKey,
    ),
    /order size changed/,
  );
});

test("authenticates persistent order commands without enabling self-trade cancellation by default", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  (capabilities.capabilities as Array<Record<string, unknown>>).push(
    {
      id: "orders.prepare",
      risk: "prepare",
      required_scope: "orders:prepare",
      transports: ["http", "websocket", "mcp"],
      mcp_exposure: "prepare",
    },
    {
      id: "orders.submit",
      risk: "submit",
      required_scope: "orders:submit",
      transports: ["http", "websocket", "mcp"],
      mcp_exposure: "submit",
    },
  );
  const marketId = "market_22222222222222222222222222222222";
  const ownerWallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  const sessionPublicKey = "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2";
  const sockets: FakeWebSocket[] = [];
  const signedMessages: string[] = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async () => Response.json(capabilities),
  });
  const connection = await client.orders.connect(
    marketId,
    ownerWallet,
    {
      publicKey: sessionPublicKey,
      signMessage: async (message) => {
        signedMessages.push(new TextDecoder().decode(message));
        return new Uint8Array(64).fill(5);
      },
      signTransaction: async () => "AQ==",
    },
    {},
    {
      reconnect: false,
      webSocketFactory: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    },
  );
  const challengeNonce = "ab".repeat(32);
  sockets[0]!.emit({
    type: "auth_challenge",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    challenge: challengeNonce,
    server_time_ms: 1786550400000,
    expires_at_ms: 1786550405000,
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(
    signedMessages[0],
    `strata:order-command-stream:v2\n${marketId}\n${ownerWallet}\n${sessionPublicKey}\n${challengeNonce}`,
  );
  assert.deepEqual(JSON.parse(sockets[0]!.sent[0]!), {
    type: "authenticate",
    owner_wallet: ownerWallet,
    session_public_key: sessionPublicKey,
    signature: base58Encode(new Uint8Array(64).fill(5)),
    batch_format: "compact_v1",
  });
  const streamId = "order_command_stream_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  sockets[0]!.emit([{
    type: "ready",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    stream_id: streamId,
    sequence: "1",
    server_time_ms: 1786550400001,
  }]);
  await connection.ready;

  const resultPromise = connection.challenge({
    action: "place",
    ownerWallet,
    accountSequence: 8n,
    clientOrderId: "agent-8",
    side: "buy",
    orderType: "post_only",
    limitPriceAtoms: 150_000_000n,
    sizeAtoms: 2_000_000n,
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const command = JSON.parse(sockets[0]!.sent[1]!) as Record<string, unknown>;
  assert.equal(command.type, "command");
  assert.equal(command.sequence, "1");
  assert.equal((command.command as Record<string, unknown>).self_trade_prevention, "none");
  const response = await v2Fixture("order-challenge");
  sockets[0]!.emit([{
    type: "challenge_result",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    stream_id: streamId,
    sequence: "2",
    previous_sequence: "1",
    request_id: command.request_id,
    self_trade_prevention: "none",
    prevented_order_ids: [],
    effective_request: {
      action: "place",
      owner_wallet: ownerWallet,
      session_public_key: sessionPublicKey,
      account_sequence: "8",
      client_order_id: "agent-8",
      side: "buy",
      order_type: "post_only",
      limit_price_atoms: "150000000",
      size_atoms: "2000000",
    },
    response,
    server_time_ms: 1786550400002,
  }]);
  const result = await resultPromise;
  assert.equal(result.selfTradePrevention, "none");
  assert.equal(result.response.challenge_id, "oc_11111111111111111111111111111111");
  assert.equal(JSON.stringify(command).includes("venue"), false);

  const statusOne = connection.status(`or_${"0".repeat(32)}`, "batch-one");
  const statusTwo = connection.status(`or_${"0".repeat(32)}`, "batch-two");
  await new Promise<void>((resolve) => setImmediate(resolve));
  const statusCommands = JSON.parse(sockets[0]!.sent[2]!) as Record<string, unknown>[];
  assert.equal(statusCommands.length, 2);
  const [statusCommandOne, statusCommandTwo] = statusCommands;
  assert.equal(sockets[0]!.sent.length, 3);
  sockets[0]!.emit({
    type: "event_batch",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    stream_id: streamId,
    first_sequence: "3",
    previous_sequence: "2",
    server_time_ms: 1786550400003,
    events: [{
      type: "command_error",
      request_id: statusCommandOne!.request_id,
      error: {
        code: "session_expired",
        message: "The order authorization is invalid or expired.",
        retryable: false,
      },
    },
    {
      type: "command_error",
      request_id: statusCommandTwo!.request_id,
      error: {
        code: "session_expired",
        message: "The order authorization is invalid or expired.",
        retryable: false,
      },
    }],
  });
  await assert.rejects(statusOne, /invalid or expired/);
  await assert.rejects(statusTwo, /invalid or expired/);

  const probe = connection.probe("health-1");
  await new Promise<void>((resolve) => setImmediate(resolve));
  const probeCommand = JSON.parse(sockets[0]!.sent[3]!) as Record<string, unknown>;
  assert.equal(probeCommand.type, "command");
  assert.equal(probeCommand.sequence, "4");
  assert.deepEqual(probeCommand.command, { type: "probe", nonce: "health-1" });
  sockets[0]!.emit({
    type: "event_batch",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    stream_id: streamId,
    first_sequence: "5",
    previous_sequence: "4",
    server_time_ms: 1786550400004,
    events: [{
      type: "probe_result",
      request_id: probeCommand.request_id,
      nonce: "health-1",
    }],
  });
  await probe;
  assert.equal(sockets[0]!.closed, false);
  connection.close();
});

test("produces a machine-readable order command latency and load certificate", async () => {
  let closed = 0;
  const certificate = await certifyPlatformOrderCommandSlo({
    connections: 2,
    samples: 40,
    warmupSamplesPerConnection: 2,
    maximumInflightPerConnection: 4,
    thresholds: {
      authenticationP99Ms: 1_000,
      commandP50Ms: 1_000,
      commandP95Ms: 1_000,
      commandP99Ms: 1_000,
      minimumThroughputCommandsPerSecond: 0,
      maximumErrorRate: 0,
    },
    connect: async () => ({
      ready: Promise.resolve(),
      probe: async () => {},
      challenge: async () => { throw new Error("unused"); },
      execute: async () => { throw new Error("unused"); },
      status: async () => { throw new Error("unused"); },
      armDeadMan: async () => { throw new Error("unused"); },
      deadManStatus: async () => { throw new Error("unused"); },
      heartbeatDeadMan: async () => { throw new Error("unused"); },
      disarmDeadMan: async () => { throw new Error("unused"); },
      close: () => { closed += 1; },
    }),
    probe: async () => Promise.resolve(),
  });
  assert.equal(certificate.kind, "strata-order-command-slo");
  assert.equal(certificate.commands.samples, 40);
  assert.equal(certificate.load_commands.samples, 40);
  assert.equal(certificate.configuration.samples_per_phase, 40);
  assert.equal(certificate.errors, 0);
  assert.equal(certificate.passed, true);
  assert.equal(closed, 2);
});

test("maker stream by wallet address opens without a signature", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
  (capabilities.capabilities as Array<Record<string, unknown>>).push({
    id: "mm.fills.stream",
    risk: "read",
    required_scope: "mm:read",
    transports: ["websocket"],
    mcp_exposure: "none",
  });
  const marketId = "market_33333333333333333333333333333333";
  const wallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  const sockets: FakeWebSocket[] = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async () => Response.json(capabilities),
  });
  const subscription = await client.marketMaking.subscribe(
    marketId,
    wallet,
    { onError: () => {} },
    {
      reconnect: false,
      webSocketFactory: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    },
  );
  subscription.ready.catch(() => {});
  sockets[0]!.emit({
    type: "auth_challenge",
    schema_version: 2,
    contract_version: "2.0",
    market_id: marketId,
    wallet_address: wallet,
    challenge: "ab".repeat(32),
    server_time_ms: 1786550400000,
    expires_at_ms: 1786550405000,
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  // Public read: the client answers the compatibility challenge with `open`.
  assert.deepEqual(JSON.parse(sockets[0]!.sent[0] ?? "{}"), { type: "open" });
  subscription.close();
  await new Promise<void>((resolve) => setImmediate(resolve));
});
