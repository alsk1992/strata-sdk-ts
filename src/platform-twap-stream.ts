import { StrataContractError } from "./client.js";
import { platformTwapEvent } from "./platform-validation.js";
import type { PlatformEntityId, PlatformTwap, PlatformTwapsView } from "./platform.js";

const MIN_RECONNECT_MS = 250;
const MAX_RECONNECT_MS = 5_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;

export interface PlatformTwapHandlers {
  /** Full wallet view for one market after every sequenced event. */
  readonly onTwaps?: (view: PlatformTwapsView) => void;
  /** One schedule was created, executed a slice, or reached a terminal state. */
  readonly onTwap?: (marketId: PlatformEntityId, twap: PlatformTwap) => void;
  readonly onError?: (error: Error, marketId?: PlatformEntityId) => void;
}

export interface PlatformTwapSubscriptionOptions {
  readonly signal?: AbortSignal;
  readonly webSocketFactory?: (url: string) => WebSocket;
  readonly reconnect?: boolean;
}

export interface PlatformTwapSubscription {
  readonly ready: Promise<void>;
  close(): void;
}

interface MutableTwaps {
  marketId: string;
  walletAddress: string;
  streamId: string;
  sequence: string;
  twaps: Map<string, PlatformTwap>;
}

/**
 * Stream sequenced TWAP progress for one wallet across one or more markets.
 * Each market opens its own recoverable stream; a sequence gap or reconnect is
 * recovered from a fresh snapshot and reported as `recovered`.
 */
export function subscribePlatformTwaps(
  apiBase: string,
  marketIds: readonly string[],
  walletAddress: string,
  handlers: PlatformTwapHandlers,
  options: PlatformTwapSubscriptionOptions = {},
): PlatformTwapSubscription {
  const wallet = twapWalletAddress(walletAddress);
  const uniqueMarkets = [...new Set(marketIds.map(twapMarketId))];
  if (uniqueMarkets.length === 0) throw new TypeError("at least one marketId is required");
  const connections = uniqueMarkets.map((marketId) =>
    subscribeMarket(apiBase, marketId, wallet, handlers, options));
  const ready = Promise.all(connections.map((connection) => connection.ready)).then(() => undefined);
  const close = () => connections.forEach((connection) => connection.close());
  void ready.catch(() => close());
  if (options.signal?.aborted) close();
  return { ready, close };
}

function subscribeMarket(
  apiBase: string,
  marketId: string,
  walletAddress: string,
  handlers: PlatformTwapHandlers,
  options: PlatformTwapSubscriptionOptions,
): PlatformTwapSubscription {
  const factory = options.webSocketFactory ?? defaultWebSocketFactory;
  const reconnect = options.reconnect ?? true;
  let socket: WebSocket | undefined;
  let closed = false;
  let reconnectDelay = MIN_RECONNECT_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let state: MutableTwaps | undefined;
  let receivedSnapshot = false;
  let readySettled = false;
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
      error instanceof Error ? error : new Error("Strata TWAP stream failed"),
      marketId,
    );
  };

  const armWatchdog = () => {
    if (watchdog !== undefined) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      report(new Error("Strata TWAP stream heartbeat timed out"));
      socket?.close(4000, "heartbeat timeout");
    }, HEARTBEAT_TIMEOUT_MS);
  };

  const emit = (serverTimeMs: number, recovered: boolean) => {
    if (!state) return;
    handlers.onTwaps?.({
      market_id: state.marketId,
      wallet_address: state.walletAddress,
      stream_id: state.streamId,
      sequence: state.sequence,
      server_time_ms: serverTimeMs,
      twaps: [...state.twaps.values()].sort(
        (left, right) => right.created_at_ms - left.created_at_ms,
      ),
      recovered,
    });
  };

  const recover = (reason: string) => {
    report(new StrataContractError(reason));
    state = undefined;
    socket?.close(4001, "sequence recovery");
  };

  const apply = (raw: unknown) => {
    const event = platformTwapEvent(raw);
    if (event.market_id !== marketId || event.wallet_address !== walletAddress) {
      recover("TWAP stream returned different request bindings");
      return;
    }
    if (event.type === "twaps_snapshot") {
      if (state && event.stream_id !== state.streamId) {
        recover("TWAP stream reset without a new snapshot identity");
        return;
      }
      if (state && BigInt(event.sequence) <= BigInt(state.sequence)) {
        recover("TWAP recovery snapshot did not advance its sequence");
        return;
      }
      const recovered = receivedSnapshot;
      state = {
        marketId: event.market_id,
        walletAddress: event.wallet_address,
        streamId: event.stream_id,
        sequence: event.sequence,
        twaps: new Map(event.twaps.map((twap) => [twap.twap_id, twap])),
      };
      receivedSnapshot = true;
      reconnectDelay = MIN_RECONNECT_MS;
      emit(event.server_time_ms, recovered);
      if (!readySettled) {
        readySettled = true;
        resolveReady!();
      }
      return;
    }
    if (!state || event.stream_id !== state.streamId) {
      recover("TWAP event arrived without its snapshot");
      return;
    }
    const expected = BigInt(state.sequence) + 1n;
    if (event.previous_sequence !== state.sequence || BigInt(event.sequence) !== expected) {
      recover("TWAP sequence gap detected");
      return;
    }
    state.sequence = event.sequence;
    if (event.type === "heartbeat") return;
    state.twaps.set(event.twap.twap_id, event.twap);
    handlers.onTwap?.(event.market_id, event.twap);
    emit(event.server_time_ms, false);
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
      socket = factory(twapStreamUrl(apiBase, marketId, walletAddress));
    } catch (error) {
      report(error);
      if (reconnect) scheduleReconnect();
      else failReady(error instanceof Error ? error : new Error("TWAP stream failed to open"));
      return;
    }
    socket.onopen = armWatchdog;
    socket.onmessage = (message) => {
      armWatchdog();
      try {
        const text = typeof message.data === "string" ? message.data : "";
        if (!text) throw new Error("TWAP stream sent a non-text frame");
        apply(JSON.parse(text));
      } catch (error) {
        report(error);
        socket?.close(4002, "invalid frame");
      }
    };
    let closeHandled = false;
    const handleClose = () => {
      if (closeHandled) return;
      closeHandled = true;
      if (watchdog !== undefined) clearTimeout(watchdog);
      watchdog = undefined;
      state = undefined;
      if (!reconnect) {
        failReady(new Error("TWAP stream closed before its snapshot"));
        return;
      }
      scheduleReconnect();
    };
    socket.onclose = () => handleClose();
    socket.onerror = () => {
      report(new Error("Strata TWAP stream transport failed"));
      // Node's WebSocket emits only `error` (never `close`) when the
      // handshake is rejected; treat a socket that never opened as closed
      // so readiness settles and reconnect logic still runs.
      if (socket?.readyState === 0) handleClose();
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

function twapStreamUrl(apiBase: string, marketId: string, walletAddress: string): string {
  const url = new URL(apiBase);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("apiBase must use http or https");
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/v2/markets/${marketId}/account/${walletAddress}/twaps/stream`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function twapMarketId(value: string): string {
  if (typeof value !== "string" || !/^market_[0-9a-f]{32}$/.test(value)) {
    throw new TypeError("marketId must be an opaque Strata market ID");
  }
  return value;
}

function twapWalletAddress(value: string): string {
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
