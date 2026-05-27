/**
 * Pyth Hermes HTTP client — thin wrapper for the common "fetch the
 * latest price for one feed" case. Avoids depending on
 * `@pythnetwork/client` which pulls in Anchor and a lot of unrelated
 * Solana code.
 *
 * For the on-chain `PriceUpdateV2` account, consumers should:
 *   1. `Connection.getAccountInfo(pythPriceUpdatePda)` for the raw bytes
 *   2. Parse offset 8 (skip discriminator) → write_authority (32) →
 *      verification_level (1, possibly 2) → PriceFeedMessage (84) →
 *      posted_slot (8). Mirrors Rust `price.rs::parse_price_update_v2`.
 *
 * The on-chain reader is intentionally NOT inlined here — most TS
 * consumers want the off-chain HTTP price, and the on-chain parser
 * needs delicate byte-walking that adds maintenance burden.
 */

export const HERMES_BASE_URL = "https://hermes.pyth.network";

export interface PythPriceSnapshot {
  /** 32-byte feed_id as hex (lowercase). */
  feedIdHex: string;
  /** Raw integer price; multiply by `10^expo` for the human value. */
  price: bigint;
  /** Confidence interval (same unit as price). */
  conf: bigint;
  /** Decimal exponent (typically -8 for SOL/USD). */
  expo: number;
  /** Pyth publish time (Unix seconds). */
  publishTime: number;
  /** Local clock at fetch. */
  observedAtMs: number;
}

export class HermesClient {
  constructor(
    public readonly baseUrl: string = HERMES_BASE_URL,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /**
   * `GET /v2/updates/price/latest?ids[]=<feedId>` — one snapshot per
   * feed. Multiple feeds in one call is supported by passing > 1 hex id.
   */
  async fetchLatest(feedIdsHex: string[]): Promise<PythPriceSnapshot[]> {
    if (feedIdsHex.length === 0) return [];
    const url = new URL(
      "/v2/updates/price/latest",
      this.baseUrl.replace(/\/$/, "") + "/",
    );
    for (const id of feedIdsHex) {
      url.searchParams.append("ids[]", id.toLowerCase());
    }
    const resp = await this.fetcher(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) {
      throw new Error(`Hermes ${resp.status}: ${await resp.text()}`);
    }
    const body = (await resp.json()) as {
      parsed?: Array<{
        id: string;
        price: {
          price: string;
          conf: string;
          expo: number;
          publish_time: number;
        };
      }>;
    };
    const observedAtMs = Date.now();
    return (body.parsed ?? []).map((p) => ({
      feedIdHex: p.id.toLowerCase(),
      price: BigInt(p.price.price),
      conf: BigInt(p.price.conf),
      expo: p.price.expo,
      publishTime: p.price.publish_time,
      observedAtMs,
    }));
  }

  /** Convert a snapshot into "quote atoms per whole base" — same
   *  Strata encoding the on-chain matcher uses. */
  static toStrataPrice(
    snap: PythPriceSnapshot,
    quoteDecimals: number,
  ): bigint {
    const scaleExpo = snap.expo + quoteDecimals;
    if (snap.price <= 0n) return 0n;
    if (scaleExpo >= 0) {
      return snap.price * 10n ** BigInt(scaleExpo);
    }
    return snap.price / 10n ** BigInt(-scaleExpo);
  }
}
