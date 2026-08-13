import { StrataApiError, StrataContractError } from "./client.js";
import {
  platformAccountSnapshotResponse,
  platformAssetsResponse,
  platformBestBidAskResponse,
  platformBookSnapshotResponse,
  platformDiscoveryResponse,
  platformFeeScheduleResponse,
  platformMarketStatusResponse,
  platformMarketsResponse,
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
  PlatformTradesResponse,
} from "./platform.js";
import { DEFAULT_API_BASE } from "./types.js";

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
}

function checkedMarketId(value: string): string {
  const marketId = value.trim();
  if (!/^market_[0-9a-f]{32}$/.test(marketId)) {
    throw new TypeError("marketId must be an opaque Strata market ID");
  }
  return marketId;
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
