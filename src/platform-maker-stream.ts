import { StrataContractError } from "./client.js";
import { platformMakerEvent } from "./platform-validation.js";
import type {
  PlatformAccountSigner,
  PlatformEntityId,
  PlatformMakerFill,
  PlatformMakerStatusResponse,
  PlatformMakerView,
} from "./platform.js";

const MIN_RECONNECT_MS = 250;
const MAX_RECONNECT_MS = 5_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;

export interface PlatformMakerHandlers {
  /** Full owner view after every sequenced event (snapshot, fill, status change). */
  readonly onMaker?: (view: PlatformMakerView) => void;
  readonly onFill?: (marketId: PlatformEntityId, fill: PlatformMakerFill) => void;
  /** The owner's products/exposure changed (a Strand, Current, order, or guard). */
  readonly onStatus?: (marketId: PlatformEntityId, status: PlatformMakerStatusResponse) => void;
  readonly onError?: (error: Error, marketId?: PlatformEntityId) => void;
}

export interface PlatformMakerSubscriptionOptions {
  readonly signal?: AbortSignal;
  readonly webSocketFactory?: (url: string) => WebSocket;
  readonly reconnect?: boolean;
}

export interface PlatformMakerSubscription {
  readonly ready: Promise<void>;
  close(): void;
}

interface MutableMaker {
  marketId: string;
  walletAddress: string;
  streamId: string;
  sequence: string;
  status: PlatformMakerStatusResponse;
  fills: Map<string, PlatformMakerFill>;
}

/** The maker to stream: a wallet address (public), or a signer whose public key names it. */
export type PlatformMakerIdentity = string | PlatformAccountSigner;

/**
 * Open the maker stream for one market — a maker's own products, exposure,
 * health, and fills, public by wallet address like every other read. Pass the
 * wallet address; a signer is accepted too (its public key names the maker and
 * the server's challenge is answered with a signature, which older servers
 * required). The SDK fails closed on any identity or sequence mismatch and
 * recovers from a fresh snapshot.
 */
export function subscribePlatformMaker(
  apiBase: string,
  marketId: string,
  maker: PlatformMakerIdentity,
  handlers: PlatformMakerHandlers,
  options: PlatformMakerSubscriptionOptions = {},
): PlatformMakerSubscription {
  const identity = makerIdentity(maker);
  return subscribeMarket(apiBase, accountMarketId(marketId), identity, handlers, options);
}

interface ResolvedMakerIdentity {
  readonly publicKey: string;
  readonly signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

function makerIdentity(maker: PlatformMakerIdentity): ResolvedMakerIdentity {
  if (typeof maker === "string") {
    return { publicKey: accountWalletAddress(maker) };
  }
  if (!maker || typeof maker !== "object" || typeof maker.publicKey !== "string") {
    throw new TypeError("maker must be a wallet address or a signer with publicKey");
  }
  return {
    publicKey: accountWalletAddress(maker.publicKey),
    ...(typeof maker.signMessage === "function"
      ? { signMessage: (message: Uint8Array) => maker.signMessage(message) }
      : {}),
  };
}

function subscribeMarket(
  apiBase: string,
  marketId: string,
  signer: ResolvedMakerIdentity,
  handlers: PlatformMakerHandlers,
  options: PlatformMakerSubscriptionOptions,
): PlatformMakerSubscription {
  const factory = options.webSocketFactory ?? defaultWebSocketFactory;
  const reconnect = options.reconnect ?? true;
  let socket: WebSocket | undefined;
  let closed = false;
  let reconnectDelay = MIN_RECONNECT_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let maker: MutableMaker | undefined;
  let receivedSnapshot = false;
  let readySettled = false;
  let terminalError: Error | undefined;
  let resolveReady: () => void;
  let rejectReady: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const failReady = (error: Error) => {
    if (readySettled) return;
    readySettled = true;
    rejectReady!(error);
  };

  const report = (error: unknown) => {
    handlers.onError?.(
      error instanceof Error ? error : new Error("Strata maker stream failed"),
      marketId,
    );
  };

  const armWatchdog = () => {
    if (watchdog !== undefined) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      report(new Error("Strata maker stream heartbeat timed out"));
      socket?.close(4000, "heartbeat timeout");
    }, HEARTBEAT_TIMEOUT_MS);
  };

  const emitMaker = (serverTimeMs: number, recovered: boolean) => {
    if (!maker) return;
    handlers.onMaker?.({
      market_id: maker.marketId,
      wallet_address: maker.walletAddress,
      stream_id: maker.streamId,
      sequence: maker.sequence,
      server_time_ms: serverTimeMs,
      status: maker.status,
      fills: [...maker.fills.values()].sort(
        (left, right) => right.executed_at_ms - left.executed_at_ms,
      ),
      recovered,
    });
  };

  const recover = (reason: string) => {
    report(new StrataContractError(reason));
    maker = undefined;
    socket?.close(4001, "sequence recovery");
  };

  const authenticate = async (challenge: string) => {
    const active = socket;
    try {
      if (!active) throw new Error("maker stream closed before authorization");
      if (!signer.signMessage) {
        // Public read: open without a signature.
        active.send(JSON.stringify({ type: "open" }));
        return;
      }
      const signature = await signer.signMessage(makerStreamAuthMessage(
        marketId,
        signer.publicKey,
        challenge,
      ));
      if (!(signature instanceof Uint8Array) || signature.length !== 64) {
        throw new Error("maker signer must return a 64-byte Ed25519 signature");
      }
      if (closed || socket !== active) return;
      active.send(JSON.stringify({ type: "authenticate", signature: bytesToHex(signature) }));
    } catch (error) {
      terminalError = error instanceof Error ? error : new Error("maker authorization failed");
      report(terminalError);
      active?.close(4003, "maker authorization failed");
    }
  };

  const apply = (raw: unknown) => {
    const event = platformMakerEvent(raw);
    if (event.market_id !== marketId || event.wallet_address !== signer.publicKey) {
      recover("maker stream returned different request bindings");
      return;
    }
    if (event.type === "auth_challenge") {
      if (maker) {
        recover("maker stream challenged after state delivery");
        return;
      }
      void authenticate(event.challenge);
      return;
    }
    if (event.type === "maker_snapshot") {
      if (maker && event.stream_id !== maker.streamId) {
        recover("maker stream reset without a new signed challenge");
        return;
      }
      if (maker && BigInt(event.sequence) <= BigInt(maker.sequence)) {
        recover("maker recovery snapshot did not advance its sequence");
        return;
      }
      const recovered = receivedSnapshot;
      maker = {
        marketId: event.market_id,
        walletAddress: event.wallet_address,
        streamId: event.stream_id,
        sequence: event.sequence,
        status: event.status,
        fills: new Map(event.fills.map((fill) => [fill.fill_id, fill])),
      };
      receivedSnapshot = true;
      reconnectDelay = MIN_RECONNECT_MS;
      emitMaker(event.server_time_ms, recovered);
      if (!readySettled) {
        readySettled = true;
        resolveReady!();
      }
      return;
    }
    if (!maker || event.stream_id !== maker.streamId) {
      recover("maker event arrived without its signed snapshot");
      return;
    }
    const expected = BigInt(maker.sequence) + 1n;
    if (event.previous_sequence !== maker.sequence || BigInt(event.sequence) !== expected) {
      recover("maker sequence gap detected");
      return;
    }
    maker.sequence = event.sequence;
    if (event.type === "heartbeat") return;
    if (event.type === "maker_status") {
      maker.status = event.status;
      handlers.onStatus?.(event.market_id, event.status);
      emitMaker(event.server_time_ms, false);
      return;
    }
    maker.fills.set(event.fill.fill_id, event.fill);
    handlers.onFill?.(event.market_id, event.fill);
    emitMaker(event.server_time_ms, false);
  };

  const scheduleReconnect = () => {
    if (closed || !reconnect || reconnectTimer !== undefined) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(MAX_RECONNECT_MS, reconnectDelay * 2);
  };

  const connect = () => {
    if (closed) return;
    try {
      socket = factory(makerStreamUrl(apiBase, marketId, signer.publicKey));
    } catch (error) {
      report(error);
      if (reconnect) scheduleReconnect();
      else failReady(error instanceof Error ? error : new Error("maker stream failed to open"));
      return;
    }
    socket.onopen = armWatchdog;
    socket.onmessage = (message) => {
      armWatchdog();
      try {
        const text = typeof message.data === "string" ? message.data : "";
        if (!text) throw new Error("maker stream sent a non-text frame");
        apply(JSON.parse(text));
      } catch (error) {
        report(error);
        socket?.close(4002, "invalid frame");
      }
    };
    let closeHandled = false;
    const handleClose = (event: { readonly code: number }) => {
      if (closeHandled) return;
      closeHandled = true;
      if (watchdog !== undefined) clearTimeout(watchdog);
      watchdog = undefined;
      maker = undefined;
      if (terminalError) {
        closed = true;
        failReady(terminalError);
        return;
      }
      if (event.code === 4401 || event.code === 4403) {
        const error = new StrataContractError("maker stream authorization was rejected");
        report(error);
        closed = true;
        failReady(error);
        return;
      }
      if (!reconnect) {
        failReady(new Error("maker stream closed before its signed snapshot"));
        return;
      }
      scheduleReconnect();
    };
    socket.onclose = (event) => handleClose(event);
    socket.onerror = () => {
      report(new Error("Strata maker stream transport failed"));
      // Node's WebSocket emits only `error` (never `close`) when the
      // handshake is rejected; treat a socket that never opened as closed
      // so readiness settles and reconnect logic still runs.
      if (socket?.readyState === 0) handleClose({ code: 1006 });
    };
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
    if (watchdog !== undefined) clearTimeout(watchdog);
    socket?.close(1000, "client closed");
    options.signal?.removeEventListener("abort", close);
  };

  if (options.signal?.aborted) closed = true;
  else options.signal?.addEventListener("abort", close, { once: true });
  if (!closed) connect();
  return { ready, close };
}

export function makerStreamAuthMessage(
  marketId: string,
  walletAddress: string,
  challenge: string,
): Uint8Array {
  const market = accountMarketId(marketId);
  const wallet = accountWalletAddress(walletAddress);
  if (!/^[0-9a-f]{64}$/.test(challenge)) {
    throw new TypeError("challenge must be a 32-byte lowercase hexadecimal value");
  }
  return new TextEncoder().encode(
    `strata:mm-fills-stream:v2\n${market}\n${wallet}\n${challenge}`,
  );
}

function bytesToHex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function makerStreamUrl(apiBase: string, marketId: string, walletAddress: string): string {
  const url = new URL(apiBase);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("apiBase must use http or https");
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/v2/markets/${marketId}/makers/${walletAddress}/stream`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function accountMarketId(value: string): string {
  if (typeof value !== "string" || !/^market_[0-9a-f]{32}$/.test(value)) {
    throw new TypeError("marketId must be an opaque Strata market ID");
  }
  return value;
}

function accountWalletAddress(value: string): string {
  if (typeof value !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
    throw new TypeError("wallet address must be base58");
  }
  return value;
}

function defaultWebSocketFactory(url: string): WebSocket {
  if (typeof globalThis.WebSocket !== "function") {
    throw new Error("a WebSocket-compatible implementation is required");
  }
  return new globalThis.WebSocket(url);
}
