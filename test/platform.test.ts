import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  base58Decode,
  base58Encode,
  StrataContractError,
  StrataPlatformClient,
  type PlatformAccountView,
  type PlatformBookView,
} from "../src/index.js";

class FakeWebSocket {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  readonly url: string;
  closed = false;
  readonly sent: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  emit(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent);
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

test("reads the complete book, status, fee schedule, and recent trades by opaque market ID", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
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

test("authenticates and recovers sequenced private account streams", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
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

test("rejects account readiness and stops reconnecting after signer failure", async () => {
  const capabilities = await v2Fixture("platform-capabilities");
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

test("exposes product-level resting-order challenge, prepare, and idempotent submit", async () => {
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
  const requests: Array<{ path: string; body: unknown }> = [];
  const client = new StrataPlatformClient({
    apiBase: "https://example.test",
    fetch: async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      if (path.endsWith("/capabilities")) return Response.json(capabilities);
      requests.push({ path, body: JSON.parse(String(init?.body)) });
      if (path.endsWith("/challenge")) return Response.json(challenge);
      if (path.endsWith("/prepare")) return Response.json(prepared);
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

  assert.equal(bound.action, "place");
  assert.deepEqual(tx.order_ids, bound.order_ids);
  assert.equal(receipt.status, "submitted");
  assert.deepEqual(requests.map((request) => request.path), [
    `/v2/markets/${marketId}/orders/challenge`,
    `/v2/markets/${marketId}/orders/prepare`,
    `/v2/markets/${marketId}/orders/submit`,
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

test("executes a resting order only after byte-exact authorization and transaction verification", async () => {
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
  const marketId = "market_22222222222222222222222222222222";
  const ownerWallet = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
  const sessionPublicKey = "9Uu7cLBgfMk233BAjMvTS8XJy6KbZK7oQ7NXuCTi3Fg2";
  const orderPda = new Uint8Array(32).fill(3);
  const nonce = new Uint8Array(16).fill(4);
  const recentBlockhash = new Uint8Array(32).fill(5);
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
  const clientOrderId = encoder.encode("agent-42");
  const authorization = join(
    encoder.encode("strata-platform-order-control:v1\0"),
    new Uint8Array(32).fill(9),
    base58Decode(ownerWallet, 32, "ownerWallet"),
    base58Decode(sessionPublicKey, 32, "sessionPublicKey"),
    new Uint8Array([0]),
    u64(7n),
    u16(clientOrderId.length),
    clientOrderId,
    new Uint8Array([0, 3]),
    u64(150_000_000n),
    u64(1_000_000_000n),
    orderPda,
    recentBlockhash,
    u64(400_000_000n),
    u64(BigInt(expiresAtMs)),
    nonce,
    new Uint8Array(16).fill(6),
  );
  const opaqueInput = encoder.encode(
    `strata-sdk-product:v1\0order\0${marketId}:${base58Encode(orderPda)}`,
  );
  const opaqueDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", opaqueInput));
  const orderId = `order_${Array.from(opaqueDigest.slice(0, 16), (byte) =>
    byte.toString(16).padStart(2, "0")).join("")}`;
  const challenge = {
    schema_version: 2,
    contract_version: "2.0",
    challenge_id: `oc_${Array.from(nonce, (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
    market_id: marketId,
    action: "place",
    order_ids: [orderId],
    authorization_payload_base64: Buffer.from(authorization).toString("base64"),
    server_time_ms: expiresAtMs - 60_000,
    expires_at_ms: expiresAtMs,
  };
  const prepared = {
    schema_version: 2,
    contract_version: "2.0",
    order_control_id: "or_44444444444444444444444444444444",
    market_id: marketId,
    action: "place",
    order_ids: [orderId],
    transaction_base64: "AQIDBA==",
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
  const receipt = await client.orders.execute(marketId, {
    operation: {
      action: "place",
      ownerWallet,
      accountSequence: 7n,
      clientOrderId: "agent-42",
      side: "buy",
      orderType: "post_only",
      limitPriceAtoms: 150_000_000n,
      sizeAtoms: 1_000_000_000n,
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
        return "BQYHCA==";
      },
    },
    verifyTransaction: ({ challenge: bound, prepared: transaction, ownerWallet: owner }) => {
      assert.equal(bound.order_ids[0], orderId);
      assert.equal(transaction.recent_blockhash, base58Encode(recentBlockhash));
      assert.equal(owner, ownerWallet);
      verified = true;
    },
  });

  assert.deepEqual(signedMessages, [authorization]);
  assert.equal(verified, true);
  assert.equal(submitBody?.signed_transaction_base64, "BQYHCA==");
  assert.equal(receipt.status, "submitted");
});
