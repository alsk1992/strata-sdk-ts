import {
  DEFAULT_API_BASE,
  type CapabilityCatalog,
  type MarketsResponse,
  type QuoteRequest,
  type QuoteResponse,
  type StrataClientOptions,
} from "./types.js";
import {
  atomic,
  capabilityCatalog,
  errorResponse,
  marketsResponse,
  quoteResponse,
} from "./validation.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export class StrataApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;

  constructor(status: number, code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "StrataApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export class StrataContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrataContractError";
  }
}

export class StrataClient {
  readonly apiBase: string;
  readonly timeoutMs: number;
  readonly fetch: typeof globalThis.fetch;

  constructor(options: StrataClientOptions = {}) {
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
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new TypeError("a Fetch-compatible implementation is required");
    }
    this.fetch = fetchImpl;
  }

  async capabilities(): Promise<CapabilityCatalog> {
    return capabilityCatalog(await this.get("/sonar/capabilities"));
  }

  async markets(): Promise<MarketsResponse> {
    return marketsResponse(await this.get("/sonar/markets"));
  }

  async quote(request: QuoteRequest): Promise<QuoteResponse> {
    const amount = normalizeAtoms(request.amountInAtoms);
    if (BigInt(amount) === 0n) throw new TypeError("amountInAtoms must be greater than zero");
    const slippage = request.slippageBps ?? 50;
    if (!Number.isSafeInteger(slippage) || slippage < 0 || slippage > 1_000) {
      throw new TypeError("slippageBps must be an integer between 0 and 1,000");
    }
    if (request.side !== "buy" && request.side !== "sell") {
      throw new TypeError("side must be buy or sell");
    }

    const catalog = await this.markets();
    const requestedMarket = request.market.trim();
    const market = catalog.markets.find(
      (item) =>
        item.label.toLowerCase() === requestedMarket.toLowerCase()
        || item.market_pda === requestedMarket,
    );
    if (!market?.market_pda) {
      throw new StrataContractError(`market is not available: ${request.market}`);
    }
    if (!market.ready) {
      throw new StrataContractError(`Sonar quotes are not available for: ${request.market}`);
    }
    if (!market.quote_path || !validOperationPath(market.quote_path)) {
      throw new StrataContractError(`Sonar quotes are not available for: ${request.market}`);
    }
    const quote = quoteResponse(await this.post(market.quote_path, {
      market_id: market.market_pda,
      side: request.side,
      amount_in_atoms: amount,
      slippage_bps: slippage,
    }));
    if (
      quote.market_id !== market.market_pda
      || quote.side !== request.side
      || quote.amount_in_atoms !== amount
    ) {
      throw new StrataContractError("quote binding does not match the request");
    }
    return quote;
  }

  private async get(path: string): Promise<unknown> {
    return this.request(path);
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    return this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      const response = await this.fetch(`${this.apiBase}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok) {
        const publicError = errorResponse(body);
        throw new StrataApiError(
          response.status,
          publicError?.error.code ?? "request_failed",
          publicError?.error.message ?? "Strata could not complete the request.",
          publicError?.error.retryable ?? response.status >= 500,
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

function validOperationPath(path: string): boolean {
  return /^\/sonar\/markets\/[a-z0-9]+(?:-[a-z0-9]+)*\/quote$/.test(path);
}

function normalizeAtoms(value: string | bigint): string {
  const normalized = typeof value === "bigint" ? value.toString() : value;
  return atomic(normalized, "amountInAtoms");
}
