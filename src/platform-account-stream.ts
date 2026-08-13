import { StrataContractError } from "./client.js";
import { platformAccountEvent } from "./platform-validation.js";
import type {
  PlatformAccountFill,
  PlatformAccountSigner,
  PlatformAccountView,
  PlatformEntityId,
} from "./platform.js";

const MIN_RECONNECT_MS = 250;
const MAX_RECONNECT_MS = 5_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;

export interface PlatformAccountHandlers {
  readonly onAccount?: (account: PlatformAccountView) => void;
  readonly onFill?: (marketId: PlatformEntityId, fill: PlatformAccountFill) => void;
  readonly onError?: (error: Error, marketId?: PlatformEntityId) => void;
}

export interface PlatformAccountSubscriptionOptions {
  readonly signal?: AbortSignal;
  readonly webSocketFactory?: (url: string) => WebSocket;
  readonly reconnect?: boolean;
}

export interface PlatformAccountSubscription {
  readonly ready: Promise<void>;
  close(): void;
}

interface MutableAccount {
  marketId: string;
  walletAddress: string;
  streamId: string;
  sequence: string;
  orders: PlatformAccountView["orders"];
  fills: Map<string, PlatformAccountFill>;
}

export function subscribePlatformAccount(
  apiBase: string,
  marketIds: readonly string[],
  signer: PlatformAccountSigner,
  handlers: PlatformAccountHandlers,
  options: PlatformAccountSubscriptionOptions = {},
): PlatformAccountSubscription {
  if (!signer || typeof signer !== "object" || typeof signer.signMessage !== "function") {
    throw new TypeError("account signer must provide publicKey and signMessage");
  }
  accountWalletAddress(signer.publicKey);
  const uniqueMarkets = [...new Set(marketIds.map(accountMarketId))];
  if (uniqueMarkets.length === 0) throw new TypeError("at least one marketId is required");
  const connections = uniqueMarkets.map((marketId) =>
    subscribeMarket(apiBase, marketId, signer, handlers, options));
  const ready = Promise.all(connections.map((connection) => connection.ready)).then(() => undefined);
  const close = () => connections.forEach((connection) => connection.close());
  void ready.catch(() => close());
  if (options.signal?.aborted) close();
  return { ready, close };
}

function subscribeMarket(
  apiBase: string,
  marketId: string,
  signer: PlatformAccountSigner,
  handlers: PlatformAccountHandlers,
  options: PlatformAccountSubscriptionOptions,
): PlatformAccountSubscription {
  const factory = options.webSocketFactory ?? defaultWebSocketFactory;
  const reconnect = options.reconnect ?? true;
  let socket: WebSocket | undefined;
  let closed = false;
  let reconnectDelay = MIN_RECONNECT_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let account: MutableAccount | undefined;
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
      error instanceof Error ? error : new Error("Strata account stream failed"),
      marketId,
    );
  };

  const armWatchdog = () => {
    if (watchdog !== undefined) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      report(new Error("Strata account stream heartbeat timed out"));
      socket?.close(4000, "heartbeat timeout");
    }, HEARTBEAT_TIMEOUT_MS);
  };

  const emitAccount = (serverTimeMs: number, recovered: boolean) => {
    if (!account) return;
    handlers.onAccount?.({
      market_id: account.marketId,
      wallet_address: account.walletAddress,
      stream_id: account.streamId,
      sequence: account.sequence,
      server_time_ms: serverTimeMs,
      orders: account.orders,
      fills: [...account.fills.values()].sort(
        (left, right) => right.executed_at_ms - left.executed_at_ms,
      ),
      recovered,
    });
  };

  const recover = (reason: string) => {
    report(new StrataContractError(reason));
    account = undefined;
    socket?.close(4001, "sequence recovery");
  };

  const authenticate = async (challenge: string) => {
    const active = socket;
    try {
      if (!active) throw new Error("account stream closed before authorization");
      const signature = await signer.signMessage(accountStreamAuthMessage(
        marketId,
        signer.publicKey,
        challenge,
      ));
      if (!(signature instanceof Uint8Array) || signature.length !== 64) {
        throw new Error("account signer must return a 64-byte Ed25519 signature");
      }
      if (closed || socket !== active) return;
      active.send(JSON.stringify({ type: "authenticate", signature: bytesToHex(signature) }));
    } catch (error) {
      terminalError = error instanceof Error ? error : new Error("account authorization failed");
      report(terminalError);
      active?.close(4003, "account authorization failed");
    }
  };

  const apply = (raw: unknown) => {
    const event = platformAccountEvent(raw);
    if (event.market_id !== marketId || event.wallet_address !== signer.publicKey) {
      recover("account stream returned different request bindings");
      return;
    }
    if (event.type === "auth_challenge") {
      if (account) {
        recover("account stream challenged after state delivery");
        return;
      }
      void authenticate(event.challenge);
      return;
    }
    if (event.type === "account_snapshot") {
      if (account && event.stream_id !== account.streamId) {
        recover("account stream reset without a new signed challenge");
        return;
      }
      if (account && BigInt(event.sequence) <= BigInt(account.sequence)) {
        recover("account recovery snapshot did not advance its sequence");
        return;
      }
      const recovered = receivedSnapshot;
      account = {
        marketId: event.market_id,
        walletAddress: event.wallet_address,
        streamId: event.stream_id,
        sequence: event.sequence,
        orders: event.orders,
        fills: new Map(event.fills.map((fill) => [fill.fill_id, fill])),
      };
      receivedSnapshot = true;
      reconnectDelay = MIN_RECONNECT_MS;
      emitAccount(event.server_time_ms, recovered);
      if (!readySettled) {
        readySettled = true;
        resolveReady!();
      }
      return;
    }
    if (!account || event.stream_id !== account.streamId) {
      recover("account event arrived without its signed snapshot");
      return;
    }
    const expected = BigInt(account.sequence) + 1n;
    if (event.previous_sequence !== account.sequence || BigInt(event.sequence) !== expected) {
      recover("account sequence gap detected");
      return;
    }
    account.sequence = event.sequence;
    if (event.type === "heartbeat") return;
    if (event.type === "orders_snapshot") {
      account.orders = event.orders;
      emitAccount(event.server_time_ms, false);
      return;
    }
    account.fills.set(event.fill.fill_id, event.fill);
    handlers.onFill?.(event.market_id, event.fill);
    emitAccount(event.server_time_ms, false);
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
      socket = factory(accountStreamUrl(apiBase, marketId, signer.publicKey));
    } catch (error) {
      report(error);
      if (reconnect) scheduleReconnect();
      else failReady(error instanceof Error ? error : new Error("account stream failed to open"));
      return;
    }
    socket.onopen = armWatchdog;
    socket.onmessage = (message) => {
      armWatchdog();
      try {
        const text = typeof message.data === "string" ? message.data : "";
        if (!text) throw new Error("account stream sent a non-text frame");
        apply(JSON.parse(text));
      } catch (error) {
        report(error);
        socket?.close(4002, "invalid frame");
      }
    };
    socket.onerror = () => report(new Error("Strata account stream transport failed"));
    socket.onclose = (event) => {
      if (watchdog !== undefined) clearTimeout(watchdog);
      watchdog = undefined;
      account = undefined;
      if (terminalError) {
        closed = true;
        failReady(terminalError);
        return;
      }
      if (event.code === 4401 || event.code === 4403) {
        const error = new StrataContractError("account stream authorization was rejected");
        report(error);
        closed = true;
        failReady(error);
        return;
      }
      if (!reconnect) {
        failReady(new Error("account stream closed before its signed snapshot"));
        return;
      }
      scheduleReconnect();
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

export function accountHttpAuthMessage(
  marketId: string,
  walletAddress: string,
  timestampMs: number,
  fillLimit: number,
): Uint8Array {
  const market = accountMarketId(marketId);
  const wallet = accountWalletAddress(walletAddress);
  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0) {
    throw new TypeError("timestampMs must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(fillLimit) || fillLimit < 1 || fillLimit > 200) {
    throw new TypeError("fillLimit must be an integer between 1 and 200");
  }
  return new TextEncoder().encode(
    `strata:account-read:v2\n${market}\n${wallet}\n${timestampMs}\n${fillLimit}`,
  );
}

export function accountStreamAuthMessage(
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
    `strata:account-stream:v2\n${market}\n${wallet}\n${challenge}`,
  );
}

export function bytesToHex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function accountStreamUrl(apiBase: string, marketId: string, walletAddress: string): string {
  const url = new URL(apiBase);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("apiBase must use http or https");
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/v2/markets/${marketId}/account/${walletAddress}/stream`;
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
