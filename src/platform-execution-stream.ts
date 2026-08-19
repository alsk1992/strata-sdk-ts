import { StrataContractError } from "./client.js";
import { platformExecutionEvent } from "./platform-validation.js";
import type { PlatformEntityId, PlatformExecutionRow, PlatformExecutionsView } from "./platform.js";

const MIN_RECONNECT_MS = 250;
const MAX_RECONNECT_MS = 5_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;
const MAX_WATCHED_EXECUTIONS = 64;

export interface PlatformExecutionHandlers {
  /** Full watched view after every sequenced event. */
  readonly onExecutions?: (view: PlatformExecutionsView) => void;
  /** One watched execution was prepared, confirmed, or re-observed. */
  readonly onExecution?: (marketId: PlatformEntityId, execution: PlatformExecutionRow) => void;
  /** A watched handle expired unconfirmed or is unknown to this market. */
  readonly onUnknown?: (marketId: PlatformEntityId, executionId: string) => void;
  readonly onError?: (error: Error, marketId?: PlatformEntityId) => void;
}

export interface PlatformExecutionSubscriptionOptions {
  readonly signal?: AbortSignal;
  readonly webSocketFactory?: (url: string) => WebSocket;
  readonly reconnect?: boolean;
}

export interface PlatformExecutionSubscription {
  readonly ready: Promise<void>;
  /** Watch additional opaque execution handles on the open stream. */
  watch(executionIds: readonly string[]): void;
  close(): void;
}

interface MutableExecutions {
  marketId: string;
  streamId: string;
  sequence: string;
  executions: Map<string, PlatformExecutionRow>;
  unknown: Set<string>;
}

/**
 * Stream sequenced state for the executions an agent prepared in one market.
 * The stream starts from a snapshot of the watched handles; a sequence gap or
 * reconnect is recovered from a fresh snapshot for the same handles.
 */
export function subscribePlatformExecutions(
  apiBase: string,
  marketId: string,
  executionIds: readonly string[],
  handlers: PlatformExecutionHandlers,
  options: PlatformExecutionSubscriptionOptions = {},
): PlatformExecutionSubscription {
  const market = executionMarketId(marketId);
  const watched = new Set(checkedExecutionIds(executionIds));
  const factory = options.webSocketFactory ?? defaultWebSocketFactory;
  const reconnect = options.reconnect ?? true;
  let socket: WebSocket | undefined;
  let closed = false;
  let reconnectDelay = MIN_RECONNECT_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let state: MutableExecutions | undefined;
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
      error instanceof Error ? error : new Error("Strata execution stream failed"),
      market,
    );
  };

  const armWatchdog = () => {
    if (watchdog !== undefined) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      report(new Error("Strata execution stream heartbeat timed out"));
      socket?.close(4000, "heartbeat timeout");
    }, HEARTBEAT_TIMEOUT_MS);
  };

  const emit = (serverTimeMs: number, recovered: boolean) => {
    if (!state) return;
    handlers.onExecutions?.({
      market_id: state.marketId,
      stream_id: state.streamId,
      sequence: state.sequence,
      server_time_ms: serverTimeMs,
      executions: [...state.executions.values()].sort(
        (left, right) => left.execution_id.localeCompare(right.execution_id),
      ),
      unknown_execution_ids: [...state.unknown].sort(),
      recovered,
    });
  };

  const recover = (reason: string) => {
    report(new StrataContractError(reason));
    state = undefined;
    socket?.close(4001, "sequence recovery");
  };

  const sendWatch = (ids: readonly string[]) => {
    if (ids.length === 0 || !socket || socket.readyState !== 1) return;
    socket.send(JSON.stringify({ type: "watch", execution_ids: ids }));
  };

  const apply = (raw: unknown) => {
    const event = platformExecutionEvent(raw);
    if (event.market_id !== market) {
      recover("execution stream returned a different market");
      return;
    }
    if (event.type === "executions_snapshot") {
      if (state && event.stream_id !== state.streamId) {
        recover("execution stream reset without a new snapshot identity");
        return;
      }
      if (state && BigInt(event.sequence) <= BigInt(state.sequence)) {
        recover("execution recovery snapshot did not advance its sequence");
        return;
      }
      const recovered = receivedSnapshot;
      state = {
        marketId: event.market_id,
        streamId: event.stream_id,
        sequence: event.sequence,
        executions: new Map(event.executions.map((row) => [row.execution_id, row])),
        unknown: new Set(event.unknown_execution_ids),
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
      recover("execution event arrived without its snapshot");
      return;
    }
    const expected = BigInt(state.sequence) + 1n;
    if (event.previous_sequence !== state.sequence || BigInt(event.sequence) !== expected) {
      recover("execution sequence gap detected");
      return;
    }
    state.sequence = event.sequence;
    if (event.type === "heartbeat") return;
    if (event.type === "execution_update") {
      state.executions.set(event.execution.execution_id, event.execution);
      state.unknown.delete(event.execution.execution_id);
      handlers.onExecution?.(event.market_id, event.execution);
      emit(event.server_time_ms, false);
      return;
    }
    state.executions.delete(event.execution_id);
    state.unknown.add(event.execution_id);
    handlers.onUnknown?.(event.market_id, event.execution_id);
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
      socket = factory(executionStreamUrl(apiBase, market));
    } catch (error) {
      report(error);
      if (reconnect) scheduleReconnect();
      else failReady(error instanceof Error ? error : new Error("execution stream failed to open"));
      return;
    }
    socket.onopen = () => {
      armWatchdog();
      // The server answers the first watch frame with the snapshot for the
      // complete watched set, so a reconnect re-establishes every handle.
      sendWatch([...watched]);
    };
    socket.onmessage = (message) => {
      armWatchdog();
      try {
        const text = typeof message.data === "string" ? message.data : "";
        if (!text) throw new Error("execution stream sent a non-text frame");
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
        failReady(new Error("execution stream closed before its snapshot"));
        return;
      }
      scheduleReconnect();
    };
    socket.onclose = () => handleClose();
    socket.onerror = () => {
      report(new Error("Strata execution stream transport failed"));
      // Node's WebSocket emits only `error` (never `close`) when the
      // handshake is rejected; treat a socket that never opened as closed
      // so readiness settles and reconnect logic still runs.
      if (socket?.readyState === 0) handleClose();
    };
  };

  const watch = (executionIds: readonly string[]) => {
    const fresh = checkedExecutionIds(executionIds).filter((id) => !watched.has(id));
    if (watched.size + fresh.length > MAX_WATCHED_EXECUTIONS) {
      throw new TypeError(`at most ${MAX_WATCHED_EXECUTIONS} executions can be watched per stream`);
    }
    fresh.forEach((id) => watched.add(id));
    if (state) sendWatch(fresh);
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
  return { ready, watch, close };
}

function checkedExecutionIds(values: readonly string[]): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("at least one executionId is required");
  }
  const ids = [...new Set(values.map((value) => {
    if (typeof value !== "string" || !/^se_[0-9a-f]{32}$/.test(value)) {
      throw new TypeError("executionId must be an opaque Strata execution handle");
    }
    return value;
  }))];
  if (ids.length > MAX_WATCHED_EXECUTIONS) {
    throw new TypeError(`at most ${MAX_WATCHED_EXECUTIONS} executions can be watched per stream`);
  }
  return ids;
}

function executionStreamUrl(apiBase: string, marketId: string): string {
  const url = new URL(apiBase);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("apiBase must use http or https");
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/v2/markets/${marketId}/executions/stream`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function executionMarketId(value: string): string {
  if (typeof value !== "string" || !/^market_[0-9a-f]{32}$/.test(value)) {
    throw new TypeError("marketId must be an opaque Strata market ID");
  }
  return value;
}

function defaultWebSocketFactory(url: string): WebSocket {
  if (typeof globalThis.WebSocket !== "function") {
    throw new Error("a WebSocket-compatible implementation is required");
  }
  return new globalThis.WebSocket(url);
}
