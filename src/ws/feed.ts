/**
 * MM feed WS client for `/ws/{server}/ws/mm/{mm_pubkey}`.
 *
 * Handles the `mm_hello` → sign challenge → `mm_auth_ok` handshake +
 * Fill event dispatch. Plain EventEmitter API — works in Node and the
 * browser. Browsers use the global `WebSocket`; Node uses the `ws`
 * package.
 *
 * Signing the challenge is delegated to the caller (so the SDK
 * doesn't take a hard dep on @solana/web3.js wallet adapters).
 */

import { EventEmitter } from "events";

export type SignChallenge = (challenge: Uint8Array) => Promise<Uint8Array> | Uint8Array;

export interface MmFeedClientOptions {
  /** Base WS URL of the matcher (e.g. `wss://strata.exchange`). */
  baseUrl: string;
  /** MM's pubkey as base58. */
  mmPubkey: string;
  /** Async signer for the 32-byte challenge from `mm_hello`. */
  sign: SignChallenge;
  /** Reconnect backoff in ms; defaults to 2000 with jitter. */
  reconnectDelayMs?: number;
  /** Optional WebSocket constructor — pass `import("ws").WebSocket` for Node. */
  WebSocketCtor?: typeof WebSocket;
}

export class MmFeedClient extends EventEmitter {
  private url: string;
  private sign: SignChallenge;
  private reconnectMs: number;
  private WebSocketCtor: typeof WebSocket;
  private ws?: WebSocket;
  private closed = false;

  constructor(opts: MmFeedClientOptions) {
    super();
    this.url = `${opts.baseUrl.replace(/\/$/, "")}/ws/mm/${opts.mmPubkey}`;
    this.sign = opts.sign;
    this.reconnectMs = opts.reconnectDelayMs ?? 2000;
    this.WebSocketCtor = opts.WebSocketCtor ?? WebSocket;
  }

  /** Open the connection. Returns immediately; events fire via the emitter. */
  start(): void {
    this.closed = false;
    this.connect();
  }

  /** Close the connection. No automatic reconnect after this. */
  stop(): void {
    this.closed = true;
    this.ws?.close();
  }

  /**
   * Events emitted:
   *   - `"connected"`: `() => void`
   *   - `"authed"`: `() => void`
   *   - `"fill"`: `(msg: Fill) => void` — Fill targeting this MM
   *   - `"disconnected"`: `(reason: string) => void`
   *   - `"error"`: `(err: Error) => void`
   */
  private connect(): void {
    const ws = new this.WebSocketCtor(this.url);
    this.ws = ws;
    let authed = false;

    ws.onopen = () => {
      this.emit("connected");
    };

    ws.onmessage = (ev: MessageEvent) => {
      let payload: { kind: string; [k: string]: unknown };
      try {
        payload = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
      } catch (e) {
        this.emit("error", new Error(`bad JSON: ${(e as Error).message}`));
        return;
      }

      if (!authed) {
        if (payload.kind === "mm_hello" && typeof payload.challenge === "string") {
          this.handleHello(ws, payload.challenge).catch((e) =>
            this.emit("error", e as Error),
          );
        } else if (payload.kind === "mm_auth_ok") {
          authed = true;
          this.emit("authed");
        }
        return;
      }

      if (payload.kind === "Fill") {
        this.emit("fill", payload);
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

  private async handleHello(ws: WebSocket, challengeHex: string): Promise<void> {
    const challenge = Buffer.from(challengeHex, "hex");
    if (challenge.length !== 32) {
      throw new Error(`bad challenge length: ${challenge.length}`);
    }
    const sig = await this.sign(challenge);
    const reply = {
      kind: "mm_auth",
      signature: Buffer.from(sig).toString("hex"),
    };
    ws.send(JSON.stringify(reply));
  }

  private jitteredDelay(): number {
    return this.reconnectMs + Math.floor(Math.random() * 1000);
  }
}
