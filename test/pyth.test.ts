import { describe, it, expect } from "vitest";
import { HermesClient, type PythPriceSnapshot } from "../src/pyth.js";

describe("HermesClient.toStrataPrice", () => {
  function snap(price: bigint, expo: number): PythPriceSnapshot {
    return {
      feedIdHex: "deadbeef",
      price,
      conf: 0n,
      expo,
      publishTime: 0,
      observedAtMs: 0,
    };
  }

  it("scales SOL/USDC: $150.27 @ expo=-8 with 6 quote decimals", () => {
    // 150.27 * 10^8 = 15027000000 raw price
    // toStrataPrice = price * 10^(expo + quote_dec) = price * 10^(-2)
    //                = 15027000000 / 100 = 150_270_000
    const s = snap(15_027_000_000n, -8);
    const out = HermesClient.toStrataPrice(s, 6);
    expect(out).toBe(150_270_000n);
  });

  it("returns 0 on non-positive price", () => {
    const s = snap(0n, -8);
    expect(HermesClient.toStrataPrice(s, 6)).toBe(0n);
  });

  it("handles positive net exponent (small quote decimals)", () => {
    // price=150, expo=2 → 150 * 100 = 15_000 per whole base
    const s = snap(150n, 2);
    const out = HermesClient.toStrataPrice(s, 0);
    expect(out).toBe(15_000n);
  });
});
