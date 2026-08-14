import type {
  AtomicString,
  CapabilityRisk,
  McpExposure,
  StrataSessionSigner,
} from "./types.js";

export const PLATFORM_SCHEMA_VERSION = 2 as const;
export const PLATFORM_CONTRACT_VERSION = "2.0" as const;

/** Signed base-10 integer in an asset's smallest atomic unit. */
export type SignedAtomicString = string;
export type PlatformEntityId = string;
export type PlatformCapabilityId = string;
export type PlatformTransport = "http" | "websocket" | "mcp";
export type PlatformMarketState =
  | "active"
  | "read_only"
  | "quote_only"
  | "cancel_only"
  | "paused"
  | "warming"
  | "degraded"
  | "unavailable";

export type PlatformOrderState =
  | "created"
  | "accepted"
  | "open"
  | "partially_filled"
  | "filled"
  | "cancel_pending"
  | "cancelled"
  | "expired"
  | "rejected";

export type PlatformSettlementState =
  | "not_applicable"
  | "pending"
  | "confirmed"
  | "failed";

export type PlatformPublicErrorCode =
  | "invalid_request"
  | "unsupported_capability"
  | "market_unavailable"
  | "market_warming"
  | "quote_unavailable"
  | "quote_expired"
  | "price_bound_failed"
  | "insufficient_balance"
  | "policy_rejected"
  | "session_expired"
  | "sequence_conflict"
  | "duplicate_client_id"
  | "order_rejected"
  | "order_not_found"
  | "cancel_too_late"
  | "self_trade_prevented"
  | "dead_man_expired"
  | "rate_limited"
  | "temporarily_unavailable"
  | "submission_ambiguous"
  | "settlement_pending"
  | "settlement_failed";

export interface PlatformAuthority {
  readonly permission_source: "external_agent_owner";
  readonly signing_location: "external";
  readonly accepts_private_keys: false;
}

/** Exact asset amount. No floating-point money crosses the SDK boundary. */
export interface ExactAmount {
  readonly asset_id: string;
  readonly atoms: AtomicString;
}

/** Sequence metadata shared by all recoverable state streams. */
export interface SequenceEnvelope {
  readonly stream_id: string;
  readonly sequence: AtomicString;
  readonly previous_sequence: AtomicString | null;
  readonly server_time_ms: number;
  readonly snapshot_id?: string;
}

export interface PageRequest {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface PageInfo {
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

export interface PublicOperationError {
  readonly code: PlatformPublicErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly retry_after_ms?: number;
  readonly operation_id?: string;
}

/** One operation currently callable through the live v2 gateway. */
export interface LivePlatformCapability {
  readonly id: PlatformCapabilityId;
  readonly risk: CapabilityRisk;
  readonly required_scope: string;
  readonly transports: readonly PlatformTransport[];
  readonly mcp_exposure: McpExposure;
}

/** Live discovery is authorization; the static implementation model is not. */
export interface PlatformDiscoveryResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly authority: PlatformAuthority;
  readonly capabilities: readonly LivePlatformCapability[];
}

export type PlatformNetwork = "solana";

/** Asset identity used by ordinary SDK operations. */
export interface PlatformAsset {
  readonly asset_id: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly logo_url?: string;
  readonly network: PlatformNetwork;
}

export interface PlatformAssetsResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly assets: readonly PlatformAsset[];
  readonly page: PageInfo;
}

export type PlatformMarketAction =
  | "quote"
  | "execute_immediate"
  | "place_order"
  | "schedule_twap";

/** Stable market metadata for public SDK operations. */
export interface PlatformMarket {
  readonly market_id: string;
  readonly label: string;
  readonly base_asset_id: string;
  readonly quote_asset_id: string;
  readonly status: PlatformMarketState;
  readonly available_actions: readonly PlatformMarketAction[];
}

export interface PlatformMarketsResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly markets: readonly PlatformMarket[];
  readonly page: PageInfo;
}

export interface PlatformBookLevel {
  readonly price_atoms: AtomicString;
  readonly size_atoms: AtomicString;
}

export type PlatformBookSide = "bid" | "ask";

export interface PlatformBookChange {
  readonly side: PlatformBookSide;
  readonly price_atoms: AtomicString;
  /** Zero removes this price level. */
  readonly size_atoms: AtomicString;
}

export interface PlatformBookSnapshotResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly market_id: PlatformEntityId;
  readonly stream_id: string;
  readonly sequence: AtomicString;
  readonly server_time_ms: number;
  readonly snapshot_id: string;
  readonly bids: readonly PlatformBookLevel[];
  readonly asks: readonly PlatformBookLevel[];
}

export interface PlatformBestBidAskResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly market_id: PlatformEntityId;
  readonly stream_id: string;
  readonly sequence: AtomicString;
  readonly server_time_ms: number;
  readonly best_bid: PlatformBookLevel | null;
  readonly best_ask: PlatformBookLevel | null;
}

export interface PlatformFeeScheduleResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly market_id: PlatformEntityId;
  readonly server_time_ms: number;
  readonly passive_maker_fee_bps: number;
  readonly maximum_immediate_execution_fee_bps: number;
  readonly book_prices_include_trading_fees: boolean;
  readonly exact_fee_returned_by_quote: boolean;
}

export interface PlatformMarketStatusResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly market_id: PlatformEntityId;
  readonly server_time_ms: number;
  readonly status: PlatformMarketState;
  readonly tick_size_atoms: AtomicString;
  readonly minimum_order_size_atoms: AtomicString;
}

export type PlatformTradeSide = "buy" | "sell";

export interface PlatformTrade {
  readonly trade_id: string;
  readonly side: PlatformTradeSide;
  readonly price_atoms: AtomicString;
  readonly size_atoms: AtomicString;
  readonly executed_at_ms: number;
}

export interface PlatformTradesResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly market_id: PlatformEntityId;
  readonly server_time_ms: number;
  readonly trades: readonly PlatformTrade[];
}

export type PlatformMarketDataEvent =
  | ({ readonly type: "book_snapshot" } & PlatformBookSnapshotResponse)
  | {
      readonly type: "book_delta";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly stream_id: string;
      readonly sequence: AtomicString;
      readonly previous_sequence: AtomicString;
      readonly server_time_ms: number;
      readonly changes: readonly PlatformBookChange[];
    }
  | {
      readonly type: "trade";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly server_time_ms: number;
      readonly trade: PlatformTrade;
    }
  | ({ readonly type: "best_bid_ask" } & PlatformBestBidAskResponse)
  | {
      readonly type: "market_status";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly server_time_ms: number;
      readonly status: PlatformMarketState;
    }
  | {
      readonly type: "heartbeat";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly server_time_ms: number;
    };

export interface PlatformBookView {
  readonly market_id: PlatformEntityId;
  readonly stream_id: string;
  readonly sequence: AtomicString;
  readonly server_time_ms: number;
  readonly bids: readonly PlatformBookLevel[];
  readonly asks: readonly PlatformBookLevel[];
  /** True when this view follows a reconnect or sequence-gap recovery. */
  readonly recovered: boolean;
}

export type PlatformAccountOrderType =
  | "good_until_cancelled"
  | "immediate_or_cancel"
  | "fill_or_kill"
  | "post_only";

export interface PlatformAccountOrder {
  readonly order_id: PlatformEntityId;
  readonly side: PlatformTradeSide;
  readonly order_type: PlatformAccountOrderType;
  readonly state: PlatformOrderState;
  readonly limit_price_atoms: AtomicString;
  readonly original_size_atoms: AtomicString;
  readonly remaining_size_atoms: AtomicString;
}

export type PlatformOrderAction = "place" | "cancel" | "cancel_all" | "replace" | "batch";
export type PlatformRestingOrderType = "good_until_cancelled" | "post_only";

export type PlatformOrderBatchOperation =
  | {
      readonly action: "place";
      readonly accountSequence: AtomicString | bigint;
      readonly clientOrderId: string;
      readonly side: PlatformTradeSide;
      readonly orderType: PlatformRestingOrderType;
      readonly limitPriceAtoms: AtomicString | bigint;
      readonly sizeAtoms: AtomicString | bigint;
    }
  | {
      readonly action: "cancel";
      readonly orderId: PlatformEntityId;
    }
  | {
      readonly action: "replace";
      readonly orderId: PlatformEntityId;
      readonly accountSequence: AtomicString | bigint;
      readonly clientOrderId: string;
      readonly side: PlatformTradeSide;
      readonly orderType: PlatformRestingOrderType;
      readonly limitPriceAtoms: AtomicString | bigint;
      readonly sizeAtoms: AtomicString | bigint;
    };

export type PlatformOrderChallengeInput =
  | {
      readonly action: "place";
      readonly ownerWallet: string;
      readonly sessionPublicKey: string;
      readonly accountSequence: AtomicString | bigint;
      readonly clientOrderId: string;
      readonly side: PlatformTradeSide;
      readonly orderType: PlatformRestingOrderType;
      readonly limitPriceAtoms: AtomicString | bigint;
      readonly sizeAtoms: AtomicString | bigint;
    }
  | {
      readonly action: "cancel";
      readonly ownerWallet: string;
      readonly sessionPublicKey: string;
      readonly orderId: PlatformEntityId;
    }
  | {
      readonly action: "cancel_all";
      readonly ownerWallet: string;
      readonly sessionPublicKey: string;
    }
  | {
      readonly action: "replace";
      readonly ownerWallet: string;
      readonly sessionPublicKey: string;
      readonly orderId: PlatformEntityId;
      readonly accountSequence: AtomicString | bigint;
      readonly clientOrderId: string;
      readonly side: PlatformTradeSide;
      readonly orderType: PlatformRestingOrderType;
      readonly limitPriceAtoms: AtomicString | bigint;
      readonly sizeAtoms: AtomicString | bigint;
    }
  | {
      readonly action: "batch";
      readonly ownerWallet: string;
      readonly sessionPublicKey: string;
      readonly operations: readonly PlatformOrderBatchOperation[];
    };

export interface PlatformOrderChallengeResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly challenge_id: string;
  readonly market_id: PlatformEntityId;
  readonly action: PlatformOrderAction;
  readonly order_ids: readonly PlatformEntityId[];
  readonly authorization_payload_base64: string;
  readonly server_time_ms: number;
  readonly expires_at_ms: number;
}

export interface PlatformOrderPrepareInput {
  readonly challengeId: string;
  readonly authorizationSignature: string;
}

export interface PlatformOrderPrepareResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly order_control_id: string;
  readonly market_id: PlatformEntityId;
  readonly action: PlatformOrderAction;
  readonly order_ids: readonly PlatformEntityId[];
  readonly transaction_base64: string;
  readonly recent_blockhash: string;
  readonly last_valid_block_height: number;
  readonly expires_at_ms: number;
}

export interface PlatformOrderSubmitInput {
  readonly orderControlId: string;
  readonly signedTransactionBase64: string;
  readonly idempotencyKey: string;
}

export interface PlatformOrderSubmitResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly order_control_id: string;
  readonly market_id: PlatformEntityId;
  readonly action: PlatformOrderAction;
  readonly order_ids: readonly PlatformEntityId[];
  readonly signature: string;
  readonly status: "submitted";
}

export interface PlatformOrderStatusInput {
  readonly orderControlId: string;
  readonly idempotencyKey: string;
}

export type PlatformOrderControlStatus = "submitting" | "submitted" | "failed";

export interface PlatformOrderStatusResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly order_control_id: string;
  readonly market_id: PlatformEntityId;
  readonly action: PlatformOrderAction;
  readonly order_ids: readonly PlatformEntityId[];
  readonly signature: string;
  readonly status: PlatformOrderControlStatus;
  readonly failure_code: string | null;
  readonly updated_at_ms: number;
}

export type PlatformSelfTradePrevention =
  | "cancel_taker"
  | "cancel_maker"
  | "cancel_both"
  | "skip_own_liquidity";

export type PlatformOrderBatchOperationWire =
  | {
      readonly action: "place";
      readonly account_sequence: AtomicString;
      readonly client_order_id: string;
      readonly side: PlatformTradeSide;
      readonly order_type: PlatformRestingOrderType;
      readonly limit_price_atoms: AtomicString;
      readonly size_atoms: AtomicString;
    }
  | { readonly action: "cancel"; readonly order_id: PlatformEntityId }
  | {
      readonly action: "replace";
      readonly order_id: PlatformEntityId;
      readonly account_sequence: AtomicString;
      readonly client_order_id: string;
      readonly side: PlatformTradeSide;
      readonly order_type: PlatformRestingOrderType;
      readonly limit_price_atoms: AtomicString;
      readonly size_atoms: AtomicString;
    };

export type PlatformOrderChallengeWire =
  | ({
      readonly action: "place";
      readonly account_sequence: AtomicString;
      readonly client_order_id: string;
      readonly side: PlatformTradeSide;
      readonly order_type: PlatformRestingOrderType;
      readonly limit_price_atoms: AtomicString;
      readonly size_atoms: AtomicString;
    } & PlatformOrderWireIdentity)
  | ({ readonly action: "cancel"; readonly order_id: PlatformEntityId } &
      PlatformOrderWireIdentity)
  | ({ readonly action: "cancel_all" } & PlatformOrderWireIdentity)
  | ({
      readonly action: "replace";
      readonly order_id: PlatformEntityId;
      readonly account_sequence: AtomicString;
      readonly client_order_id: string;
      readonly side: PlatformTradeSide;
      readonly order_type: PlatformRestingOrderType;
      readonly limit_price_atoms: AtomicString;
      readonly size_atoms: AtomicString;
    } & PlatformOrderWireIdentity)
  | ({ readonly action: "batch"; readonly operations: readonly PlatformOrderBatchOperationWire[] } &
      PlatformOrderWireIdentity);

interface PlatformOrderWireIdentity {
  readonly owner_wallet: string;
  readonly session_public_key: string;
}

export type PlatformDeadManStatus =
  | "armed"
  | "triggering"
  | "triggered"
  | "disarmed"
  | "expired"
  | "failed";

export interface PlatformDeadManState {
  readonly status: PlatformDeadManStatus;
  readonly timeout_ms: number;
  readonly heartbeat_deadline_ms: number;
  readonly order_control_id: string | null;
  readonly signature: string | null;
  readonly failure_code: string | null;
  readonly updated_at_ms: number;
}

interface PlatformOrderCommandEnvelope {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly market_id: PlatformEntityId;
  readonly server_time_ms: number;
}

interface PlatformOrderCommandSequence extends PlatformOrderCommandEnvelope {
  readonly stream_id: string;
  readonly sequence: AtomicString;
  readonly previous_sequence: AtomicString;
}

export type PlatformOrderCommandEvent =
  | (PlatformOrderCommandEnvelope & {
      readonly type: "auth_challenge";
      readonly challenge: string;
      readonly expires_at_ms: number;
    })
  | (Omit<PlatformOrderCommandSequence, "previous_sequence"> & { readonly type: "ready" })
  | (PlatformOrderCommandSequence & {
      readonly type: "challenge_result";
      readonly request_id: string;
      readonly self_trade_prevention: PlatformSelfTradePrevention;
      readonly prevented_order_ids: readonly PlatformEntityId[];
      readonly effective_request: PlatformOrderChallengeWire;
      readonly response: PlatformOrderChallengeResponse;
    })
  | (PlatformOrderCommandSequence & {
      readonly type: "prepare_result";
      readonly request_id: string;
      readonly response: PlatformOrderPrepareResponse;
    })
  | (PlatformOrderCommandSequence & {
      readonly type: "submit_result";
      readonly request_id: string;
      readonly response: PlatformOrderSubmitResponse;
    })
  | (PlatformOrderCommandSequence & {
      readonly type: "status_result";
      readonly request_id: string;
      readonly response: PlatformOrderStatusResponse;
    })
  | (PlatformOrderCommandSequence & {
      readonly type: "dead_man_result";
      readonly request_id: string;
      readonly state: PlatformDeadManState;
    })
  | (PlatformOrderCommandSequence & {
      readonly type: "command_error";
      readonly request_id: string;
      readonly error: PublicOperationError;
    })
  | (PlatformOrderCommandSequence & { readonly type: "heartbeat" });

export interface PlatformOrderVerificationContext {
  readonly challenge: PlatformOrderChallengeResponse;
  readonly prepared: PlatformOrderPrepareResponse;
  readonly ownerWallet: string;
  readonly sessionPublicKey: string;
}

export type PlatformOrderExecuteOperation =
  | Omit<Extract<PlatformOrderChallengeInput, { action: "place" }>, "sessionPublicKey">
  | Omit<Extract<PlatformOrderChallengeInput, { action: "cancel" }>, "sessionPublicKey">
  | Omit<Extract<PlatformOrderChallengeInput, { action: "cancel_all" }>, "sessionPublicKey">
  | Omit<Extract<PlatformOrderChallengeInput, { action: "replace" }>, "sessionPublicKey">
  | Omit<Extract<PlatformOrderChallengeInput, { action: "batch" }>, "sessionPublicKey">;

export interface PlatformOrderExecuteInput {
  readonly operation: PlatformOrderExecuteOperation;
  readonly signer: StrataSessionSigner;
  /** Mandatory owner-side verification before any transaction signature. */
  verifyTransaction(context: PlatformOrderVerificationContext): void | Promise<void>;
  readonly idempotencyKey?: string;
}

export interface PlatformAccountFill {
  readonly fill_id: PlatformEntityId;
  readonly side: PlatformTradeSide;
  readonly price_atoms: AtomicString;
  readonly size_atoms: AtomicString;
  readonly fee_quote_atoms: AtomicString;
  readonly fee_is_final: boolean;
  readonly settlement: PlatformSettlementState;
  readonly executed_at_ms: number;
  readonly confirmed_at_ms: number | null;
  readonly transaction_id: string | null;
  readonly realized_pnl_quote_atoms: SignedAtomicString;
}

export interface PlatformAccountSnapshotResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly market_id: PlatformEntityId;
  readonly wallet_address: string;
  readonly server_time_ms: number;
  readonly orders: readonly PlatformAccountOrder[];
  readonly fills: readonly PlatformAccountFill[];
}

export interface PlatformAccountSnapshot {
  readonly wallet_address: string;
  readonly server_time_ms: number;
  readonly markets: readonly PlatformAccountSnapshotResponse[];
}

export type PlatformAccountEvent =
  | {
      readonly type: "auth_challenge";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly wallet_address: string;
      readonly challenge: string;
      readonly server_time_ms: number;
      readonly expires_at_ms: number;
    }
  | {
      readonly type: "account_snapshot";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly wallet_address: string;
      readonly stream_id: string;
      readonly sequence: AtomicString;
      readonly server_time_ms: number;
      readonly orders: readonly PlatformAccountOrder[];
      readonly fills: readonly PlatformAccountFill[];
    }
  | {
      readonly type: "orders_snapshot";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly wallet_address: string;
      readonly stream_id: string;
      readonly sequence: AtomicString;
      readonly previous_sequence: AtomicString;
      readonly server_time_ms: number;
      readonly orders: readonly PlatformAccountOrder[];
    }
  | {
      readonly type: "fill";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly wallet_address: string;
      readonly stream_id: string;
      readonly sequence: AtomicString;
      readonly previous_sequence: AtomicString;
      readonly server_time_ms: number;
      readonly fill: PlatformAccountFill;
    }
  | {
      readonly type: "heartbeat";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly wallet_address: string;
      readonly stream_id: string;
      readonly sequence: AtomicString;
      readonly previous_sequence: AtomicString;
      readonly server_time_ms: number;
    };

export interface PlatformAccountView {
  readonly market_id: PlatformEntityId;
  readonly wallet_address: string;
  readonly stream_id: string;
  readonly sequence: AtomicString;
  readonly server_time_ms: number;
  readonly orders: readonly PlatformAccountOrder[];
  readonly fills: readonly PlatformAccountFill[];
  readonly recovered: boolean;
}

/** External message signer. The corresponding private key never enters Strata. */
export interface PlatformAccountSigner {
  readonly publicKey: string;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}
