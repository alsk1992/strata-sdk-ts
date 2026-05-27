/**
 * REST API client for the matcher's HTTP endpoints.
 *
 * Endpoints mirror `strata-server`'s routes — keep in sync with the
 * Rust backend. Methods return parsed JSON; raise on non-2xx.
 */

import type { OrderBookLevel } from "./types.js";

export interface FillRow {
  /** Append-only id from the matcher's fill journal. */
  tid: number;
  /** Owner pubkey (base58). */
  owner: string;
  /** 0 = Buy fill (we bought), 1 = Sell fill (we sold). */
  side: number;
  /** Atomic price in Strata encoding (quote atoms per whole base). */
  price: number;
  /** Atomic fill size in base atoms. */
  fillSize: number;
  /** Settlement slot. */
  slot: number;
  /** Confirmed settle signature. */
  settleSig?: string;
  /** "matched" / "settled" / "failed" — FSM state at the time of read. */
  status: string;
  /** Match id that produced this fill (correlates Buy + Sell legs). */
  matchId?: number;
  /** Wall-clock when the matcher recorded it. */
  observedAtMs: number;
}

export interface BookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface HealthInfo {
  ok: boolean;
  uptimeSecs: number;
  version: string;
}

export class StrataRestClient {
  constructor(
    public readonly baseUrl: string,
    /** Optional custom fetch (defaults to global). Useful for Node ≤18
     *  or for injecting auth headers / retries. */
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /** `GET /health` — matcher liveness probe. */
  async health(): Promise<HealthInfo> {
    return this.get<HealthInfo>("/health");
  }

  /** `GET /book/snapshot/{market}` — current L1 + L2 + L3 book. */
  async bookSnapshot(market: string): Promise<BookSnapshot> {
    return this.get<BookSnapshot>(`/book/snapshot/${market}`);
  }

  /** `GET /user/{pubkey}/fills` — full fill history with PnL-ready
   *  fields (status FSM, settle sig, match correlation). */
  async userFills(pubkey: string, limit?: number): Promise<FillRow[]> {
    const q = limit ? `?limit=${limit}` : "";
    return this.get<FillRow[]>(`/user/${pubkey}/fills${q}`);
  }

  /** `GET /user/{pubkey}/positions` — current open intent + L1 orders
   *  the matcher sees for this user. */
  async userPositions(pubkey: string): Promise<unknown> {
    return this.get<unknown>(`/user/${pubkey}/positions`);
  }

  /** `GET /market/{market}` — full market account decoded server-side. */
  async market(market: string): Promise<unknown> {
    return this.get<unknown>(`/market/${market}`);
  }

  /** Raw GET helper. Public so consumers can hit endpoints we haven't
   *  typed yet. */
  async get<T>(path: string): Promise<T> {
    const url = this.baseUrl.replace(/\/$/, "") + path;
    const resp = await this.fetcher(url, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) {
      throw new Error(`GET ${path}: HTTP ${resp.status} ${resp.statusText}`);
    }
    return (await resp.json()) as T;
  }
}
