import {
  base58Encode,
  base58Decode,
  canonicalPublicKey,
  decodeBase64,
  normalizeIdempotencyKey,
  StrataApiError,
  StrataContractError,
} from "./client.js";
import {
  platformAccountSnapshotResponse,
  platformAssetsResponse,
  platformBestBidAskResponse,
  platformBookSnapshotResponse,
  platformDiscoveryResponse,
  platformFeeScheduleResponse,
  platformMarketStatusResponse,
  platformMarketsResponse,
  platformOrderChallengeResponse,
  platformOrderPrepareResponse,
  platformOrderStatusResponse,
  platformOrderSubmitResponse,
  platformTradesResponse,
} from "./platform-validation.js";
import {
  accountHttpAuthMessage,
  bytesToHex,
  subscribePlatformAccount,
  type PlatformAccountHandlers,
  type PlatformAccountSubscription,
  type PlatformAccountSubscriptionOptions,
} from "./platform-account-stream.js";
import {
  subscribePlatformMarketData,
  type PlatformMarketDataHandlers,
  type PlatformMarketDataSubscription,
  type PlatformMarketDataSubscriptionOptions,
} from "./platform-stream.js";
import {
  connectPlatformOrderCommands,
  type PlatformOrderCommandConnection,
  type PlatformOrderCommandHandlers,
  type PlatformOrderCommandOptions,
} from "./platform-order-stream.js";
import type {
  PageRequest,
  PlatformAccountSigner,
  PlatformAccountSnapshot,
  PlatformAccountSnapshotResponse,
  PlatformAssetsResponse,
  PlatformBestBidAskResponse,
  PlatformBookSnapshotResponse,
  PlatformDiscoveryResponse,
  PlatformFeeScheduleResponse,
  PlatformMarketStatusResponse,
  PlatformMarketsResponse,
  PlatformOrderChallengeInput,
  PlatformOrderChallengeResponse,
  PlatformOrderExecuteInput,
  PlatformOrderExecuteOperation,
  PlatformOrderPrepareInput,
  PlatformOrderPrepareResponse,
  PlatformOrderStatusInput,
  PlatformOrderStatusResponse,
  PlatformOrderSubmitInput,
  PlatformOrderSubmitResponse,
  PlatformTradesResponse,
} from "./platform.js";
import { DEFAULT_API_BASE, type StrataSessionSigner } from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CAPABILITY_CACHE_MS = 5_000;
const MAX_PAGE_SIZE = 200;

export interface StrataPlatformClientOptions {
  readonly apiBase?: string;
  readonly timeoutMs?: number;
  readonly capabilityCacheMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export interface PlatformDiscoveryModule {
  /** Fetch the operations currently available to this client. */
  read(): Promise<PlatformDiscoveryResponse>;
}

export interface PlatformAssetsModule {
  list(request?: PageRequest): Promise<PlatformAssetsResponse>;
}

export interface PlatformMarketsModule {
  list(request?: PageRequest): Promise<PlatformMarketsResponse>;
}

export interface PlatformBookRequest {
  readonly depth?: number;
}

export interface PlatformTradesRequest {
  readonly limit?: number;
}

export interface PlatformBooksModule {
  snapshot(marketId: string, request?: PlatformBookRequest): Promise<PlatformBookSnapshotResponse>;
  bestBidAsk(marketId: string): Promise<PlatformBestBidAskResponse>;
  fees(marketId: string): Promise<PlatformFeeScheduleResponse>;
  status(marketId: string): Promise<PlatformMarketStatusResponse>;
  trades(marketId: string, request?: PlatformTradesRequest): Promise<PlatformTradesResponse>;
  subscribe(
    marketId: string,
    handlers: PlatformMarketDataHandlers,
    options?: PlatformMarketDataSubscriptionOptions,
  ): Promise<PlatformMarketDataSubscription>;
}

export interface PlatformAccountRequest {
  /** Maximum recent fills returned for each market. */
  readonly fillLimit?: number;
  /** Omit to read every currently discoverable Strata market. */
  readonly marketIds?: readonly string[];
}

export interface PlatformAccountMarketRequest {
  readonly fillLimit?: number;
}

export interface PlatformAccountSubscribeOptions extends PlatformAccountSubscriptionOptions {
  /** Omit to subscribe to every currently discoverable Strata market. */
  readonly marketIds?: readonly string[];
}

export interface PlatformAccountModule {
  /** Read one market after proving control of the wallet with an external signer. */
  market(
    marketId: string,
    signer: PlatformAccountSigner,
    request?: PlatformAccountMarketRequest,
  ): Promise<PlatformAccountSnapshotResponse>;
  /** Read the wallet's orders and fills across discoverable markets. */
  snapshot(
    signer: PlatformAccountSigner,
    request?: PlatformAccountRequest,
  ): Promise<PlatformAccountSnapshot>;
  /** Stream signed private order and fill state across discoverable markets. */
  subscribe(
    signer: PlatformAccountSigner,
    handlers: PlatformAccountHandlers,
    options?: PlatformAccountSubscribeOptions,
  ): Promise<PlatformAccountSubscription>;
}

export interface PlatformOrdersModule {
  challenge(
    marketId: string,
    request: PlatformOrderChallengeInput,
  ): Promise<PlatformOrderChallengeResponse>;
  prepare(
    marketId: string,
    request: PlatformOrderPrepareInput,
  ): Promise<PlatformOrderPrepareResponse>;
  submit(
    marketId: string,
    request: PlatformOrderSubmitInput,
  ): Promise<PlatformOrderSubmitResponse>;
  status(
    marketId: string,
    request: PlatformOrderStatusInput,
  ): Promise<PlatformOrderStatusResponse>;
  /** Complete the challenge → external signatures → idempotent submit sequence. */
  execute(
    marketId: string,
    request: PlatformOrderExecuteInput,
  ): Promise<PlatformOrderSubmitResponse>;
  /** Open the authenticated low-latency order command channel for one market. */
  connect(
    marketId: string,
    ownerWallet: string,
    signer: StrataSessionSigner,
    handlers?: PlatformOrderCommandHandlers,
    options?: PlatformOrderCommandOptions,
  ): Promise<PlatformOrderCommandConnection>;
}

/**
 * Modular SDK 2.0 client. Only currently supported public modules are exposed.
 */
export class StrataPlatformClient {
  readonly apiBase: string;
  readonly timeoutMs: number;
  readonly capabilityCacheMs: number;
  readonly fetch: typeof globalThis.fetch;
  readonly discovery: PlatformDiscoveryModule;
  readonly assets: PlatformAssetsModule;
  readonly markets: PlatformMarketsModule;
  readonly books: PlatformBooksModule;
  readonly account: PlatformAccountModule;
  readonly orders: PlatformOrdersModule;
  private capabilityCache?: {
    readonly value: PlatformDiscoveryResponse;
    readonly expiresAtMs: number;
  };

  constructor(options: StrataPlatformClientOptions = {}) {
    const candidate = options.apiBase?.trim() || DEFAULT_API_BASE;
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new TypeError("apiBase must use http or https");
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.search = "";
    parsed.hash = "";
    this.apiBase = parsed.toString().replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new TypeError("timeoutMs must be a positive safe integer");
    }
    this.capabilityCacheMs = options.capabilityCacheMs ?? DEFAULT_CAPABILITY_CACHE_MS;
    if (!Number.isSafeInteger(this.capabilityCacheMs) || this.capabilityCacheMs < 0) {
      throw new TypeError("capabilityCacheMs must be a non-negative safe integer");
    }
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new TypeError("a Fetch-compatible implementation is required");
    }
    this.fetch = fetchImpl;
    this.discovery = { read: () => this.readDiscovery(true) };
    this.assets = { list: (request) => this.listAssets(request) };
    this.markets = { list: (request) => this.listMarkets(request) };
    this.books = {
      snapshot: (marketId, request) => this.bookSnapshot(marketId, request),
      bestBidAsk: (marketId) => this.bestBidAsk(marketId),
      fees: (marketId) => this.feeSchedule(marketId),
      status: (marketId) => this.marketStatus(marketId),
      trades: (marketId, request) => this.trades(marketId, request),
      subscribe: (marketId, handlers, streamOptions) =>
        this.subscribeBook(marketId, handlers, streamOptions),
    };
    this.account = {
      market: (marketId, signer, request) => this.accountMarket(marketId, signer, request),
      snapshot: (signer, request) => this.accountSnapshot(signer, request),
      subscribe: (signer, handlers, streamOptions) =>
        this.subscribeAccount(signer, handlers, streamOptions),
    };
    this.orders = {
      challenge: (marketId, request) => this.orderChallenge(marketId, request),
      prepare: (marketId, request) => this.orderPrepare(marketId, request),
      submit: (marketId, request) => this.orderSubmit(marketId, request),
      status: (marketId, request) => this.orderStatus(marketId, request),
      execute: (marketId, request) => this.executeOrder(marketId, request),
      connect: (marketId, ownerWallet, signer, handlers, streamOptions) =>
        this.connectOrders(marketId, ownerWallet, signer, handlers, streamOptions),
    };
  }

  private async readDiscovery(force: boolean): Promise<PlatformDiscoveryResponse> {
    const now = Date.now();
    if (!force && this.capabilityCache && this.capabilityCache.expiresAtMs > now) {
      return this.capabilityCache.value;
    }
    const value = platformDiscoveryResponse(await this.get("/v2/capabilities"));
    this.capabilityCache = {
      value,
      expiresAtMs: now + this.capabilityCacheMs,
    };
    return value;
  }

  private async listAssets(request: PageRequest = {}): Promise<PlatformAssetsResponse> {
    await this.requireReadCapability("assets.read");
    return platformAssetsResponse(await this.get(`/v2/assets${pageQuery(request)}`));
  }

  private async listMarkets(request: PageRequest = {}): Promise<PlatformMarketsResponse> {
    await this.requireReadCapability("markets.read");
    return platformMarketsResponse(await this.get(`/v2/markets${pageQuery(request)}`));
  }

  private async bookSnapshot(
    marketId: string,
    request: PlatformBookRequest = {},
  ): Promise<PlatformBookSnapshotResponse> {
    await this.requireReadCapability("books.read", "http");
    const id = checkedMarketId(marketId);
    const query = depthQuery(request);
    const response = platformBookSnapshotResponse(
      await this.get(`/v2/markets/${id}/book${query}`),
    );
    assertMarket(response.market_id, id);
    return response;
  }

  private async feeSchedule(marketId: string): Promise<PlatformFeeScheduleResponse> {
    await this.requireReadCapability("books.read", "http");
    const id = checkedMarketId(marketId);
    const response = platformFeeScheduleResponse(await this.get(`/v2/markets/${id}/fees`));
    assertMarket(response.market_id, id);
    return response;
  }

  private async bestBidAsk(marketId: string): Promise<PlatformBestBidAskResponse> {
    await this.requireReadCapability("books.read", "http");
    const id = checkedMarketId(marketId);
    const response = platformBestBidAskResponse(await this.get(`/v2/markets/${id}/bbo`));
    assertMarket(response.market_id, id);
    return response;
  }

  private async marketStatus(marketId: string): Promise<PlatformMarketStatusResponse> {
    await this.requireReadCapability("books.read", "http");
    const id = checkedMarketId(marketId);
    const response = platformMarketStatusResponse(await this.get(`/v2/markets/${id}/status`));
    assertMarket(response.market_id, id);
    return response;
  }

  private async trades(
    marketId: string,
    request: PlatformTradesRequest = {},
  ): Promise<PlatformTradesResponse> {
    await this.requireReadCapability("books.read", "http");
    const id = checkedMarketId(marketId);
    const query = tradesQuery(request);
    const response = platformTradesResponse(
      await this.get(`/v2/markets/${id}/trades${query}`),
    );
    assertMarket(response.market_id, id);
    return response;
  }

  private async subscribeBook(
    marketId: string,
    handlers: PlatformMarketDataHandlers,
    options: PlatformMarketDataSubscriptionOptions = {},
  ): Promise<PlatformMarketDataSubscription> {
    await this.requireReadCapability("books.read", "websocket");
    return subscribePlatformMarketData(this.apiBase, checkedMarketId(marketId), handlers, options);
  }

  private async accountMarket(
    marketId: string,
    signer: PlatformAccountSigner,
    request: PlatformAccountMarketRequest = {},
  ): Promise<PlatformAccountSnapshotResponse> {
    const discovery = await this.requireReadCapability("account.read", "http");
    const id = checkedMarketId(marketId);
    const authorizedSigner = checkedAccountSigner(signer);
    const fillLimit = checkedFillLimit(request.fillLimit);
    // Bind authorization to Strata's clock so a skewed agent host still signs
    // inside the server's short read window.
    const timestampMs = discovery.server_time_ms;
    const signature = await authorizedSigner.signMessage(
      accountHttpAuthMessage(id, authorizedSigner.publicKey, timestampMs, fillLimit),
    );
    if (!(signature instanceof Uint8Array) || signature.length !== 64) {
      throw new TypeError("account signer must return a 64-byte Ed25519 signature");
    }
    const response = platformAccountSnapshotResponse(await this.get(
      `/v2/markets/${id}/account/${authorizedSigner.publicKey}${fillLimitQuery(request.fillLimit)}`,
      {
        "X-Strata-Auth-Time": String(timestampMs),
        "X-Strata-Auth-Signature": bytesToHex(signature),
      },
    ));
    assertMarket(response.market_id, id);
    if (response.wallet_address !== authorizedSigner.publicKey) {
      throw new StrataContractError("response wallet does not match signed request");
    }
    return response;
  }

  private async accountSnapshot(
    signer: PlatformAccountSigner,
    request: PlatformAccountRequest = {},
  ): Promise<PlatformAccountSnapshot> {
    const authorizedSigner = checkedAccountSigner(signer);
    const marketIds = await this.accountMarketIds(request.marketIds);
    const markets: PlatformAccountSnapshotResponse[] = [];
    // Sign sequentially so interactive external signers are never prompted concurrently.
    for (const marketId of marketIds) {
      markets.push(await this.accountMarket(marketId, authorizedSigner, request));
    }
    return {
      wallet_address: authorizedSigner.publicKey,
      server_time_ms: markets.reduce(
        (latest, market) => Math.max(latest, market.server_time_ms),
        0,
      ),
      markets,
    };
  }

  private async subscribeAccount(
    signer: PlatformAccountSigner,
    handlers: PlatformAccountHandlers,
    options: PlatformAccountSubscribeOptions = {},
  ): Promise<PlatformAccountSubscription> {
    await this.requireReadCapability("account.read", "websocket");
    const authorizedSigner = checkedAccountSigner(signer);
    const marketIds = await this.accountMarketIds(options.marketIds);
    const { marketIds: _marketIds, ...streamOptions } = options;
    return subscribePlatformAccount(
      this.apiBase,
      marketIds,
      authorizedSigner,
      handlers,
      streamOptions,
    );
  }

  private async orderChallenge(
    marketId: string,
    request: PlatformOrderChallengeInput,
  ): Promise<PlatformOrderChallengeResponse> {
    await this.requireCapability("orders.prepare", "prepare");
    const id = checkedMarketId(marketId);
    const ownerWallet = canonicalPublicKey(request.ownerWallet, "ownerWallet");
    const sessionPublicKey = canonicalPublicKey(
      request.sessionPublicKey,
      "sessionPublicKey",
    );
    if (ownerWallet === sessionPublicKey) {
      throw new TypeError("sessionPublicKey must be distinct from ownerWallet");
    }
    let body: Record<string, unknown>;
    if (request.action === "place") {
      if (request.side !== "buy" && request.side !== "sell") {
        throw new TypeError("side must be buy or sell");
      }
      if (request.orderType !== "good_until_cancelled" && request.orderType !== "post_only") {
        throw new TypeError("resting orderType must be good_until_cancelled or post_only");
      }
      const clientOrderId = checkedOpaqueInput(request.clientOrderId, "clientOrderId");
      body = {
        action: "place",
        owner_wallet: ownerWallet,
        session_public_key: sessionPublicKey,
        account_sequence: checkedAtomic(request.accountSequence, "accountSequence", true),
        client_order_id: clientOrderId,
        side: request.side,
        order_type: request.orderType,
        limit_price_atoms: checkedAtomic(request.limitPriceAtoms, "limitPriceAtoms", false),
        size_atoms: checkedAtomic(request.sizeAtoms, "sizeAtoms", false),
      };
    } else if (request.action === "cancel") {
      body = {
        action: "cancel",
        owner_wallet: ownerWallet,
        session_public_key: sessionPublicKey,
        order_id: checkedOrderId(request.orderId),
      };
    } else if (request.action === "cancel_all") {
      body = {
        action: "cancel_all",
        owner_wallet: ownerWallet,
        session_public_key: sessionPublicKey,
      };
    } else if (request.action === "replace") {
      body = {
        action: "replace",
        owner_wallet: ownerWallet,
        session_public_key: sessionPublicKey,
        order_id: checkedOrderId(request.orderId),
        ...orderPlaceWire(request),
      };
    } else if (request.action === "batch") {
      if (request.operations.length < 1 || request.operations.length > 6) {
        throw new TypeError("order batch must contain between one and six operations");
      }
      body = {
        action: "batch",
        owner_wallet: ownerWallet,
        session_public_key: sessionPublicKey,
        operations: request.operations.map((operation) => {
          if (operation.action === "place") {
            return { action: "place", ...orderPlaceWire(operation) };
          }
          if (operation.action === "cancel") {
            return { action: "cancel", order_id: checkedOrderId(operation.orderId) };
          }
          return {
            action: "replace",
            order_id: checkedOrderId(operation.orderId),
            ...orderPlaceWire(operation),
          };
        }),
      };
    } else {
      throw new TypeError("order action is invalid");
    }
    const response = platformOrderChallengeResponse(
      await this.post(`/v2/markets/${id}/orders/challenge`, body),
    );
    assertMarket(response.market_id, id);
    if (response.action !== request.action) {
      throw new StrataContractError("order challenge action does not match request");
    }
    return response;
  }

  private async orderPrepare(
    marketId: string,
    request: PlatformOrderPrepareInput,
  ): Promise<PlatformOrderPrepareResponse> {
    await this.requireCapability("orders.prepare", "prepare");
    const id = checkedMarketId(marketId);
    const challengeId = checkedHandle(request.challengeId, "challengeId", "oc_");
    const authorizationSignature = checkedBase58Signature(
      request.authorizationSignature,
      "authorizationSignature",
    );
    const response = platformOrderPrepareResponse(
      await this.post(`/v2/markets/${id}/orders/prepare`, {
        challenge_id: challengeId,
        authorization_signature: authorizationSignature,
      }),
    );
    assertMarket(response.market_id, id);
    return response;
  }

  private async orderSubmit(
    marketId: string,
    request: PlatformOrderSubmitInput,
  ): Promise<PlatformOrderSubmitResponse> {
    await this.requireCapability("orders.submit", "submit");
    const id = checkedMarketId(marketId);
    const orderControlId = checkedHandle(
      request.orderControlId,
      "orderControlId",
      "or_",
    );
    const signedTransactionBase64 = request.signedTransactionBase64.trim();
    decodeBase64(signedTransactionBase64);
    const response = platformOrderSubmitResponse(
      await this.post(`/v2/markets/${id}/orders/submit`, {
        order_control_id: orderControlId,
        signed_transaction_base64: signedTransactionBase64,
        idempotency_key: normalizeIdempotencyKey(request.idempotencyKey),
      }),
    );
    assertMarket(response.market_id, id);
    if (response.order_control_id !== orderControlId) {
      throw new StrataContractError("order receipt does not match submitted control ID");
    }
    return response;
  }

  private async orderStatus(
    marketId: string,
    request: PlatformOrderStatusInput,
  ): Promise<PlatformOrderStatusResponse> {
    await this.requireCapability("orders.submit", "submit");
    const id = checkedMarketId(marketId);
    const orderControlId = checkedHandle(
      request.orderControlId,
      "orderControlId",
      "or_",
    );
    const response = platformOrderStatusResponse(
      await this.post(`/v2/markets/${id}/orders/status`, {
        order_control_id: orderControlId,
        idempotency_key: normalizeIdempotencyKey(request.idempotencyKey),
      }),
    );
    assertMarket(response.market_id, id);
    if (response.order_control_id !== orderControlId) {
      throw new StrataContractError("order status does not match control ID");
    }
    return response;
  }

  private async executeOrder(
    marketId: string,
    request: PlatformOrderExecuteInput,
  ): Promise<PlatformOrderSubmitResponse> {
    if (typeof request.verifyTransaction !== "function") {
      throw new TypeError("verifyTransaction is required");
    }
    const signerPublicKey = canonicalPublicKey(request.signer.publicKey, "signer.publicKey");
    if (typeof request.signer.signMessage !== "function"
        || typeof request.signer.signTransaction !== "function") {
      throw new TypeError("signer must provide signMessage and signTransaction");
    }
    const challenge = await this.orderChallenge(marketId, {
      ...request.operation,
      sessionPublicKey: signerPublicKey,
    } as PlatformOrderChallengeInput);
    const authorization = await validateOrderAuthorization(
      challenge,
      request.operation,
      signerPublicKey,
    );
    const signature = await request.signer.signMessage(authorization);
    if (!(signature instanceof Uint8Array) || signature.length !== 64) {
      throw new StrataContractError("order authorization signature must contain 64 bytes");
    }
    const prepared = await this.orderPrepare(marketId, {
      challengeId: challenge.challenge_id,
      authorizationSignature: base58Encode(signature),
    });
    if (
      prepared.action !== challenge.action
      || prepared.order_ids.length !== challenge.order_ids.length
      || prepared.order_ids.some((orderId, index) => orderId !== challenge.order_ids[index])
      || prepared.expires_at_ms !== challenge.expires_at_ms
    ) {
      throw new StrataContractError("prepared order control changed the signed bindings");
    }
    await request.verifyTransaction({
      challenge,
      prepared,
      ownerWallet: canonicalPublicKey(request.operation.ownerWallet, "ownerWallet"),
      sessionPublicKey: signerPublicKey,
    });
    const signedTransactionBase64 = await request.signer.signTransaction(
      prepared.transaction_base64,
    );
    decodeBase64(signedTransactionBase64);
    return this.orderSubmit(marketId, {
      orderControlId: prepared.order_control_id,
      signedTransactionBase64,
      idempotencyKey: request.idempotencyKey ?? prepared.order_control_id,
    });
  }

  private async connectOrders(
    marketId: string,
    ownerWallet: string,
    signer: StrataSessionSigner,
    handlers: PlatformOrderCommandHandlers = {},
    options: PlatformOrderCommandOptions = {},
  ): Promise<PlatformOrderCommandConnection> {
    await Promise.all([
      this.requireCapability("orders.prepare", "prepare", "websocket"),
      this.requireCapability("orders.submit", "submit", "websocket"),
    ]);
    return connectPlatformOrderCommands(
      this.apiBase,
      checkedMarketId(marketId),
      ownerWallet,
      signer,
      handlers,
      options,
    );
  }

  private async accountMarketIds(requested?: readonly string[]): Promise<readonly string[]> {
    if (requested !== undefined) {
      if (requested.length === 0) throw new TypeError("marketIds must not be empty");
      return [...new Set(requested.map(checkedMarketId))];
    }
    const marketIds: string[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.listMarkets(
        cursor === undefined ? { limit: MAX_PAGE_SIZE } : { cursor, limit: MAX_PAGE_SIZE },
      );
      marketIds.push(...response.markets.map((market) => checkedMarketId(market.market_id)));
      cursor = response.page.next_cursor ?? undefined;
      if (response.page.has_more && cursor === undefined) {
        throw new StrataContractError("market discovery pagination is incomplete");
      }
    } while (cursor !== undefined);
    if (marketIds.length === 0) throw new StrataContractError("no live markets are discoverable");
    return [...new Set(marketIds)];
  }

  private async requireReadCapability(
    capabilityId: string,
    transport: "http" | "websocket" = "http",
  ): Promise<PlatformDiscoveryResponse> {
    const discovery = await this.readDiscovery(false);
    const capability = discovery.capabilities.find((item) => item.id === capabilityId);
    if (!capability || capability.risk !== "read" || !capability.transports.includes(transport)) {
      throw new StrataContractError(`live capability is not available: ${capabilityId}`);
    }
    return discovery;
  }

  private async requireCapability(
    capabilityId: string,
    risk: "prepare" | "submit",
    transport: "http" | "websocket" = "http",
  ): Promise<PlatformDiscoveryResponse> {
    const discovery = await this.readDiscovery(false);
    const capability = discovery.capabilities.find((item) => item.id === capabilityId);
    if (!capability || capability.risk !== risk || !capability.transports.includes(transport)) {
      throw new StrataContractError(`live capability is not available: ${capabilityId}`);
    }
    return discovery;
  }

  private async get(path: string, headers: Record<string, string> = {}): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${this.apiBase}${path}`, {
        method: "GET",
        headers: { Accept: "application/json", ...headers },
        signal: controller.signal,
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok) {
        const error = parsePublicError(body);
        throw new StrataApiError(
          response.status,
          error?.code ?? "request_failed",
          error?.message ?? "Strata could not complete the request.",
          error?.retryable ?? response.status >= 500,
        );
      }
      return body;
    } catch (error) {
      if (error instanceof StrataApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new StrataApiError(0, "timeout", "Strata request timed out.", true);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${this.apiBase}${path}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let value: unknown;
      try {
        value = await response.json();
      } catch {
        value = null;
      }
      if (!response.ok) {
        const error = parsePublicError(value);
        throw new StrataApiError(
          response.status,
          error?.code ?? "request_failed",
          error?.message ?? "Strata could not complete the request.",
          error?.retryable ?? response.status >= 500,
        );
      }
      return value;
    } catch (error) {
      if (error instanceof StrataApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new StrataApiError(0, "timeout", "Strata request timed out.", true);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function orderPlaceWire(operation: {
  readonly accountSequence: string | bigint;
  readonly clientOrderId: string;
  readonly side: string;
  readonly orderType: string;
  readonly limitPriceAtoms: string | bigint;
  readonly sizeAtoms: string | bigint;
}): Record<string, unknown> {
  if (operation.side !== "buy" && operation.side !== "sell") {
    throw new TypeError("side must be buy or sell");
  }
  if (operation.orderType !== "good_until_cancelled" && operation.orderType !== "post_only") {
    throw new TypeError("resting orderType must be good_until_cancelled or post_only");
  }
  return {
    account_sequence: checkedAtomic(operation.accountSequence, "accountSequence", true),
    client_order_id: checkedOpaqueInput(operation.clientOrderId, "clientOrderId"),
    side: operation.side,
    order_type: operation.orderType,
    limit_price_atoms: checkedAtomic(operation.limitPriceAtoms, "limitPriceAtoms", false),
    size_atoms: checkedAtomic(operation.sizeAtoms, "sizeAtoms", false),
  };
}

function checkedMarketId(value: string): string {
  const marketId = value.trim();
  if (!/^market_[0-9a-f]{32}$/.test(marketId)) {
    throw new TypeError("marketId must be an opaque Strata market ID");
  }
  return marketId;
}

function checkedAtomic(
  value: string | bigint,
  field: string,
  allowZero: boolean,
): string {
  const normalized = typeof value === "bigint" ? value.toString() : value.trim();
  if (!/^(?:0|[1-9][0-9]*)$/.test(normalized) || (!allowZero && normalized === "0")) {
    throw new TypeError(`${field} must be a canonical unsigned atomic value`);
  }
  return normalized;
}

function checkedOpaqueInput(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 64 || !/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new TypeError(`${field} must contain 1-64 URL-safe characters`);
  }
  return normalized;
}

function checkedOrderId(value: string): string {
  const orderId = value.trim();
  if (!/^order_[0-9a-f]{32}$/.test(orderId)) {
    throw new TypeError("orderId must be an opaque Strata order ID");
  }
  return orderId;
}

function checkedHandle(
  value: string,
  field: string,
  prefix: "oc_" | "or_",
): string {
  const handle = value.trim();
  if (!new RegExp(`^${prefix}[0-9a-f]{32}$`).test(handle)) {
    throw new TypeError(`${field} must be an opaque Strata handle`);
  }
  return handle;
}

function checkedBase58Signature(value: string, field: string): string {
  const signature = value.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) {
    throw new TypeError(`${field} must be a canonical base58 Ed25519 signature`);
  }
  return signature;
}

function assertMarket(actual: string, expected: string): void {
  if (actual !== expected) throw new StrataContractError("response market does not match request");
}

function depthQuery(request: PlatformBookRequest): string {
  if (request.depth === undefined) return "";
  if (!Number.isSafeInteger(request.depth) || request.depth < 1 || request.depth > 2_000) {
    throw new TypeError("depth must be an integer between 1 and 2000");
  }
  return `?depth=${request.depth}`;
}

function tradesQuery(request: PlatformTradesRequest): string {
  if (request.limit === undefined) return "";
  if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 500) {
    throw new TypeError("limit must be an integer between 1 and 500");
  }
  return `?limit=${request.limit}`;
}

function checkedFillLimit(value: number | undefined): number {
  if (value === undefined) return 100;
  if (!Number.isSafeInteger(value) || value < 1 || value > 200) {
    throw new TypeError("fillLimit must be an integer between 1 and 200");
  }
  return value;
}

function fillLimitQuery(value: number | undefined): string {
  if (value === undefined) return "";
  return `?fill_limit=${checkedFillLimit(value)}`;
}

function checkedAccountSigner(signer: PlatformAccountSigner): PlatformAccountSigner {
  if (!signer || typeof signer !== "object" || typeof signer.signMessage !== "function") {
    throw new TypeError("account signer must provide publicKey and signMessage");
  }
  const publicKey = signer.publicKey?.trim();
  if (!publicKey || publicKey.length < 32 || publicKey.length > 44 || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(publicKey)) {
    throw new TypeError("account signer publicKey must be a base58 wallet address");
  }
  if (publicKey === signer.publicKey) return signer;
  return { publicKey, signMessage: (message) => signer.signMessage(message) };
}

function pageQuery(request: PageRequest): string {
  const query = new URLSearchParams();
  if (request.limit !== undefined) {
    if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > MAX_PAGE_SIZE) {
      throw new TypeError(`limit must be an integer between 1 and ${MAX_PAGE_SIZE}`);
    }
    query.set("limit", String(request.limit));
  }
  if (request.cursor !== undefined) {
    const cursor = request.cursor.trim();
    if (cursor.length === 0 || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
      throw new TypeError("cursor must be a non-empty opaque URL-safe value");
    }
    query.set("cursor", cursor);
  }
  const value = query.toString();
  return value ? `?${value}` : "";
}

function parsePublicError(value: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} | undefined {
  if (!value || typeof value !== "object") return undefined;
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== "object") return undefined;
  const fields = error as Record<string, unknown>;
  if (
    typeof fields.code !== "string"
    || typeof fields.message !== "string"
    || typeof fields.retryable !== "boolean"
  ) {
    return undefined;
  }
  return {
    code: fields.code,
    message: fields.message,
    retryable: fields.retryable,
  };
}

export async function validateOrderAuthorization(
  challenge: PlatformOrderChallengeResponse,
  operation: PlatformOrderExecuteOperation,
  sessionPublicKey: string,
): Promise<Uint8Array> {
  const bytes = decodeBase64(challenge.authorization_payload_base64);
  const encoder = new TextEncoder();
  let cursor = 0;
  const domain = encoder.encode("strata-platform-order-control:v1\0");
  expectBytes(bytes, cursor, domain, "order authorization domain");
  cursor += domain.length;
  cursor += 32; // Canonical market identity; the public API intentionally exposes only its opaque ID.
  const ownerWallet = canonicalPublicKey(operation.ownerWallet, "ownerWallet");
  expectBytes(
    bytes,
    cursor,
    base58Decode(ownerWallet, 32, "ownerWallet"),
    "order authorization owner",
  );
  cursor += 32;
  expectBytes(
    bytes,
    cursor,
    base58Decode(sessionPublicKey, 32, "sessionPublicKey"),
    "order authorization session",
  );
  cursor += 32;
  const actionByte = readByte(bytes, cursor, "order authorization action");
  cursor += 1;
  const expectedAction = operation.action === "place" ? 0
    : operation.action === "cancel" ? 1
      : operation.action === "cancel_all" ? 2
        : operation.action === "replace" ? 3 : 4;
  if (actionByte !== expectedAction || challenge.action !== operation.action) {
    throw new StrataContractError("order authorization action changed");
  }
  const derivedOrderIds: string[] = [];
  if (operation.action === "place") {
    expectU64Value(bytes, cursor, operation.accountSequence, "order account sequence");
    cursor += 8;
    const clientLength = readU16(bytes, cursor, "client order ID length");
    cursor += 2;
    const clientId = encoder.encode(checkedOpaqueInput(operation.clientOrderId, "clientOrderId"));
    if (clientLength !== clientId.length) {
      throw new StrataContractError("client order ID length changed");
    }
    expectBytes(bytes, cursor, clientId, "client order ID");
    cursor += clientLength;
    const side = readByte(bytes, cursor, "order side");
    cursor += 1;
    if (side !== (operation.side === "buy" ? 0 : 1)) {
      throw new StrataContractError("order side changed");
    }
    const orderType = readByte(bytes, cursor, "order type");
    cursor += 1;
    if (orderType !== (operation.orderType === "good_until_cancelled" ? 0 : 3)) {
      throw new StrataContractError("order type changed");
    }
    expectU64Value(bytes, cursor, operation.limitPriceAtoms, "order limit price");
    cursor += 8;
    expectU64Value(bytes, cursor, operation.sizeAtoms, "order size");
    cursor += 8;
    const pda = take(bytes, cursor, 32, "order identity");
    cursor += 32;
    derivedOrderIds.push(await opaqueProductId(
      "order",
      `${challenge.market_id}:${base58Encode(pda)}`,
    ));
  } else if (operation.action === "cancel" || operation.action === "cancel_all") {
    const count = readByte(bytes, cursor, "cancel order count");
    cursor += 1;
    if (count < 1 || count > 6 || (operation.action === "cancel" && count !== 1)) {
      throw new StrataContractError("cancel order count changed");
    }
    for (let index = 0; index < count; index += 1) {
      const pda = take(bytes, cursor, 32, `cancel order ${index}`);
      cursor += 32;
      const rentSource = readByte(bytes, cursor, `cancel rent source ${index}`);
      cursor += 1;
      if (rentSource !== 0 && rentSource !== 1) {
        throw new StrataContractError("cancel rent source is invalid");
      }
      derivedOrderIds.push(await opaqueProductId(
        "order",
        `${challenge.market_id}:${base58Encode(pda)}`,
      ));
    }
    if (operation.action === "cancel" && derivedOrderIds[0] !== checkedOrderId(operation.orderId)) {
      throw new StrataContractError("cancel order identity changed");
    }
  } else if (operation.action === "replace") {
    let parsed = await validateCancelBinding(
      bytes,
      cursor,
      challenge.market_id,
      operation.orderId,
    );
    cursor = parsed.cursor;
    derivedOrderIds.push(parsed.orderId);
    parsed = await validatePlaceBinding(bytes, cursor, challenge.market_id, operation);
    cursor = parsed.cursor;
    derivedOrderIds.push(parsed.orderId);
  } else {
    const count = readByte(bytes, cursor, "batch count");
    cursor += 1;
    if (count < 1 || count > 6 || count !== operation.operations.length) {
      throw new StrataContractError("order batch count changed");
    }
    for (const item of operation.operations) {
      const tag = readByte(bytes, cursor, "batch action");
      cursor += 1;
      if (item.action === "place" && tag === 0) {
        const parsed = await validatePlaceBinding(bytes, cursor, challenge.market_id, item);
        cursor = parsed.cursor;
        derivedOrderIds.push(parsed.orderId);
      } else if (item.action === "cancel" && tag === 1) {
        const parsed = await validateCancelBinding(
          bytes,
          cursor,
          challenge.market_id,
          item.orderId,
        );
        cursor = parsed.cursor;
        derivedOrderIds.push(parsed.orderId);
      } else if (item.action === "replace" && tag === 3) {
        let parsed = await validateCancelBinding(
          bytes,
          cursor,
          challenge.market_id,
          item.orderId,
        );
        cursor = parsed.cursor;
        derivedOrderIds.push(parsed.orderId);
        parsed = await validatePlaceBinding(bytes, cursor, challenge.market_id, item);
        cursor = parsed.cursor;
        derivedOrderIds.push(parsed.orderId);
      } else {
        throw new StrataContractError("order batch action changed");
      }
    }
  }
  if (
    derivedOrderIds.length !== challenge.order_ids.length
    || derivedOrderIds.some((orderId, index) => orderId !== challenge.order_ids[index])
  ) {
    throw new StrataContractError("order authorization opaque identities changed");
  }
  cursor += 32; // Recent blockhash, verified again by the mandatory transaction verifier.
  cursor += 8; // Last valid block height.
  expectU64Value(bytes, cursor, String(challenge.expires_at_ms), "order authorization expiry");
  cursor += 8;
  const nonce = take(bytes, cursor, 16, "order authorization nonce");
  cursor += 16;
  if (hexBytes(nonce) !== challenge.challenge_id.slice(3)) {
    throw new StrataContractError("order challenge nonce changed");
  }
  cursor += 16; // Server process epoch.
  if (cursor !== bytes.length) {
    throw new StrataContractError("order authorization contains unrecognized fields");
  }
  return bytes;
}

async function validatePlaceBinding(
  bytes: Uint8Array,
  start: number,
  marketId: string,
  operation: {
    readonly accountSequence: string | bigint;
    readonly clientOrderId: string;
    readonly side: string;
    readonly orderType: string;
    readonly limitPriceAtoms: string | bigint;
    readonly sizeAtoms: string | bigint;
  },
): Promise<{ readonly cursor: number; readonly orderId: string }> {
  const encoder = new TextEncoder();
  let cursor = start;
  expectU64Value(bytes, cursor, operation.accountSequence, "order account sequence");
  cursor += 8;
  const clientLength = readU16(bytes, cursor, "client order ID length");
  cursor += 2;
  const clientId = encoder.encode(checkedOpaqueInput(operation.clientOrderId, "clientOrderId"));
  if (clientLength !== clientId.length) {
    throw new StrataContractError("client order ID length changed");
  }
  expectBytes(bytes, cursor, clientId, "client order ID");
  cursor += clientLength;
  const side = readByte(bytes, cursor, "order side");
  cursor += 1;
  if (side !== (operation.side === "buy" ? 0 : 1)) {
    throw new StrataContractError("order side changed");
  }
  const orderType = readByte(bytes, cursor, "order type");
  cursor += 1;
  if (orderType !== (operation.orderType === "good_until_cancelled" ? 0 : 3)) {
    throw new StrataContractError("order type changed");
  }
  expectU64Value(bytes, cursor, operation.limitPriceAtoms, "order limit price");
  cursor += 8;
  expectU64Value(bytes, cursor, operation.sizeAtoms, "order size");
  cursor += 8;
  const pda = take(bytes, cursor, 32, "order identity");
  cursor += 32;
  return {
    cursor,
    orderId: await opaqueProductId("order", `${marketId}:${base58Encode(pda)}`),
  };
}

async function validateCancelBinding(
  bytes: Uint8Array,
  start: number,
  marketId: string,
  expectedOrderId: string,
): Promise<{ readonly cursor: number; readonly orderId: string }> {
  let cursor = start;
  const pda = take(bytes, cursor, 32, "cancel order identity");
  cursor += 32;
  const rentSource = readByte(bytes, cursor, "cancel rent source");
  cursor += 1;
  if (rentSource !== 0 && rentSource !== 1) {
    throw new StrataContractError("cancel rent source is invalid");
  }
  const orderId = await opaqueProductId("order", `${marketId}:${base58Encode(pda)}`);
  if (orderId !== checkedOrderId(expectedOrderId)) {
    throw new StrataContractError("cancel order identity changed");
  }
  return { cursor, orderId };
}

function take(source: Uint8Array, offset: number, length: number, field: string): Uint8Array {
  const value = source.slice(offset, offset + length);
  if (value.length !== length) throw new StrataContractError(`${field} is missing`);
  return value;
}

function expectBytes(
  source: Uint8Array,
  offset: number,
  expected: Uint8Array,
  field: string,
): void {
  const actual = take(source, offset, expected.length, field);
  if (actual.some((byte, index) => byte !== expected[index])) {
    throw new StrataContractError(`${field} changed`);
  }
}

function readByte(source: Uint8Array, offset: number, field: string): number {
  const value = source[offset];
  if (value === undefined) throw new StrataContractError(`${field} is missing`);
  return value;
}

function readU16(source: Uint8Array, offset: number, field: string): number {
  take(source, offset, 2, field);
  return new DataView(source.buffer, source.byteOffset + offset, 2).getUint16(0, true);
}

function readU64Value(source: Uint8Array, offset: number, field: string): bigint {
  take(source, offset, 8, field);
  return new DataView(source.buffer, source.byteOffset + offset, 8).getBigUint64(0, true);
}

function expectU64Value(
  source: Uint8Array,
  offset: number,
  expected: string | bigint,
  field: string,
): void {
  if (readU64Value(source, offset, field) !== BigInt(expected)) {
    throw new StrataContractError(`${field} changed`);
  }
}

function hexBytes(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function opaqueProductId(kind: "order", value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new StrataContractError("Web Crypto is required to verify opaque order identity");
  }
  const prefix = new TextEncoder().encode(`strata-sdk-product:v1\0${kind}\0${value}`);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", prefix));
  return `${kind}_${hexBytes(digest.slice(0, 16))}`;
}
