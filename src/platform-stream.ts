import { StrataContractError } from "./client.js";
import { platformMarketDataEvent } from "./platform-validation.js";
import type {
  PlatformBookLevel,
  PlatformBookView,
  PlatformBestBidAskResponse,
  PlatformMarketDataEvent,
  PlatformMarketState,
  PlatformTrade,
} from "./platform.js";

const MIN_RECONNECT_MS = 250;
const MAX_RECONNECT_MS = 5_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;

export interface PlatformMarketDataHandlers {
  readonly onBook?: (book: PlatformBookView) => void;
  readonly onBestBidAsk?: (value: PlatformBestBidAskResponse) => void;
  readonly onTrade?: (trade: PlatformTrade) => void;
  readonly onMarketStatus?: (status: PlatformMarketState) => void;
  readonly onError?: (error: Error) => void;
}

export interface PlatformMarketDataSubscriptionOptions {
  readonly signal?: AbortSignal;
  readonly webSocketFactory?: (url: string) => WebSocket;
  readonly reconnect?: boolean;
}

export interface PlatformMarketDataSubscription {
  readonly ready: Promise<void>;
  close(): void;
}

interface MutableBook {
  marketId: string;
  streamId: string;
  sequence: string;
  bids: Map<string, string>;
  asks: Map<string, string>;
}

export function subscribePlatformMarketData(
  apiBase: string,
  marketId: string,
  handlers: PlatformMarketDataHandlers,
  options: PlatformMarketDataSubscriptionOptions = {},
): PlatformMarketDataSubscription {
  const factory = options.webSocketFactory ?? defaultWebSocketFactory;
  const reconnect = options.reconnect ?? true;
  let socket: WebSocket | undefined;
  let closed = false;
  let reconnectDelay = MIN_RECONNECT_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let book: MutableBook | undefined;
  let receivedSnapshot = false;
  let readyResolved = false;
  let resolveReady: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const report = (error: unknown) => {
    handlers.onError?.(
      error instanceof Error ? error : new Error("Strata market stream failed"),
    );
  };

  const armWatchdog = () => {
    if (watchdog !== undefined) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      report(new Error("Strata market stream heartbeat timed out"));
      socket?.close(4000, "heartbeat timeout");
    }, HEARTBEAT_TIMEOUT_MS);
  };

  const emitBook = (serverTimeMs: number, recovered: boolean) => {
    if (!book) return;
    handlers.onBook?.({
      market_id: book.marketId,
      stream_id: book.streamId,
      sequence: book.sequence,
      server_time_ms: serverTimeMs,
      bids: sortedLevels(book.bids, true),
      asks: sortedLevels(book.asks, false),
      recovered,
    });
  };

  const recover = (reason: string) => {
    report(new StrataContractError(reason));
    book = undefined;
    socket?.close(4001, "sequence recovery");
  };

  const apply = (event: PlatformMarketDataEvent) => {
    if (event.market_id !== marketId) {
      recover("market stream returned a different market");
      return;
    }
    if (event.type === "heartbeat") return;
    if (event.type === "best_bid_ask") {
      handlers.onBestBidAsk?.(event);
      return;
    }
    if (event.type === "trade") {
      handlers.onTrade?.(event.trade);
      return;
    }
    if (event.type === "market_status") {
      if (event.status !== "active") book = undefined;
      handlers.onMarketStatus?.(event.status);
      return;
    }
    if (event.type === "book_snapshot") {
      const recovered = receivedSnapshot;
      book = {
        marketId: event.market_id,
        streamId: event.stream_id,
        sequence: event.sequence,
        bids: new Map(event.bids.map((row) => [row.price_atoms, row.size_atoms])),
        asks: new Map(event.asks.map((row) => [row.price_atoms, row.size_atoms])),
      };
      receivedSnapshot = true;
      reconnectDelay = MIN_RECONNECT_MS;
      emitBook(event.server_time_ms, recovered);
      if (!readyResolved) {
        readyResolved = true;
        resolveReady!();
      }
      return;
    }
    if (!book || event.stream_id !== book.streamId) {
      recover("book delta arrived without its snapshot");
      return;
    }
    const expected = BigInt(book.sequence) + 1n;
    if (event.previous_sequence !== book.sequence || BigInt(event.sequence) !== expected) {
      recover("book sequence gap detected");
      return;
    }
    for (const change of event.changes) {
      const side = change.side === "bid" ? book.bids : book.asks;
      if (change.size_atoms === "0") side.delete(change.price_atoms);
      else side.set(change.price_atoms, change.size_atoms);
    }
    book.sequence = event.sequence;
    emitBook(event.server_time_ms, false);
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
      socket = factory(streamUrl(apiBase, marketId));
    } catch (error) {
      report(error);
      scheduleReconnect();
      return;
    }
    socket.onopen = armWatchdog;
    socket.onmessage = (message) => {
      armWatchdog();
      try {
        const text = typeof message.data === "string" ? message.data : "";
        if (!text) throw new Error("market stream sent a non-text frame");
        apply(platformMarketDataEvent(JSON.parse(text)));
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
      book = undefined;
      scheduleReconnect();
    };
    socket.onclose = () => handleClose();
    socket.onerror = () => {
      report(new Error("Strata market stream transport failed"));
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

function sortedLevels(values: Map<string, string>, descending: boolean): PlatformBookLevel[] {
  return [...values]
    .sort(([left], [right]) => {
      const a = BigInt(left);
      const b = BigInt(right);
      return a === b ? 0 : (descending ? (a > b ? -1 : 1) : (a < b ? -1 : 1));
    })
    .map(([price_atoms, size_atoms]) => ({ price_atoms, size_atoms }));
}

function streamUrl(apiBase: string, marketId: string): string {
  const url = new URL(apiBase);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/v2/markets/${marketId}/stream`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function defaultWebSocketFactory(url: string): WebSocket {
  if (typeof globalThis.WebSocket !== "function") {
    throw new Error("a WebSocket-compatible implementation is required");
  }
  return new globalThis.WebSocket(url);
}
