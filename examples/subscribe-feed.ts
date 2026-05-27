/**
 * Example: subscribe to the public order-book WS feed and log every
 * Fill / BookSnapshot / AvlDensity event.
 *
 * Node.js usage requires the `ws` package — passed in via the
 * `WebSocketCtor` option.
 *
 * Run with: pnpm ts-node examples/subscribe-feed.ts
 */

import { BookFeedClient } from "../src/index.js";
import WebSocket from "ws";

async function main() {
  const baseUrl =
    process.env.STRATA_API_BASE?.replace(/^http/, "ws") ??
    "wss://strata.exchange";

  const client = new BookFeedClient({
    baseUrl,
    WebSocketCtor: WebSocket as unknown as typeof globalThis.WebSocket,
  });

  client.on("connected", () => console.log("connected"));
  client.on("disconnected", (r) => console.log("disconnected:", r));
  client.on("error", (e) => console.error("err:", e.message));
  client.on("message", (msg) => {
    if (msg.kind === "Fill") {
      console.log(`FILL ${msg.fill_size} @ ${msg.price}`);
    } else if (msg.kind === "AvlDensity") {
      console.log(
        `AVL density: mid=${msg.mid_atomic} bids=${msg.bids.length} asks=${msg.asks.length} (age ${msg.age_ms}ms)`,
      );
    } else if (msg.kind === "Hello") {
      console.log("hello:", msg.version);
    }
  });

  client.start();

  // Keep alive.
  await new Promise(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
