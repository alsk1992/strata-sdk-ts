import { describe, it, expect, vi } from "vitest";
import { MmFeedClient } from "../src/ws/feed.js";
import { BookFeedClient } from "../src/ws/book.js";

/**
 * Mock WebSocket impl. Tracks open/close + the messages sent by the
 * client; exposes `pushFromServer(msg)` for the test to drive the
 * server-side frames.
 */
class MockWebSocket {
  // Static so the spec can grab the most recently constructed one.
  static last?: MockWebSocket;
  url: string;
  readyState = 0; // CONNECTING
  onopen?: () => void;
  onmessage?: (ev: { data: string }) => void;
  onclose?: () => void;
  onerror?: (e: Event) => void;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.last = this;
    // Defer to next tick so caller can attach handlers
    setTimeout(() => {
      this.readyState = 1; // OPEN
      this.onopen?.();
    }, 0);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  pushFromServer(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

describe("MmFeedClient", () => {
  it("completes the handshake: receives mm_hello, sends mm_auth, gets auth_ok", async () => {
    const signFn = vi.fn(async (_challenge: Uint8Array) => {
      const sig = new Uint8Array(64);
      sig.fill(0xab);
      return sig;
    });
    const client = new MmFeedClient({
      baseUrl: "ws://test",
      mmPubkey: "MM_PK",
      sign: signFn,
      WebSocketCtor: MockWebSocket as unknown as typeof WebSocket,
    });

    const onAuthed = vi.fn();
    client.on("authed", onAuthed);
    client.start();

    // Wait one tick for the open callback + handlers wired.
    await new Promise((r) => setTimeout(r, 5));
    const ws = MockWebSocket.last!;

    // Server pushes mm_hello with a 32-byte challenge (hex).
    const challenge = Buffer.alloc(32);
    challenge.fill(0xcc);
    ws.pushFromServer({ kind: "mm_hello", challenge: challenge.toString("hex") });

    // Wait for the async sign to resolve.
    await new Promise((r) => setTimeout(r, 5));

    expect(signFn).toHaveBeenCalledOnce();
    expect(ws.sent.length).toBe(1);
    const reply = JSON.parse(ws.sent[0]!);
    expect(reply.kind).toBe("mm_auth");
    expect(typeof reply.signature).toBe("string");

    // Server completes with mm_auth_ok.
    ws.pushFromServer({ kind: "mm_auth_ok" });
    expect(onAuthed).toHaveBeenCalledOnce();

    client.stop();
  });

  it("emits fill events after auth", async () => {
    const client = new MmFeedClient({
      baseUrl: "ws://test",
      mmPubkey: "MM_PK",
      sign: async () => new Uint8Array(64),
      WebSocketCtor: MockWebSocket as unknown as typeof WebSocket,
    });

    const onFill = vi.fn();
    client.on("fill", onFill);
    client.start();
    await new Promise((r) => setTimeout(r, 5));
    const ws = MockWebSocket.last!;
    const challenge = Buffer.alloc(32);
    ws.pushFromServer({ kind: "mm_hello", challenge: challenge.toString("hex") });
    await new Promise((r) => setTimeout(r, 5));
    ws.pushFromServer({ kind: "mm_auth_ok" });

    // Now push a Fill.
    ws.pushFromServer({
      kind: "Fill",
      market: "MKT",
      taker_pda: "TKR",
      price: 150_000_000,
      fill_size: 50_000_000,
      side: 0,
    });
    expect(onFill).toHaveBeenCalledOnce();
    expect(onFill.mock.calls[0]![0].price).toBe(150_000_000);

    client.stop();
  });
});

describe("BookFeedClient", () => {
  it("dispatches BookSnapshot + Fill messages", async () => {
    const client = new BookFeedClient({
      baseUrl: "ws://test",
      WebSocketCtor: MockWebSocket as unknown as typeof WebSocket,
    });

    const onMsg = vi.fn();
    client.on("message", onMsg);
    client.start();
    await new Promise((r) => setTimeout(r, 5));
    const ws = MockWebSocket.last!;

    ws.pushFromServer({ kind: "Hello", version: "0.1.0" });
    ws.pushFromServer({
      kind: "BookSnapshot",
      bids: [[100, 5]],
      asks: [[101, 7]],
    });
    ws.pushFromServer({
      kind: "Fill",
      maker_pda: "M",
      taker_pda: "T",
      price: 100,
      fill_size: 1,
    });

    expect(onMsg).toHaveBeenCalledTimes(3);
    expect(onMsg.mock.calls[1]![0].kind).toBe("BookSnapshot");
    expect(onMsg.mock.calls[2]![0].kind).toBe("Fill");

    client.stop();
  });

  it("emits error on bad JSON", async () => {
    const client = new BookFeedClient({
      baseUrl: "ws://test",
      WebSocketCtor: MockWebSocket as unknown as typeof WebSocket,
    });
    const onError = vi.fn();
    client.on("error", onError);
    client.start();
    await new Promise((r) => setTimeout(r, 5));
    const ws = MockWebSocket.last!;
    ws.onmessage?.({ data: "not json {" });
    expect(onError).toHaveBeenCalledOnce();
    client.stop();
  });
});
