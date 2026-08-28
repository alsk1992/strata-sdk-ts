import {
  base58Encode,
  canonicalPublicKey,
  decodeBase64,
  normalizeIdempotencyKey,
  StrataApiError,
  StrataContractError,
} from "./client.js";
import { platformOrderCommandEvents } from "./platform-validation.js";
import {
  verifyOrderTransaction,
  verifySignedTransactionMessage,
} from "./transaction-verifier.js";
import type {
  PlatformDeadManState,
  PlatformOrderChallengeInput,
  PlatformOrderChallengeResponse,
  PlatformOrderChallengeWire,
  PlatformOrderCommandEvent,
  PlatformOrderExecuteOperation,
  PlatformOrderPrepareResponse,
  PlatformOrderStatusResponse,
  PlatformOrderSubmitResponse,
  PlatformOrderVerificationContext,
  PlatformSelfTradePrevention,
} from "./platform.js";
import type { StrataSessionSigner } from "./types.js";

const MIN_RECONNECT_MS = 100;
const MAX_RECONNECT_MS = 2_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;
const MAX_CLIENT_COMMANDS_PER_FRAME = 64;
const MAX_SERVER_EVENTS_PER_FRAME = 64;

export interface PlatformOrderCommandHandlers {
  /** Receives every validated, contiguous server event, including heartbeats. */
  readonly onEvent?: (event: PlatformOrderCommandEvent) => void;
  /** Receives asynchronous chain confirmation for fire-and-forget submissions. */
  readonly onStatus?: (status: PlatformOrderStatusResponse) => void;
  readonly onError?: (error: Error) => void;
}

export interface PlatformOrderCommandOptions {
  readonly signal?: AbortSignal;
  readonly webSocketFactory?: (url: string) => WebSocket;
  readonly reconnect?: boolean;
  readonly requestTimeoutMs?: number;
}

export interface PlatformOrderChallengeResult {
  readonly selfTradePrevention: PlatformSelfTradePrevention;
  readonly preventedOrderIds: readonly string[];
  readonly effectiveRequest: PlatformOrderChallengeWire;
  readonly response: PlatformOrderChallengeResponse;
}

export interface PlatformOrderCommandExecuteInput {
  readonly operation: PlatformOrderExecuteOperation;
  /** Defaults to cancel_taker, the safest policy for a newly arriving command. */
  readonly selfTradePrevention?: PlatformSelfTradePrevention;
  readonly idempotencyKey?: string;
  /**
   * Optional. When omitted the SDK's built-in `verifyOrderTransaction` decodes
   * the transaction and requires it to be exactly the effective operation
   * (after self-trade prevention) before the one session signature.
   */
  verifyTransaction?(context: PlatformOrderVerificationContext): void | Promise<void>;
}

export interface PlatformDeadManArmInput {
  /** 1,000–30,000ms; a missed heartbeat submits the exact pre-signed cancel-all. */
  readonly timeoutMs: number;
  readonly idempotencyKey?: string;
  /** Optional; the built-in verifier checks the pre-signed cancel-all when omitted. */
  verifyTransaction?(context: PlatformOrderVerificationContext): void | Promise<void>;
}

export interface PlatformOrderCommandConnection {
  /** Resolves after signed socket authentication, not merely TCP connection. */
  readonly ready: Promise<void>;
  /** Authenticated non-trading round trip for health and latency measurement. */
  probe(nonce: string): Promise<void>;
  challenge(
    operation: PlatformOrderExecuteOperation,
    selfTradePrevention?: PlatformSelfTradePrevention,
  ): Promise<PlatformOrderChallengeResult>;
  execute(input: PlatformOrderCommandExecuteInput): Promise<PlatformOrderSubmitResponse>;
  status(orderControlId: string, idempotencyKey: string): Promise<PlatformOrderStatusResponse>;
  /** Arms and automatically heartbeats a durable, pre-signed cancel-all ticket. */
  armDeadMan(input: PlatformDeadManArmInput): Promise<PlatformDeadManState>;
  deadManStatus(): Promise<PlatformDeadManState>;
  heartbeatDeadMan(): Promise<PlatformDeadManState>;
  disarmDeadMan(): Promise<PlatformDeadManState>;
  close(): void;
}

interface PendingCommand {
  readonly expected: PlatformOrderCommandEvent["type"];
  readonly resolve: (event: PlatformOrderCommandEvent) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

interface QueuedClientCommand {
  readonly requestId: string;
  readonly frame: Record<string, unknown>;
}

/**
 * Open one persistent, sequenced order-command connection. The session signer
 * remains external; the SDK asks it to sign only validated messages and
 * prepared transactions.
 */
export function connectPlatformOrderCommands(
  apiBase: string,
  marketId: string,
  ownerWallet: string,
  signer: StrataSessionSigner,
  handlers: PlatformOrderCommandHandlers = {},
  options: PlatformOrderCommandOptions = {},
): PlatformOrderCommandConnection {
  const market = checkedMarketId(marketId);
  const owner = canonicalPublicKey(ownerWallet, "ownerWallet");
  const session = canonicalPublicKey(signer.publicKey, "signer.publicKey");
  if (owner === session) throw new TypeError("owner and session public keys must differ");
  if (typeof signer.signMessage !== "function" || typeof signer.signTransaction !== "function") {
    throw new TypeError("signer must provide signMessage and signTransaction");
  }
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 100) {
    throw new TypeError("requestTimeoutMs must be a safe integer of at least 100");
  }
  const factory = options.webSocketFactory ?? defaultWebSocketFactory;
  const reconnect = options.reconnect ?? true;
  let socket: WebSocket | undefined;
  let closed = false;
  let authenticated = false;
  let streamId: string | undefined;
  let serverSequence = 0n;
  let clientSequence = 0n;
  let requestCounter = 0n;
  let reconnectDelay = MIN_RECONNECT_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let deadManTimer: ReturnType<typeof setTimeout> | undefined;
  let deadManRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  let deadManTimeoutMs: number | undefined;
  let deadManRefreshInput: PlatformDeadManArmInput | undefined;
  let readySettled = false;
  let contractFailed = false;
  let resolveReady: () => void;
  let rejectReady: (error: Error) => void;
  const pending = new Map<string, PendingCommand>();
  const queuedCommands: QueuedClientCommand[] = [];
  let commandFlushScheduled = false;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const report = (error: unknown) => handlers.onError?.(
    error instanceof Error ? error : new Error("Strata order command stream failed"),
  );

  const rejectPending = (message: string) => {
    const error = new StrataApiError(
      0,
      "submission_ambiguous",
      message,
      true,
    );
    for (const item of pending.values()) {
      clearTimeout(item.timeout);
      item.reject(error);
    }
    pending.clear();
    queuedCommands.length = 0;
    commandFlushScheduled = false;
  };

  const failContract = (message: string) => {
    contractFailed = true;
    const error = new StrataContractError(message);
    report(error);
    rejectPending(message);
    socket?.close(4001, "sequence recovery");
  };

  const flushQueuedCommands = () => {
    commandFlushScheduled = false;
    if (queuedCommands.length === 0) return;
    const active = socket;
    if (closed || !authenticated || !active) {
      rejectPending("Order command connection closed before queued commands were sent.");
      return;
    }
    while (queuedCommands.length > 0) {
      const batch = queuedCommands.splice(0, MAX_CLIENT_COMMANDS_PER_FRAME);
      const wire = batch.length === 1 ? batch[0]!.frame : batch.map((item) => item.frame);
      try {
        active.send(JSON.stringify(wire));
      } catch (error) {
        report(error);
        for (const item of batch) {
          const waiting = pending.get(item.requestId);
          if (!waiting) continue;
          clearTimeout(waiting.timeout);
          pending.delete(item.requestId);
          waiting.reject(error instanceof Error ? error : new Error("Order command send failed"));
        }
        rejectPending("Order command connection failed while sending a command batch.");
        active.close(4000, "command send failed");
        return;
      }
    }
  };

  const queueCommand = (requestId: string, frame: Record<string, unknown>) => {
    queuedCommands.push({ requestId, frame });
    if (queuedCommands.length >= MAX_CLIENT_COMMANDS_PER_FRAME) {
      flushQueuedCommands();
      return;
    }
    if (commandFlushScheduled) return;
    commandFlushScheduled = true;
    queueMicrotask(flushQueuedCommands);
  };

  const armWatchdog = () => {
    if (watchdog !== undefined) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      report(new StrataApiError(0, "timeout", "Order command heartbeat timed out.", true));
      socket?.close(4000, "heartbeat timeout");
    }, HEARTBEAT_TIMEOUT_MS);
  };

  const authenticate = async (challenge: string) => {
    const active = socket;
    try {
      if (!active) throw new Error("order command stream closed before authentication");
      const signature = await signer.signMessage(orderCommandStreamAuthMessage(
        market,
        owner,
        session,
        challenge,
      ));
      if (!(signature instanceof Uint8Array) || signature.length !== 64) {
        throw new StrataContractError("stream signer must return a 64-byte Ed25519 signature");
      }
      if (closed || active !== socket) return;
      active.send(JSON.stringify({
        type: "authenticate",
        owner_wallet: owner,
        session_public_key: session,
        signature: base58Encode(signature),
        batch_format: "compact_v1",
      }));
    } catch (error) {
      report(error);
      active?.close(4003, "authentication failed");
    }
  };

  const apply = (event: PlatformOrderCommandEvent) => {
    if (event.market_id !== market) {
      failContract("order command stream changed its market binding");
      return;
    }
    armWatchdog();
    handlers.onEvent?.(event);
    if (event.type === "auth_challenge") {
      if (authenticated || streamId !== undefined) {
        failContract("order command stream challenged after authentication");
        return;
      }
      void authenticate(event.challenge);
      return;
    }
    const sequence = BigInt(event.sequence);
    if (event.type === "ready") {
      if (sequence !== 1n || streamId !== undefined) {
        failContract("order command ready sequence is invalid");
        return;
      }
      streamId = event.stream_id;
      serverSequence = sequence;
      authenticated = true;
      reconnectDelay = MIN_RECONNECT_MS;
      if (!readySettled) {
        readySettled = true;
        resolveReady!();
      }
      return;
    }
    if (!authenticated || event.stream_id !== streamId
        || BigInt(event.previous_sequence) !== serverSequence
        || sequence !== serverSequence + 1n) {
      failContract("order command stream sequence is not contiguous");
      return;
    }
    serverSequence = sequence;
    if (event.type === "heartbeat") return;
    if (event.type === "status_result") handlers.onStatus?.(event.response);
    const item = pending.get(event.request_id);
    if (!item) return; // An asynchronous status event or a timed-out request.
    if (event.type === "command_error") {
      clearTimeout(item.timeout);
      pending.delete(event.request_id);
      item.reject(new StrataApiError(
        0,
        event.error.code,
        event.error.message,
        event.error.retryable,
        event.error.retry_after_ms,
      ));
      return;
    }
    if (event.type !== item.expected) {
      failContract("order command response type does not match its request");
      return;
    }
    clearTimeout(item.timeout);
    pending.delete(event.request_id);
    item.resolve(event);
  };

  const open = () => {
    if (closed) return;
    authenticated = false;
    contractFailed = false;
    streamId = undefined;
    serverSequence = 0n;
    clientSequence = 0n;
    const url = new URL(apiBase);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/v2/markets/${market}/orders/stream`;
    url.search = "";
    url.hash = "";
    try {
      socket = factory(url.toString());
    } catch (error) {
      report(error);
      if (!readySettled) {
        readySettled = true;
        rejectReady!(error instanceof Error ? error : new Error("WebSocket open failed"));
      }
      return;
    }
    const active = socket;
    active.onmessage = (message) => {
      if (closed || socket !== active) return;
      try {
        const decoded = JSON.parse(String(message.data)) as unknown;
        const events = platformOrderCommandEvents(decoded, MAX_SERVER_EVENTS_PER_FRAME);
        for (const event of events) {
          apply(event);
          if (contractFailed) break;
        }
      } catch (error) {
        failContract(error instanceof Error ? error.message : "order command stream returned invalid JSON");
      }
    };
    active.onerror = () => report(new Error("order command WebSocket transport failed"));
    active.onclose = () => {
      if (socket === active) socket = undefined;
      authenticated = false;
      streamId = undefined;
      if (watchdog !== undefined) clearTimeout(watchdog);
      rejectPending("Order command connection closed before a correlated result was received.");
      if (closed) return;
      if (!reconnect) {
        const error = new Error("order command connection closed");
        if (!readySettled) {
          readySettled = true;
          rejectReady!(error);
        }
        report(error);
        return;
      }
      reconnectTimer = setTimeout(open, reconnectDelay);
      reconnectDelay = Math.min(MAX_RECONNECT_MS, reconnectDelay * 2);
    };
  };

  const command = <T extends PlatformOrderCommandEvent>(
    body: Record<string, unknown>,
    expected: T["type"],
  ): Promise<T> => {
    if (closed) return Promise.reject(new Error("order command connection is closed"));
    if (!authenticated || !socket) {
      return Promise.reject(new StrataApiError(
        0,
        "temporarily_unavailable",
        "Order command connection is not authenticated.",
        true,
      ));
    }
    clientSequence += 1n;
    requestCounter += 1n;
    const requestId = `sdk-${requestCounter.toString(36)}`;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new StrataApiError(0, "timeout", "Order command timed out.", true));
      }, requestTimeoutMs);
      pending.set(requestId, {
        expected,
        resolve: (event) => resolve(event as T),
        reject,
        timeout,
      });
      queueCommand(requestId, {
        type: "command",
        request_id: requestId,
        sequence: clientSequence.toString(),
        command: body,
      });
    });
  };

  const challenge = async (
    operation: PlatformOrderExecuteOperation,
    selfTradePrevention: PlatformSelfTradePrevention = "cancel_taker",
  ): Promise<PlatformOrderChallengeResult> => {
    const event = await command<Extract<PlatformOrderCommandEvent, { type: "challenge_result" }>>(
      {
        type: "challenge",
        request: operationWire(operation, owner, session),
        self_trade_prevention: checkedSelfTradePrevention(selfTradePrevention),
      },
      "challenge_result",
    );
    return {
      selfTradePrevention: event.self_trade_prevention,
      preventedOrderIds: event.prevented_order_ids,
      effectiveRequest: event.effective_request,
      response: event.response,
    };
  };

  const probe = async (nonce: string): Promise<void> => {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(nonce)) {
      throw new TypeError("order command probe nonce is invalid");
    }
    const event = await command<Extract<PlatformOrderCommandEvent, { type: "probe_result" }>>(
      { type: "probe", nonce },
      "probe_result",
    );
    if (event.nonce !== nonce) {
      failContract("order command probe changed its nonce");
      throw new StrataContractError("order command probe changed its nonce");
    }
  };

  const authorizeAndPrepare = async (
    challengeResult: PlatformOrderChallengeResult,
    verifyTransaction: PlatformOrderCommandExecuteInput["verifyTransaction"],
  ): Promise<{ prepared: PlatformOrderPrepareResponse; signedTransactionBase64: string }> => {
    const effectiveOperation = operationFromWire(challengeResult.effectiveRequest);
    // One signature: this socket already authenticated the session and the
    // challenge is bound to it, so no message signature is needed — the
    // session signs only the transaction, after it has been verified.
    const prepareEvent = await command<Extract<PlatformOrderCommandEvent, { type: "prepare_result" }>>(
      {
        type: "prepare",
        request: { challenge_id: challengeResult.response.challenge_id },
      },
      "prepare_result",
    );
    const prepared = prepareEvent.response;
    assertPreparedBinding(challengeResult.response, prepared);
    const operation = { ...effectiveOperation, sessionPublicKey: session } as PlatformOrderChallengeInput;
    const context: PlatformOrderVerificationContext = {
      challenge: challengeResult.response,
      operation,
      marketId,
      prepared,
      ownerWallet: owner,
      sessionPublicKey: session,
    };
    if (verifyTransaction) {
      await verifyTransaction(context);
    } else {
      await verifyOrderTransaction({
        marketId,
        operation,
        prepared,
        ownerWallet: owner,
        sessionPublicKey: session,
      });
    }
    const signedTransactionBase64 = await signer.signTransaction(prepared.transaction_base64);
    decodeBase64(signedTransactionBase64);
    verifySignedTransactionMessage(prepared.transaction_base64, signedTransactionBase64);
    return { prepared, signedTransactionBase64 };
  };

  const execute = async (
    input: PlatformOrderCommandExecuteInput,
  ): Promise<PlatformOrderSubmitResponse> => {
    if (input.verifyTransaction !== undefined && typeof input.verifyTransaction !== "function") {
      throw new TypeError("verifyTransaction must be a function when supplied");
    }
    const challenged = await challenge(input.operation, input.selfTradePrevention);
    const { prepared, signedTransactionBase64 } = await authorizeAndPrepare(
      challenged,
      input.verifyTransaction,
    );
    const event = await command<Extract<PlatformOrderCommandEvent, { type: "submit_result" }>>(
      {
        type: "submit",
        request: {
          order_control_id: prepared.order_control_id,
          signed_transaction_base64: signedTransactionBase64,
          idempotency_key: normalizeIdempotencyKey(
            input.idempotencyKey ?? prepared.order_control_id,
          ),
        },
      },
      "submit_result",
    );
    if (event.response.order_control_id !== prepared.order_control_id) {
      throw new StrataContractError("order submit result changed its control binding");
    }
    return event.response;
  };

  const status = async (
    orderControlId: string,
    idempotencyKey: string,
  ): Promise<PlatformOrderStatusResponse> => {
    const event = await command<Extract<PlatformOrderCommandEvent, { type: "status_result" }>>(
      {
        type: "status",
        request: {
          order_control_id: checkedHandle(orderControlId, "orderControlId", "or_"),
          idempotency_key: normalizeIdempotencyKey(idempotencyKey),
        },
      },
      "status_result",
    );
    return event.response;
  };

  const scheduleDeadManHeartbeat = () => {
    if (deadManTimer !== undefined) clearTimeout(deadManTimer);
    if (closed || deadManTimeoutMs === undefined) return;
    deadManTimer = setTimeout(() => {
      void heartbeatDeadMan().catch((error) => {
        // Failure is intentionally fail-closed: no successful heartbeat means
        // the durable pre-signed cancel-all remains on course to execute.
        report(error);
        deadManTimeoutMs = undefined;
        deadManRefreshInput = undefined;
        if (deadManRefreshTimer !== undefined) clearTimeout(deadManRefreshTimer);
      });
    }, Math.max(250, Math.floor(deadManTimeoutMs / 3)));
  };

  const scheduleDeadManRefresh = (transactionExpiresAtMs: number) => {
    if (deadManRefreshTimer !== undefined) clearTimeout(deadManRefreshTimer);
    if (closed || deadManTimeoutMs === undefined || deadManRefreshInput === undefined) return;
    const refreshLeadMs = Math.max(5_000, deadManTimeoutMs * 2);
    const delayMs = Math.max(1_000, transactionExpiresAtMs - Date.now() - refreshLeadMs);
    deadManRefreshTimer = setTimeout(() => {
      const input = deadManRefreshInput;
      if (!input) return;
      // A fresh challenge captures the current open set and provides a new
      // blockhash. Failure leaves the existing ticket armed and fail-closed.
      void armDeadMan(input).catch((error) => {
        report(error);
        deadManRefreshInput = undefined;
      });
    }, delayMs);
  };

  const armDeadMan = async (input: PlatformDeadManArmInput): Promise<PlatformDeadManState> => {
    if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1_000
        || input.timeoutMs > 30_000) {
      throw new TypeError("dead-man timeoutMs must be an integer between 1000 and 30000");
    }
    if (input.verifyTransaction !== undefined && typeof input.verifyTransaction !== "function") {
      throw new TypeError("verifyTransaction must be a function when supplied");
    }
    const challenged = await challenge({ action: "cancel_all", ownerWallet: owner });
    const { prepared, signedTransactionBase64 } = await authorizeAndPrepare(
      challenged,
      input.verifyTransaction,
    );
    const event = await command<Extract<PlatformOrderCommandEvent, { type: "dead_man_result" }>>(
      {
        type: "dead_man_arm",
        timeout_ms: input.timeoutMs,
        request: {
          order_control_id: prepared.order_control_id,
          signed_transaction_base64: signedTransactionBase64,
          idempotency_key: normalizeIdempotencyKey(
            input.idempotencyKey ?? `dead-man-${prepared.order_control_id}`,
          ),
        },
      },
      "dead_man_result",
    );
    deadManTimeoutMs = input.timeoutMs;
    deadManRefreshInput = input;
    scheduleDeadManHeartbeat();
    scheduleDeadManRefresh(prepared.expires_at_ms);
    return event.state;
  };

  const heartbeatDeadMan = async (): Promise<PlatformDeadManState> => {
    const event = await command<Extract<PlatformOrderCommandEvent, { type: "dead_man_result" }>>(
      { type: "dead_man_heartbeat" },
      "dead_man_result",
    );
    if (event.state.status === "armed") scheduleDeadManHeartbeat();
    else deadManTimeoutMs = undefined;
    return event.state;
  };

  const deadManStatus = async (): Promise<PlatformDeadManState> => {
    const event = await command<Extract<PlatformOrderCommandEvent, { type: "dead_man_result" }>>(
      { type: "dead_man_status" },
      "dead_man_result",
    );
    return event.state;
  };

  const disarmDeadMan = async (): Promise<PlatformDeadManState> => {
    const event = await command<Extract<PlatformOrderCommandEvent, { type: "dead_man_result" }>>(
      { type: "dead_man_disarm" },
      "dead_man_result",
    );
    deadManTimeoutMs = undefined;
    deadManRefreshInput = undefined;
    if (deadManTimer !== undefined) clearTimeout(deadManTimer);
    if (deadManRefreshTimer !== undefined) clearTimeout(deadManRefreshTimer);
    return event.state;
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
    if (watchdog !== undefined) clearTimeout(watchdog);
    if (deadManTimer !== undefined) clearTimeout(deadManTimer);
    if (deadManRefreshTimer !== undefined) clearTimeout(deadManRefreshTimer);
    rejectPending("Order command connection was closed by the caller.");
    if (!readySettled) {
      readySettled = true;
      rejectReady!(new Error("order command connection was closed before authentication"));
    }
    socket?.close(1000, "client closed");
    socket = undefined;
  };

  options.signal?.addEventListener("abort", close, { once: true });
  open();
  if (options.signal?.aborted) close();
  return {
    ready,
    probe,
    challenge,
    execute,
    status,
    armDeadMan,
    deadManStatus,
    heartbeatDeadMan,
    disarmDeadMan,
    close,
  };
}

export function orderCommandStreamAuthMessage(
  marketId: string,
  ownerWallet: string,
  sessionPublicKey: string,
  challenge: string,
): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(challenge)) {
    throw new TypeError("order stream challenge must be 32-byte lowercase hex");
  }
  return new TextEncoder().encode(
    `strata:order-command-stream:v2\n${checkedMarketId(marketId)}\n${canonicalPublicKey(ownerWallet, "ownerWallet")}\n${canonicalPublicKey(sessionPublicKey, "sessionPublicKey")}\n${challenge}`,
  );
}

function operationWire(
  operation: PlatformOrderExecuteOperation,
  ownerWallet: string,
  sessionPublicKey: string,
): PlatformOrderChallengeWire {
  const identity = { owner_wallet: ownerWallet, session_public_key: sessionPublicKey };
  if (canonicalPublicKey(operation.ownerWallet, "operation.ownerWallet") !== ownerWallet) {
    throw new TypeError("operation owner does not match the order command connection");
  }
  if (operation.action === "cancel") {
    return { ...identity, action: "cancel", order_id: checkedOrderId(operation.orderId) };
  }
  if (operation.action === "cancel_all") return { ...identity, action: "cancel_all" };
  if (operation.action === "batch") {
    if (operation.operations.length < 1 || operation.operations.length > 6) {
      throw new TypeError("order batch must contain between one and six operations");
    }
    return {
      ...identity,
      action: "batch",
      operations: operation.operations.map((item) => item.action === "cancel"
        ? { action: "cancel", order_id: checkedOrderId(item.orderId) }
        : item.action === "place"
          ? { action: "place", ...placeWire(item) }
          : { action: "replace", order_id: checkedOrderId(item.orderId), ...placeWire(item) }),
    };
  }
  if (operation.action === "replace") {
    return {
      ...identity,
      action: "replace",
      order_id: checkedOrderId(operation.orderId),
      ...placeWire(operation),
    };
  }
  return { ...identity, action: "place", ...placeWire(operation) };
}

function operationFromWire(request: PlatformOrderChallengeWire): PlatformOrderExecuteOperation {
  const ownerWallet = request.owner_wallet;
  if (request.action === "cancel") {
    return { action: "cancel", ownerWallet, orderId: request.order_id };
  }
  if (request.action === "cancel_all") return { action: "cancel_all", ownerWallet };
  if (request.action === "batch") {
    return {
      action: "batch",
      ownerWallet,
      operations: request.operations.map((item) => item.action === "cancel"
        ? { action: "cancel", orderId: item.order_id }
        : item.action === "place"
          ? { action: "place", ...placeFromWire(item) }
          : { action: "replace", orderId: item.order_id, ...placeFromWire(item) }),
    };
  }
  if (request.action === "replace") {
    return {
      action: "replace",
      ownerWallet,
      orderId: request.order_id,
      ...placeFromWire(request),
    };
  }
  return { action: "place", ownerWallet, ...placeFromWire(request) };
}

function placeWire(operation: {
  readonly accountSequence?: string | bigint;
  readonly clientOrderId: string;
  readonly side: string;
  readonly orderType: string;
  readonly limitPriceAtoms: string | bigint;
  readonly sizeAtoms: string | bigint;
}) {
  if (operation.side !== "buy" && operation.side !== "sell") {
    throw new TypeError("side must be buy or sell");
  }
  if (operation.orderType !== "good_until_cancelled" && operation.orderType !== "post_only") {
    throw new TypeError("orderType must be good_until_cancelled or post_only");
  }
  return {
    // Omitted stays omitted: Strata resolves the next sequence from the
    // Vault's confirmed market account when the challenge is issued.
    ...(operation.accountSequence === undefined
      ? {}
      : { account_sequence: atomic(operation.accountSequence, "accountSequence", true) }),
    client_order_id: opaqueInput(operation.clientOrderId, "clientOrderId"),
    side: operation.side,
    order_type: operation.orderType,
    limit_price_atoms: atomic(operation.limitPriceAtoms, "limitPriceAtoms", false),
    size_atoms: atomic(operation.sizeAtoms, "sizeAtoms", false),
  } as const;
}

function placeFromWire(operation: {
  readonly account_sequence?: string;
  readonly client_order_id: string;
  readonly side: "buy" | "sell";
  readonly order_type: "good_until_cancelled" | "post_only";
  readonly limit_price_atoms: string;
  readonly size_atoms: string;
}) {
  return {
    ...(operation.account_sequence === undefined
      ? {}
      : { accountSequence: operation.account_sequence }),
    clientOrderId: operation.client_order_id,
    side: operation.side,
    orderType: operation.order_type,
    limitPriceAtoms: operation.limit_price_atoms,
    sizeAtoms: operation.size_atoms,
  } as const;
}

function assertPreparedBinding(
  challenge: PlatformOrderChallengeResponse,
  prepared: PlatformOrderPrepareResponse,
): void {
  if (prepared.market_id !== challenge.market_id
      || prepared.action !== challenge.action
      || prepared.expires_at_ms !== challenge.expires_at_ms
      || prepared.order_ids.length !== challenge.order_ids.length
      || prepared.order_ids.some((id, index) => id !== challenge.order_ids[index])) {
    throw new StrataContractError("prepared order control changed the signed bindings");
  }
}

function checkedSelfTradePrevention(value: string): PlatformSelfTradePrevention {
  if (value !== "cancel_taker" && value !== "cancel_maker"
      && value !== "cancel_both" && value !== "skip_own_liquidity") {
    throw new TypeError("selfTradePrevention is invalid");
  }
  return value;
}

function atomic(value: string | bigint, field: string, allowZero: boolean): string {
  const normalized = typeof value === "bigint" ? value.toString() : value.trim();
  if (!/^(?:0|[1-9][0-9]*)$/.test(normalized) || (!allowZero && normalized === "0")) {
    throw new TypeError(`${field} must be a canonical unsigned atomic value`);
  }
  return normalized;
}

function opaqueInput(value: string, field: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(normalized)) {
    throw new TypeError(`${field} must contain 1-64 URL-safe characters`);
  }
  return normalized;
}

function checkedMarketId(value: string): string {
  const marketId = value.trim();
  if (!/^market_[0-9a-f]{32}$/.test(marketId)) {
    throw new TypeError("marketId must be an opaque Strata market ID");
  }
  return marketId;
}

function checkedOrderId(value: string): string {
  const orderId = value.trim();
  if (!/^order_[0-9a-f]{32}$/.test(orderId)) {
    throw new TypeError("orderId must be an opaque Strata order ID");
  }
  return orderId;
}

function checkedHandle(value: string, field: string, prefix: "or_"): string {
  const handle = value.trim();
  if (!new RegExp(`^${prefix}[0-9a-f]{32}$`).test(handle)) {
    throw new TypeError(`${field} must be an opaque Strata handle`);
  }
  return handle;
}

function defaultWebSocketFactory(url: string): WebSocket {
  if (typeof globalThis.WebSocket !== "function") {
    throw new Error("a WebSocket-compatible implementation is required");
  }
  return new globalThis.WebSocket(url);
}
