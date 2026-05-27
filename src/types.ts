/**
 * Wire types for Strata's WebSocket feeds + REST responses.
 *
 * Mirrors `crates/strata-server/src/lib.rs::FeedMessage`. Keep these in
 * sync with the server — JSON shapes there are the source of truth.
 */

export type FeedMessage =
  | { kind: "Hello"; version: string }
  | {
      kind: "BookSnapshot";
      bids: [number, number][];
      asks: [number, number][];
    }
  | {
      kind: "Fill";
      maker_pda: string;
      maker_owner?: string;
      taker_pda: string;
      price: number;
      fill_size: number;
    }
  | { kind: "BookRemove"; pda: string; cause: number }
  | {
      kind: "AvlDepth";
      bids: [number, number][];
      asks: [number, number][];
      age_ms: number;
    }
  | {
      kind: "AvlDensity";
      mid_atomic: number;
      bids: AvlDensityLevel[];
      asks: AvlDensityLevel[];
      age_ms: number;
      seq?: number;
      mid_source?: string;
      mid_conf_bps?: number;
      mid_disagreement_bps?: number;
    }
  | {
      kind: "AvlDensityDiff";
      mid_atomic: number;
      adds: AvlDensityLevel[];
      removes: number[];
      updates: AvlDensityLevel[];
      age_ms: number;
      seq: number;
      prev_seq: number;
      mid_source?: string;
      mid_conf_bps?: number;
      mid_disagreement_bps?: number;
    }
  | {
      kind: "IntentSnapshot";
      bids: [number, number][];
      asks: [number, number][];
    }
  | { kind: "Ping" };

/** Per-source depth breakdown for one AVL level. Field names mirror the
 *  on-chain AmmSource enum; renaming requires a backend change. */
export interface AvlDensityBreakdown {
  raydium_v4: number;
  raydium_clmm: number;
  raydium_cpmm: number;
  whirlpool: number;
  dlmm: number;
  damm_v2: number;
  phoenix: number;
  saber: number;
  stabble: number;
  humidifi: number;
  solfi_v2: number;
  bisonfi: number;
  tesserav: number;
}

export interface AvlDensityLevel {
  price: number;
  depth: AvlDensityBreakdown;
}

export function depthTotal(d: AvlDensityBreakdown): number {
  return (
    d.raydium_v4 +
    d.raydium_clmm +
    d.raydium_cpmm +
    d.whirlpool +
    d.dlmm +
    d.damm_v2 +
    d.phoenix +
    d.saber +
    d.stabble +
    d.humidifi +
    d.solfi_v2 +
    d.bisonfi +
    d.tesserav
  );
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

/** Per-MM feed frame from `/ws/mm/{pubkey}`. Server signs each MM with
 *  a challenge in `mm_hello` → consumer signs and replies with `mm_auth`. */
export type MmFeedMessage =
  | { kind: "mm_hello"; challenge: string }
  | { kind: "mm_auth"; signature: string }
  | { kind: "mm_auth_ok" }
  | {
      kind: "Fill";
      market: string;
      taker_pda: string;
      price: number;
      fill_size: number;
      side: number;
      match_id?: number;
    }
  | { kind: "Ping" };
