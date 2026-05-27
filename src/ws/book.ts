/**
 * Public order-book WS client. No auth — anyone can subscribe to
 * `/ws/feed` for the global market events stream (BookSnapshot,
 * Fill, BookRemove, AVL depth/density frames, IntentSnapshot).
 *
 * Identical reconnect-with-jitter pattern as MmFeedClient.
 */

import { EventEmitter } from "events";
import type { FeedMessage } from "../types.js";

export interface BookFeedClientOptions {
  baseUrl: string;
  /** Reconnect backoff in ms; default 2000 with jitter up to +1s. */
  reconnectDelayMs?: number;
  WebSocketCtor?: typeof WebSocket;
  /** Optional path override; default `/ws/feed`. */
  path?: string;
}

export class BookFeedClient extends EventEmitter {
  private url: string;
  private reconnectMs: number;
  private WebSocketCtor: typeof WebSocket;
  private ws?: WebSocket;
  private closed = false;

  constructor(opts: BookFeedClientOptions) {
    super();
    const base = opts.baseUrl.replace(/\/$/, "");
    const path = opts.path ?? "/ws/feed";
    this.url = base + path;
    this.reconnectMs = opts.reconnectDelayMs ?? 2000;
    this.WebSocketCtor = opts.WebSocketCtor ?? WebSocket;
  }

  start(): void {
    this.closed = false;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    this.ws?.close();
  }

  /**
   * Events emitted:
   *   - `"connected"`: `() => void`
   *   - `"message"`: `(msg: FeedMessage) => void`
   *   - `"disconnected"`: `(reason: string) => void`
   *   - `"error"`: `(err: Error) => void`
   */
  private connect(): void {
    const ws = new this.WebSocketCtor(this.url);
    this.ws = ws;

    ws.onopen = () => this.emit("connected");

    ws.onmessage = (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(
          typeof ev.data === "string" ? ev.data : ev.data.toString(),
        ) as FeedMessage;
        this.emit("message", payload);
      } catch (e) {
        this.emit("error", new Error(`bad JSON: ${(e as Error).message}`));
      }
    };

    ws.onclose = () => {
      this.emit("disconnected", "closed");
      if (!this.closed) {
        setTimeout(() => this.connect(), this.jitteredDelay());
      }
    };

    ws.onerror = (ev: Event) => {
      this.emit("error", new Error(`ws error: ${(ev as unknown as { message?: string }).message ?? "unknown"}`));
    };
  }

  private jitteredDelay(): number {
    return this.reconnectMs + Math.floor(Math.random() * 1000);
  }
}
