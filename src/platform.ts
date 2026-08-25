import type {
  AtomicString,
  CapabilityRisk,
  McpExposure,
  StrataSessionSigner,
} from "./types.js";

export const PLATFORM_SCHEMA_VERSION = 2 as const;
export const PLATFORM_CONTRACT_VERSION = "2.0" as const;
/**
 * Session policy applied when onboarding does not state one: at most one
 * execution per second per session, and a 1% maximum tolerance.
 */
export const PLATFORM_SESSION_DEFAULT_MINIMUM_INTERVAL_SECONDS = 1 as const;
export const PLATFORM_SESSION_DEFAULT_MAXIMUM_TOLERANCE_BPS = 100 as const;
/** A session carries at most this many spending limits. */
export const PLATFORM_SESSION_MAX_SPENDING_LIMITS = 4 as const;

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

export type PlatformServiceState = "operational" | "degraded";

/** Product-level readiness without exposing private implementation details. */
export interface PlatformServiceStatusResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly status: PlatformServiceState;
  readonly available_operations: number;
}

export type PlatformActionKind =
  | "discovery"
  | "read"
  | "prepare"
  | "external_signature"
  | "submit"
  | "receipt"
  | "stream";

export interface PlatformGraphRelation {
  readonly from: string;
  readonly to: string;
  readonly kind: string;
}

export interface PlatformGraphModuleDescriptor {
  readonly id: string;
  readonly client_property: string;
  readonly capability_ids: readonly PlatformCapabilityId[];
}

export type PlatformOperationTransport =
  | { readonly transport: "http"; readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; readonly path: string }
  | { readonly transport: "websocket"; readonly path: string }
  | { readonly transport: "mcp"; readonly tool: string };

export interface PlatformOperation {
  readonly id: string;
  readonly capability_id: PlatformCapabilityId;
  readonly kind: PlatformActionKind;
  readonly summary: string;
  readonly transports: readonly PlatformOperationTransport[];
  readonly available: boolean;
}

export interface PlatformWorkflowNode {
  readonly id: string;
  readonly kind: PlatformActionKind;
  readonly capability_id: PlatformCapabilityId | null;
  readonly operation_ids: readonly string[];
  readonly available: boolean;
}

export interface PlatformWorkflowEdge {
  readonly from: string;
  readonly to: string;
  readonly condition: string;
}

export interface PlatformWorkflow {
  readonly id: string;
  readonly entry_node: string;
  readonly nodes: readonly PlatformWorkflowNode[];
  readonly edges: readonly PlatformWorkflowEdge[];
}

/** Customer-safe entity, operation, and workflow graph projected from live capabilities. */
export interface PlatformActionGraphResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly graph_version: "2.0";
  readonly entry_operation_id: string;
  readonly authority: PlatformAuthority;
  readonly entities: readonly string[];
  readonly relations: readonly PlatformGraphRelation[];
  readonly modules: readonly PlatformGraphModuleDescriptor[];
  readonly operations: readonly PlatformOperation[];
  readonly workflows: readonly PlatformWorkflow[];
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

export interface PlatformSwapQuoteInput {
  readonly inputAssetId: PlatformEntityId;
  readonly outputAssetId: PlatformEntityId;
  readonly amountInAtoms: AtomicString | bigint;
  /** Defaults to zero for an exact quoted minimum. */
  readonly maximumToleranceBps?: number;
}

export interface PlatformSwapQuoteResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly quote_id: string;
  readonly server_time_ms: number;
  readonly expires_at_ms: number;
  readonly input_asset_id: PlatformEntityId;
  readonly output_asset_id: PlatformEntityId;
  readonly amount_in_atoms: AtomicString;
  readonly amount_in_consumed_atoms: AtomicString;
  readonly amount_out_atoms: AtomicString;
  readonly minimum_output_atoms: AtomicString;
  readonly input_fee_atoms: AtomicString;
  readonly output_fee_atoms: AtomicString;
  readonly maximum_tolerance_bps: number;
  readonly reference_price: string;
  readonly price_impact_pct: string;
  readonly provider: "Sonar";
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
  /** Smallest accepted base-asset quantity: one atom. This is not a price or lot denominator. */
  readonly minimum_order_size_atoms: AtomicString;
}

/** Decimal prices remain strings so no SDK boundary silently rounds money. */
export interface PlatformCandle {
  readonly started_at_ms: number;
  readonly open_price: string;
  readonly high_price: string;
  readonly low_price: string;
  readonly close_price: string;
}

export interface PlatformCandlesResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly market_id: PlatformEntityId;
  readonly server_time_ms: number;
  readonly resolution_seconds: number;
  readonly candles: readonly PlatformCandle[];
}

export interface PlatformMarkResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly market_id: PlatformEntityId;
  readonly server_time_ms: number;
  readonly price_atoms_per_base_unit: AtomicString | null;
  readonly quote_decimals: number;
  readonly stale: boolean;
  readonly age_ms: number | null;
}

export type PlatformExecutionState = "prepared" | "confirmed";

/** Confirmed receipts survive a market-service restart. */
export interface PlatformExecutionStatusResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly execution_id: string;
  readonly market_id: PlatformEntityId;
  readonly status: PlatformExecutionState;
  readonly signature: string | null;
  readonly settlement: PlatformSettlementState;
  readonly updated_at_ms: number;
}

export type PlatformTwapState = "active" | "completed" | "cancelled";

export interface PlatformTwapFill {
  readonly fill_id: string;
  readonly size_atoms: AtomicString;
  readonly price_atoms: AtomicString;
  readonly gross_quote_atoms: AtomicString;
  readonly base_fee_atoms: AtomicString;
  readonly quote_fee_atoms: AtomicString;
  readonly signature: string | null;
  readonly observed_at_ms: number;
}

export interface PlatformTwap {
  readonly twap_id: string;
  readonly side: PlatformTradeSide;
  readonly status: PlatformTwapState;
  readonly slices_total: number;
  readonly slices_executed: number;
  readonly interval_slots: number;
  readonly maximum_tolerance_bps: number;
  readonly limit_price_atoms: AtomicString;
  readonly total_size_atoms: AtomicString;
  readonly executed_size_atoms: AtomicString;
  readonly gross_quote_executed_atoms: AtomicString;
  readonly complete_execution_value: boolean;
  readonly created_at_ms: number;
  readonly completed_at_ms: number | null;
  readonly placed_signature: string | null;
  readonly terminal_signature: string | null;
  readonly fills: readonly PlatformTwapFill[];
}

export interface PlatformTwapsResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly market_id: PlatformEntityId;
  readonly wallet_address: string;
  readonly server_time_ms: number;
  readonly twaps: readonly PlatformTwap[];
}

export type PlatformTwapControlAction = "place" | "cancel";

export type PlatformTwapChallengeInput =
  | {
      readonly action: "place";
      readonly ownerWallet: string;
      readonly sessionPublicKey: string;
      readonly side: PlatformTradeSide;
      readonly totalSizeAtoms: AtomicString | bigint;
      readonly slicesTotal: number;
      readonly maximumToleranceBps: number;
      readonly intervalSlots: number;
      readonly limitPriceAtoms: AtomicString | bigint;
    }
  | {
      readonly action: "cancel";
      readonly ownerWallet: string;
      readonly sessionPublicKey: string;
      readonly twapId: string;
    };

export interface PlatformTwapChallengeResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly challenge_id: string;
  readonly market_id: PlatformEntityId;
  readonly action: PlatformTwapControlAction;
  readonly twap_id: string;
  readonly authorization_payload_base64: string;
  readonly server_time_ms: number;
  readonly expires_at_ms: number;
}

/**
 * Prepare a TWAP-control transaction: a signed challenge (two-step) or the
 * action itself (direct, one signature — the session's transaction signature
 * is the authorization). The response is identical.
 */
export type PlatformTwapPrepareInput =
  | {
      readonly challengeId: string;
      readonly authorizationSignature: string;
    }
  | {
      readonly operation: PlatformTwapChallengeInput;
    };

export interface PlatformTwapPrepareResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly twap_control_id: string;
  readonly market_id: PlatformEntityId;
  readonly action: PlatformTwapControlAction;
  readonly twap_id: string;
  readonly transaction_base64: string;
  readonly recent_blockhash: string;
  readonly last_valid_block_height: number;
  readonly expires_at_ms: number;
}

export interface PlatformTwapSubmitInput {
  readonly twapControlId: string;
  readonly signedTransactionBase64: string;
  readonly idempotencyKey: string;
}

export interface PlatformTwapSubmitResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly twap_control_id: string;
  readonly market_id: PlatformEntityId;
  readonly action: PlatformTwapControlAction;
  readonly twap_id: string;
  readonly signature: string;
  readonly status: "submitted";
}

export interface PlatformTwapVerificationContext {
  /** Present only on the two-step (challenge) path. */
  readonly challenge?: PlatformTwapChallengeResponse;
  /** The requested action, exactly as sent. */
  readonly operation?: PlatformTwapChallengeInput;
  readonly marketId?: PlatformEntityId;
  readonly prepared: PlatformTwapPrepareResponse;
  readonly ownerWallet: string;
  readonly sessionPublicKey: string;
}

export type PlatformTwapExecuteOperation =
  | Omit<Extract<PlatformTwapChallengeInput, { action: "place" }>, "sessionPublicKey">
  | Omit<Extract<PlatformTwapChallengeInput, { action: "cancel" }>, "sessionPublicKey">;

export interface PlatformTwapExecuteInput {
  readonly operation: PlatformTwapExecuteOperation;
  readonly signer: StrataSessionSigner;
  /**
   * Optional owner-side verification before the transaction signature. When
   * omitted the SDK's built-in `verifyTwapTransaction` runs (session co-signs
   * only delegated TWAP instructions and never pays; echoed bindings checked).
   */
  verifyTransaction?(context: PlatformTwapVerificationContext): void | Promise<void>;
  readonly idempotencyKey?: string;
}

/** One watched immediate execution as the execution stream sees it. */
export interface PlatformExecutionRow {
  readonly execution_id: string;
  readonly market_id: PlatformEntityId;
  readonly status: PlatformExecutionState;
  readonly signature: string | null;
  readonly settlement: PlatformSettlementState;
  readonly updated_at_ms: number;
}

export type PlatformExecutionEvent =
  | {
      readonly type: "executions_snapshot";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly stream_id: string;
      readonly sequence: AtomicString;
      readonly server_time_ms: number;
      readonly executions: readonly PlatformExecutionRow[];
      readonly unknown_execution_ids: readonly string[];
    }
  | {
      readonly type: "execution_update";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly stream_id: string;
      readonly sequence: AtomicString;
      readonly previous_sequence: AtomicString;
      readonly server_time_ms: number;
      readonly execution: PlatformExecutionRow;
    }
  | {
      readonly type: "execution_expired" | "execution_unknown";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly stream_id: string;
      readonly sequence: AtomicString;
      readonly previous_sequence: AtomicString;
      readonly server_time_ms: number;
      readonly execution_id: string;
    }
  | {
      readonly type: "heartbeat";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly stream_id: string;
      readonly sequence: AtomicString;
      readonly previous_sequence: AtomicString;
      readonly server_time_ms: number;
    };

/** Client-side view of the watched executions in one market after each sequenced event. */
export interface PlatformExecutionsView {
  readonly market_id: PlatformEntityId;
  readonly stream_id: string;
  readonly sequence: AtomicString;
  readonly server_time_ms: number;
  readonly executions: readonly PlatformExecutionRow[];
  /** Watched handles this market never issued, no longer remembers, or that expired unconfirmed. */
  readonly unknown_execution_ids: readonly string[];
  /** True when this view came from a recovery snapshot after a gap or reconnect. */
  readonly recovered: boolean;
}

export type PlatformTwapEvent =
  | {
      readonly type: "twaps_snapshot";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly wallet_address: string;
      readonly stream_id: string;
      readonly sequence: AtomicString;
      readonly server_time_ms: number;
      readonly twaps: readonly PlatformTwap[];
    }
  | {
      readonly type: "twap_update";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly wallet_address: string;
      readonly stream_id: string;
      readonly sequence: AtomicString;
      readonly previous_sequence: AtomicString;
      readonly server_time_ms: number;
      readonly twap: PlatformTwap;
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

/** Client-side view of one wallet's TWAP schedules in one market after each sequenced event. */
export interface PlatformTwapsView {
  readonly market_id: PlatformEntityId;
  readonly wallet_address: string;
  readonly stream_id: string;
  readonly sequence: AtomicString;
  readonly server_time_ms: number;
  readonly twaps: readonly PlatformTwap[];
  /** True when this view came from a recovery snapshot after a gap or reconnect. */
  readonly recovered: boolean;
}

export type PlatformPortfolioHistoryRange = "24h" | "7d" | "30d";

export interface PlatformPortfolioHistoryPoint {
  readonly recorded_at_ms: number;
  readonly equity_usd_micros: AtomicString;
  readonly available_usd_micros: AtomicString;
  readonly locked_usd_micros: AtomicString;
  readonly market_count: number;
}

export interface PlatformPortfolioHistoryResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly wallet_address: string;
  readonly server_time_ms: number;
  readonly range: PlatformPortfolioHistoryRange;
  readonly points: readonly PlatformPortfolioHistoryPoint[];
  readonly collecting: boolean;
  readonly first_sample_ms: number | null;
  readonly last_sample_ms: number | null;
}

/**
 * One asset the owner holds on Strata, across every live market. A balance is
 * a balance: `total` is what the owner has, `available` is free to trade or
 * withdraw, `locked` is what resting orders reserve.
 */
export interface PlatformPortfolioBalance {
  readonly asset_id: PlatformEntityId;
  /** Holdings not reserved by resting orders. */
  readonly available_atoms: AtomicString;
  /** Holdings reserved by resting orders. */
  readonly locked_atoms: AtomicString;
  /** `available_atoms + locked_atoms`. */
  readonly total_atoms: AtomicString;
  /** Exact USD micros for `total_atoms`, or null without a fresh public mark. */
  readonly value_usd_micros: AtomicString | null;
}

/** One open order, tagged with the market it rests in. */
export interface PlatformPortfolioOrder extends PlatformAccountOrder {
  readonly market_id: PlatformEntityId;
}

/** One recent fill, tagged with the market it happened in. */
export interface PlatformPortfolioFill extends PlatformAccountFill {
  readonly market_id: PlatformEntityId;
}

export interface PlatformPortfolioPosition {
  readonly market_id: PlatformEntityId;
  readonly base_asset_id: PlatformEntityId;
  readonly quote_asset_id: PlatformEntityId;
  readonly base_available_atoms: AtomicString;
  readonly base_locked_atoms: AtomicString;
  readonly quote_available_atoms: AtomicString;
  readonly quote_locked_atoms: AtomicString;
}

/**
 * The owner's whole account in one public read, by wallet address: balances,
 * per-market positions, open orders, and recent fills across every live
 * market, plus USD totals. No signature and no market selection is needed.
 * USD totals are null whenever any held asset lacks a fresh public mark.
 */
export interface PlatformPortfolioResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly wallet_address: string;
  readonly server_time_ms: number;
  readonly observed_at_ms: number;
  readonly observed_slot: AtomicString;
  readonly market_count: number;
  readonly balances: readonly PlatformPortfolioBalance[];
  readonly positions: readonly PlatformPortfolioPosition[];
  /** Every open order across every live market. */
  readonly open_orders: readonly PlatformPortfolioOrder[];
  /** Recent fills across every live market, newest first (bounded). */
  readonly recent_fills: readonly PlatformPortfolioFill[];
  /**
   * Markets whose orders and fills could not be read for this snapshot;
   * balances and positions are still complete.
   */
  readonly unavailable_market_ids: readonly PlatformEntityId[];
  /** Sum of every balance's `value_usd_micros`; null unless the valuation is complete. */
  readonly equity_usd_micros: AtomicString | null;
  /** Exact USD value of every available balance; null unless the valuation is complete. */
  readonly available_usd_micros: AtomicString | null;
  /** `equity_usd_micros - available_usd_micros`; null unless the valuation is complete. */
  readonly locked_usd_micros: AtomicString | null;
  readonly valuation_complete: boolean;
  readonly unpriced_asset_ids: readonly PlatformEntityId[];
}

export type PlatformVaultState = "absent" | "active" | "paused";
export type PlatformVaultSessionState = "absent" | "active" | "expired";
export type PlatformVaultWithdrawalMode = "unrestricted" | "blocked" | "restricted";

export interface PlatformVaultSpendingLimit {
  readonly asset_id: PlatformEntityId;
  /** Null means this session has no per-execution ceiling for the asset. */
  readonly maximum_per_execution_atoms: AtomicString | null;
}

export interface PlatformVaultSessionStatus {
  readonly session_public_key: string;
  readonly state: PlatformVaultSessionState;
  readonly expires_at_ms: number | null;
  readonly permanent: boolean;
  readonly minimum_interval_seconds: number;
  readonly maximum_tolerance_bps: number;
  readonly last_execution_at_ms: number | null;
  readonly market_execution_ready: boolean;
  readonly price_protection_active: boolean;
  readonly spending_limits: readonly PlatformVaultSpendingLimit[];
}

export interface PlatformVaultWithdrawalAccess {
  readonly mode: PlatformVaultWithdrawalMode;
  readonly allowed_wallet_addresses: readonly string[];
}

export interface PlatformVaultStatusInput {
  readonly walletAddress: string;
  /** Omit to read owner state without inspecting a particular external session. */
  readonly sessionPublicKey?: string;
}

export interface PlatformVaultStatusResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly wallet_address: string;
  readonly state: PlatformVaultState;
  readonly session: PlatformVaultSessionStatus | null;
  readonly withdrawal_access: PlatformVaultWithdrawalAccess;
}

export interface PlatformVaultPausePrepareInput {
  readonly walletAddress: string;
  readonly paused: boolean;
}

export interface PlatformVaultPausePrepareResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly wallet_address: string;
  readonly paused: boolean;
  readonly transaction_base64: string;
  readonly recent_blockhash: string;
  readonly owner_signature_required: true;
  /**
   * Opaque handle for this prepared transaction. Hand it back with the
   * owner-signed transaction to `vault.submit` and Strata submits it — no RPC
   * or SOL needed on the owner side.
   */
  readonly preparation_id: string;
  /**
   * `true` when Strata is the fee payer and covers any rent the action
   * creates, so the owner needs no SOL at all; `false` when the owner wallet
   * pays (Strata still submits it on request).
   */
  readonly sponsored: boolean;
  /** Submit before this server time. */
  readonly submit_by_ms: number;
}

export type PlatformVaultAction =
  | "setup"
  | "deposit"
  | "withdraw"
  | "delegate"
  | "policy"
  | "pause";
export type PlatformVaultSubmissionStatus = "submitted" | "confirmed" | "failed";

/** Durable outcome of a submitted Vault transaction (`vault.relay`). */
export interface PlatformVaultSubmitResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly preparation_id: string;
  readonly action: PlatformVaultAction;
  readonly wallet_address: string;
  readonly sponsored: boolean;
  readonly signature: string;
  readonly status: PlatformVaultSubmissionStatus;
  /** Present only when `status` is `failed`. */
  readonly failure_code: string | null;
  readonly updated_at_ms: number;
}

export type PlatformVaultSetupMode = "create" | "replace_session";

export interface PlatformVaultSetupSpendingLimitInput {
  readonly assetId: PlatformEntityId;
  /** Null or omitted means no per-execution ceiling for this asset. */
  readonly maximumPerExecutionAtoms?: AtomicString | bigint | null | undefined;
}

/**
 * One-signature onboarding: only the wallet and the external session key are
 * required. One session then trades every market. Everything else is an
 * optional policy on top; absent values take the product defaults.
 */
export interface PlatformVaultSetupPrepareInput {
  readonly walletAddress: string;
  readonly sessionPublicKey: string;
  /** Old session to revoke atomically while registering the new one. */
  readonly replaceSessionPublicKey?: string | null | undefined;
  /**
   * Optional. Names the market whose price protection the session pins when
   * the product has one; the session trades every market either way.
   */
  readonly marketId?: PlatformEntityId | null | undefined;
  /** Null or omitted requests the product's permanent session expiry. */
  readonly expiresAtMs?: number | null | undefined;
  /** Omitted takes PLATFORM_SESSION_DEFAULT_MINIMUM_INTERVAL_SECONDS. */
  readonly minimumIntervalSeconds?: number | undefined;
  /** Omitted takes PLATFORM_SESSION_DEFAULT_MAXIMUM_TOLERANCE_BPS. */
  readonly maximumToleranceBps?: number | undefined;
  /** Optional per-asset ceilings, at most four. Assets without one are unlimited. */
  readonly spendingLimits?: readonly PlatformVaultSetupSpendingLimitInput[] | undefined;
}

export interface PlatformVaultSetupPrepareResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly wallet_address: string;
  readonly session_public_key: string;
  /** The old session requested for atomic replacement, if any. */
  readonly replace_session_public_key: string | null;
  /** The market named in the request, if any. */
  readonly market_id: PlatformEntityId | null;
  readonly mode: PlatformVaultSetupMode;
  readonly expires_at_ms: number | null;
  readonly permanent: boolean;
  /** The applied policy, defaults resolved. */
  readonly minimum_interval_seconds: number;
  readonly maximum_tolerance_bps: number;
  readonly spending_limits: readonly PlatformVaultSpendingLimit[];
  readonly transaction_base64: string;
  readonly recent_blockhash: string;
  readonly owner_signature_required: true;
  /**
   * Opaque handle for this prepared transaction. Hand it back with the
   * owner-signed transaction to `vault.submit` and Strata submits it — no RPC
   * or SOL needed on the owner side.
   */
  readonly preparation_id: string;
  /**
   * `true` when Strata is the fee payer and covers any rent the action
   * creates, so the owner needs no SOL at all; `false` when the owner wallet
   * pays (Strata still submits it on request).
   */
  readonly sponsored: boolean;
  /** Submit before this server time. */
  readonly submit_by_ms: number;
}

export type PlatformVaultDelegateAction = "revoke";

export interface PlatformVaultDelegatePrepareInput {
  readonly walletAddress: string;
  readonly sessionPublicKey: string;
  readonly action: PlatformVaultDelegateAction;
}

export interface PlatformVaultDelegatePrepareResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly wallet_address: string;
  readonly session_public_key: string;
  readonly action: PlatformVaultDelegateAction;
  readonly transaction_base64: string;
  readonly recent_blockhash: string;
  readonly owner_signature_required: true;
  /**
   * Opaque handle for this prepared transaction. Hand it back with the
   * owner-signed transaction to `vault.submit` and Strata submits it — no RPC
   * or SOL needed on the owner side.
   */
  readonly preparation_id: string;
  /**
   * `true` when Strata is the fee payer and covers any rent the action
   * creates, so the owner needs no SOL at all; `false` when the owner wallet
   * pays (Strata still submits it on request).
   */
  readonly sponsored: boolean;
  /** Submit before this server time. */
  readonly submit_by_ms: number;
}

export interface PlatformVaultPolicyPrepareInput {
  readonly walletAddress: string;
  readonly withdrawalAccess: {
    readonly mode: "blocked" | "restricted";
    readonly allowedWalletAddresses: readonly string[];
  };
}

export interface PlatformVaultPolicyPrepareResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly wallet_address: string;
  readonly withdrawal_access: PlatformVaultWithdrawalAccess;
  readonly transaction_base64: string;
  readonly recent_blockhash: string;
  readonly owner_signature_required: true;
  /**
   * Opaque handle for this prepared transaction. Hand it back with the
   * owner-signed transaction to `vault.submit` and Strata submits it — no RPC
   * or SOL needed on the owner side.
   */
  readonly preparation_id: string;
  /**
   * `true` when Strata is the fee payer and covers any rent the action
   * creates, so the owner needs no SOL at all; `false` when the owner wallet
   * pays (Strata still submits it on request).
   */
  readonly sponsored: boolean;
  /** Submit before this server time. */
  readonly submit_by_ms: number;
}

export interface PlatformVaultDepositPrepareInput {
  readonly walletAddress: string;
  readonly marketId: PlatformEntityId;
  readonly assetId: PlatformEntityId;
  readonly amountAtoms: AtomicString | bigint;
  /**
   * Optional external session key. When it is not yet registered for this
   * wallet, the same deposit transaction registers it with the default
   * session policy — a first deposit is the whole onboarding, one owner
   * signature. An already-registered key changes nothing.
   */
  readonly sessionPublicKey?: string | null | undefined;
}

export interface PlatformVaultDepositPrepareResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly wallet_address: string;
  readonly market_id: PlatformEntityId;
  readonly asset_id: PlatformEntityId;
  readonly amount_atoms: AtomicString;
  /**
   * SOL Strata already spent on this owner's sponsored actions, recovered in
   * the deposit asset inside this same transaction. "0" when nothing is owed.
   * Only ever charged when the owner had no SOL and Strata paid instead, and
   * never more than 1% of the deposit.
   */
  readonly network_cost_atoms: AtomicString;
  /** The session key named in the request, if any. */
  readonly session_public_key: string | null;
  /**
   * True when this transaction also registers `session_public_key` with the
   * default session policy (the deposit doubles as onboarding); false when the
   * key was already registered or none was named.
   */
  readonly registers_session: boolean;
  readonly transaction_base64: string;
  readonly recent_blockhash: string;
  readonly owner_signature_required: true;
  /**
   * Opaque handle for this prepared transaction. Hand it back with the
   * owner-signed transaction to `vault.submit` and Strata submits it — no RPC
   * or SOL needed on the owner side.
   */
  readonly preparation_id: string;
  /**
   * `true` when Strata is the fee payer and covers any rent the action
   * creates, so the owner needs no SOL at all; `false` when the owner wallet
   * pays (Strata still submits it on request).
   */
  readonly sponsored: boolean;
  /** Submit before this server time. */
  readonly submit_by_ms: number;
}

export interface PlatformVaultSubmitInput {
  /** `preparation_id` from any `vault.prepare*` response. */
  readonly preparationId: string;
  /** The prepared transaction with the owner's signature added, base64. */
  readonly signedTransactionBase64: string;
  readonly idempotencyKey: string;
}

export interface PlatformVaultWithdrawPrepareInput {
  readonly walletAddress: string;
  readonly marketId: PlatformEntityId;
  readonly assetId: PlatformEntityId;
  readonly destinationWalletAddress: string;
  readonly amountAtoms: AtomicString | bigint;
}

export interface PlatformVaultWithdrawPrepareResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly wallet_address: string;
  readonly market_id: PlatformEntityId;
  readonly asset_id: PlatformEntityId;
  readonly destination_wallet_address: string;
  readonly amount_atoms: AtomicString;
  readonly transaction_base64: string;
  readonly recent_blockhash: string;
  readonly owner_signature_required: true;
  /**
   * Opaque handle for this prepared transaction. Hand it back with the
   * owner-signed transaction to `vault.submit` and Strata submits it — no RPC
   * or SOL needed on the owner side.
   */
  readonly preparation_id: string;
  /**
   * `true` when Strata is the fee payer and covers any rent the action
   * creates, so the owner needs no SOL at all; `false` when the owner wallet
   * pays (Strata still submits it on request).
   */
  readonly sponsored: boolean;
  /** Submit before this server time. */
  readonly submit_by_ms: number;
}

export interface PlatformRewardStanding {
  readonly rank: number;
  readonly wallet_address: string;
  readonly points: AtomicString;
}

export interface PlatformOwnerRewards {
  readonly wallet_address: string;
  readonly rank: number | null;
  readonly points: AtomicString;
  readonly trading_points: AtomicString;
  readonly making_points: AtomicString;
  readonly bug_points: AtomicString;
  readonly referral_points: AtomicString;
}

export interface PlatformRewardsResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly season: string;
  readonly total_wallets: number;
  readonly owner: PlatformOwnerRewards | null;
  readonly standings: readonly PlatformRewardStanding[];
}

export interface PlatformReferralsResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly wallet_address: string;
  readonly enabled: boolean;
  readonly cash_rewards_enabled: boolean;
  readonly referral_code: string | null;
  readonly referred_wallets: number;
  readonly referral_points: AtomicString;
  readonly referred_by: string | null;
  readonly referral_locked: boolean;
  readonly cash_accrued_atoms: AtomicString;
  readonly cash_paid_atoms: AtomicString;
  readonly cash_claimable_atoms: AtomicString;
}

export interface PlatformReferralLinkInput {
  readonly walletAddress: string;
  readonly referralCode: string;
  readonly authorizationSignature: string;
}

export interface PlatformReferralLinkResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly wallet_address: string;
  readonly referral_code: string;
  readonly status: "pending_first_fill";
}

export interface PlatformReferralClaimInput {
  readonly walletAddress: string;
  readonly payoutWalletAddress?: string;
  readonly authorizationSignature: string;
}

export interface PlatformReferralClaimResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly wallet_address: string;
  readonly payout_wallet_address: string;
  readonly claimable_atoms: AtomicString;
  readonly status: "requested";
}

export type PlatformBugStatus = "pending" | "confirmed" | "rejected";

export interface PlatformBugReport {
  readonly bug_id: string;
  readonly status: PlatformBugStatus;
  readonly severity: number;
  readonly points: AtomicString;
  readonly created_at_ms: number;
  readonly triaged_at_ms: number | null;
  readonly completed_at_ms: number | null;
}

export interface PlatformBugsResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly wallet_address: string;
  readonly points: AtomicString;
  readonly confirmed_reports: number;
  readonly reports: readonly PlatformBugReport[];
}

export interface PlatformBugSubmitInput {
  readonly ownerWallet: string;
  readonly message: string;
  /** Hex Ed25519 signature over the value returned by `bugs.authorizationPayload`. */
  readonly authorizationSignature: string;
}

export interface PlatformBugSubmitResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly server_time_ms: number;
  readonly bug_id: string;
  readonly status: "pending";
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

export type PlatformOrderAction =
  | "place"
  | "cancel"
  | "cancel_all"
  | "replace"
  | "batch";
export type PlatformRestingOrderType = "good_until_cancelled" | "post_only";

export type PlatformOrderBatchOperation =
  | {
      readonly action: "place";
      /**
       * Vault market account sequence. Omit it and Strata resolves the next
       * sequence from the Vault's confirmed market account when the challenge
       * is issued; supply it to pin a sequence tracked locally. Within one
       * batch every place-like operation must either supply it or omit it.
       */
      readonly accountSequence?: AtomicString | bigint;
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
      /**
       * Vault market account sequence. Omit it and Strata resolves the next
       * sequence from the Vault's confirmed market account when the challenge
       * is issued; supply it to pin a sequence tracked locally. Within one
       * batch every place-like operation must either supply it or omit it.
       */
      readonly accountSequence?: AtomicString | bigint;
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
      /**
       * Vault market account sequence. Omit it and Strata resolves the next
       * sequence from the Vault's confirmed market account when the challenge
       * is issued; supply it to pin a sequence tracked locally. Within one
       * batch every place-like operation must either supply it or omit it.
       */
      readonly accountSequence?: AtomicString | bigint;
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
      /**
       * Vault market account sequence. Omit it and Strata resolves the next
       * sequence from the Vault's confirmed market account when the challenge
       * is issued; supply it to pin a sequence tracked locally. Within one
       * batch every place-like operation must either supply it or omit it.
       */
      readonly accountSequence?: AtomicString | bigint;
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

/**
 * Prepare an order-control transaction: a signed challenge (two-step, two
 * signatures) or the operation itself (direct, one signature — the session's
 * signature over the returned transaction is the whole authorization). The
 * response is identical.
 */
export type PlatformOrderPrepareInput =
  | {
      readonly challengeId: string;
      readonly authorizationSignature: string;
    }
  | {
      readonly operation: PlatformOrderChallengeInput;
    };

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
      readonly account_sequence?: AtomicString;
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
      readonly account_sequence?: AtomicString;
      readonly client_order_id: string;
      readonly side: PlatformTradeSide;
      readonly order_type: PlatformRestingOrderType;
      readonly limit_price_atoms: AtomicString;
      readonly size_atoms: AtomicString;
    };

export type PlatformOrderChallengeWire =
  | ({
      readonly action: "place";
      readonly account_sequence?: AtomicString;
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
      readonly account_sequence?: AtomicString;
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
      readonly type: "probe_result";
      readonly request_id: string;
      readonly nonce: string;
    })
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
  /** Present only on the two-step (challenge) path. */
  readonly challenge?: PlatformOrderChallengeResponse;
  /** The requested operation, exactly as sent (direct path). */
  readonly operation?: PlatformOrderChallengeInput;
  readonly marketId?: PlatformEntityId;
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
  /**
   * Optional owner-side verification before the transaction signature. When
   * omitted the SDK's built-in `verifyOrderTransaction` runs: it decodes the
   * transaction and requires it to place/cancel exactly the requested orders
   * on this market, with the session co-signing only delegated instructions
   * and never paying. Supply your own to enforce a stricter policy.
   */
  verifyTransaction?(context: PlatformOrderVerificationContext): void | Promise<void>;
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

export type PlatformMakerReputationTier =
  | "probation"
  | "bronze"
  | "silver"
  | "gold"
  | "platinum";

export interface PlatformMakerTierProgress {
  readonly next_tier: PlatformMakerReputationTier | null;
  readonly reputation_score_required: number | null;
  readonly reputation_score_remaining: number;
  readonly quote_requests_required: AtomicString | null;
  readonly quote_requests_remaining: AtomicString;
  readonly stake_atoms_required: AtomicString | null;
  readonly stake_atoms_remaining: AtomicString;
  readonly tenure_slots_required: AtomicString | null;
  readonly tenure_slots_remaining: AtomicString;
}

export interface PlatformMakerReputationResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly market_id: PlatformEntityId;
  readonly maker_id: PlatformEntityId;
  readonly wallet_address: string;
  readonly active: boolean;
  readonly tier: PlatformMakerReputationTier;
  readonly reputation_score: number;
  readonly total_quote_requests: AtomicString;
  readonly successful_fills: AtomicString;
  readonly missed_quote_requests: AtomicString;
  readonly fill_rate_bps: number;
  readonly consecutive_misses: number;
  readonly lifetime_filled_quote_atoms: AtomicString;
  readonly distinct_counterparties: number;
  readonly recent_average_latency_ms: number;
  readonly configured_minimum_spread_bps: number;
  readonly weighted_average_spread_bps: number;
  readonly stake_atoms: AtomicString;
  readonly epoch_start_stake_atoms: AtomicString;
  readonly epoch_slashed_atoms: AtomicString;
  readonly epoch_slashed_bps: number;
  readonly lifetime_auto_slashed_atoms: AtomicString;
  readonly registered_slot: AtomicString;
  readonly last_active_slot: AtomicString;
  readonly last_settled_slot: AtomicString;
  readonly revoked_at_slot: AtomicString | null;
  readonly tenure_slots: AtomicString;
  readonly signed_quote_stream_eligible: boolean;
  readonly minimum_quote_interval_ms: number | null;
  readonly tier_progress: PlatformMakerTierProgress;
  readonly server_time_ms: number;
}

export type PlatformMakerSide = "buy" | "sell";
export type PlatformOracleHealth = "fresh" | "stale" | "unknown";

export interface PlatformMakerFirmOrderSummary {
  readonly resting_orders: number;
  readonly bid_orders: number;
  readonly ask_orders: number;
  readonly bid_size_atoms: AtomicString;
  readonly ask_size_atoms: AtomicString;
}

export interface PlatformMakerSignedQuote {
  readonly side: PlatformMakerSide;
  readonly price_atoms: AtomicString;
  readonly size_atoms: AtomicString;
  readonly nonce: AtomicString;
  readonly issued_at_ms: number;
  readonly expires_at_ms: number;
}

export interface PlatformMakerIntentStatus {
  readonly active: boolean;
  readonly side: PlatformMakerSide;
  readonly minimum_price_atoms: AtomicString;
  readonly maximum_price_atoms: AtomicString;
  readonly maximum_fill_size_atoms: AtomicString;
  /** Fill budget still available after in-flight reservations. */
  readonly remaining_fill_size_atoms: AtomicString;
  readonly minimum_spread_bps: number;
  readonly stake_atoms: AtomicString;
}

export interface PlatformMakerSignedQuoteLane {
  readonly eligible: boolean;
  readonly live_quotes: readonly PlatformMakerSignedQuote[];
}

export interface PlatformMakerStrandLevel {
  /** Null when the configured offset overflows the price range. */
  readonly price_atoms: AtomicString | null;
  readonly size_atoms: AtomicString;
  readonly remaining_size_atoms: AtomicString;
}

export interface PlatformMakerStrandStatus {
  readonly enabled: boolean;
  readonly async_only: boolean;
  /** True once the chain would reject fills because `valid_until_slot` passed. */
  readonly expired: boolean;
  readonly mid_price_atoms: AtomicString;
  readonly tick_size_atoms: AtomicString;
  /** Null means the Strand never expires. */
  readonly valid_until_slot: AtomicString | null;
  readonly bids: readonly PlatformMakerStrandLevel[];
  readonly asks: readonly PlatformMakerStrandLevel[];
  readonly maximum_exposure_atoms: AtomicString;
  readonly remaining_exposure_atoms: AtomicString;
}

export interface PlatformMakerCurrentStatus {
  readonly enabled: boolean;
  readonly async_only: boolean;
  readonly expired: boolean;
  readonly half_spread_bps: number;
  readonly band_step_bps: number;
  readonly maximum_confidence_bps: number;
  readonly maximum_oracle_age_seconds: number;
  readonly sync_spread_bps: number;
  /** Null means the Current never expires. */
  readonly valid_until_slot: AtomicString | null;
  readonly bid_depth_atoms: readonly AtomicString[];
  readonly ask_depth_atoms: readonly AtomicString[];
  readonly maximum_exposure_atoms: AtomicString;
  readonly remaining_exposure_atoms: AtomicString;
  /** Freshness class of the live Strata mark used to price this Current. */
  readonly oracle_health: PlatformOracleHealth;
}

export interface PlatformMakerDeadManGuard {
  readonly session_public_key: string;
  readonly status: PlatformDeadManStatus;
  readonly timeout_ms: number;
  readonly heartbeat_deadline_ms: number;
  readonly updated_at_ms: number;
}

/**
 * Authenticated, owner-scoped view of the maker's Strata products in one
 * market: firm orders, Strands, Currents, the signed-quote lane, live
 * exposure, health, and kill state.
 */
export interface PlatformMakerStatusResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly market_id: PlatformEntityId;
  readonly maker_id: PlatformEntityId;
  readonly wallet_address: string;
  readonly server_time_ms: number;
  readonly current_slot: AtomicString;
  readonly firm_orders: PlatformMakerFirmOrderSummary;
  /** Reserved compatibility field; null until the intent product launches. */
  readonly intent: PlatformMakerIntentStatus | null;
  readonly signed_quotes: PlatformMakerSignedQuoteLane;
  readonly strands: readonly PlatformMakerStrandStatus[];
  readonly currents: readonly PlatformMakerCurrentStatus[];
  readonly dead_man_guards: readonly PlatformMakerDeadManGuard[];
  /** Products currently able to fill: live Strands/Currents and resting firm orders (as one). */
  readonly active_products: number;
}

export type PlatformMakerStrandPrepareInput =
  | {
      readonly action: "upsert";
      readonly makerWallet: string;
      readonly enabled: boolean;
      readonly asyncOnly: boolean;
      readonly syncSpreadTicks: number;
      readonly midPriceAtoms: AtomicString | bigint;
      /** Total Strand exposure in base-asset atoms. */
      readonly maxExposureBaseAtoms: AtomicString | bigint;
      readonly bidOffsetsTicks: readonly number[];
      readonly askOffsetsTicks: readonly number[];
      /** Exactly 16 bid sizes in base-asset atoms; zero disables a level. */
      readonly bidSizesBaseAtoms: readonly (AtomicString | bigint)[];
      /** Exactly 16 ask sizes in base-asset atoms; zero disables a level. */
      readonly askSizesBaseAtoms: readonly (AtomicString | bigint)[];
      readonly validUntilSlot: AtomicString | bigint;
    }
  | {
      readonly action: "recenter";
      readonly makerWallet: string;
      readonly newMidPriceAtoms: AtomicString | bigint;
      readonly validUntilSlot: AtomicString | bigint;
    }
  | {
      readonly action: "set_enabled";
      readonly makerWallet: string;
      readonly enabled: boolean;
    }
  | {
      readonly action: "cancel";
      readonly makerWallet: string;
    };

export type PlatformMakerCurrentPrepareInput =
  | {
      readonly action: "upsert";
      readonly makerWallet: string;
      readonly enabled: boolean;
      readonly asyncOnly: boolean;
      readonly halfSpreadBps: number;
      readonly bandStepBps: number;
      readonly maxConfidenceBps: number;
      readonly maxOracleDeviationBps: number;
      readonly maxOracleAgeSeconds: number;
      readonly syncSpreadBps: number;
      readonly maxExposureBaseAtoms: AtomicString | bigint;
      readonly bidDepthBaseAtoms: readonly (AtomicString | bigint)[];
      readonly askDepthBaseAtoms: readonly (AtomicString | bigint)[];
      readonly validUntilSlot: AtomicString | bigint;
    }
  | {
      readonly action: "cancel";
      readonly makerWallet: string;
    };

export type PlatformMakerControlProduct = "strand" | "current";
export type PlatformMakerControlAction =
  | "strand_upsert"
  | "strand_recenter"
  | "strand_set_enabled"
  | "strand_cancel"
  | "current_upsert"
  | "current_cancel";

export interface PlatformMakerControlPrepareResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly maker_control_id: PlatformEntityId;
  readonly market_id: PlatformEntityId;
  readonly maker_wallet: string;
  readonly product: PlatformMakerControlProduct;
  readonly action: PlatformMakerControlAction;
  readonly transaction_base64: string;
  readonly recent_blockhash: string;
  readonly last_valid_block_height: number;
  readonly expires_at_ms: number;
}

export interface PlatformMakerControlSubmitInput {
  readonly makerControlId: string;
  readonly signedTransactionBase64: string;
  readonly idempotencyKey: string;
}

export interface PlatformMakerControlSubmitResponse {
  readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
  readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
  readonly maker_control_id: PlatformEntityId;
  readonly market_id: PlatformEntityId;
  readonly maker_wallet: string;
  readonly product: PlatformMakerControlProduct;
  readonly action: PlatformMakerControlAction;
  readonly signature: string;
  readonly status: "submitted";
}

/** Human-facing maker product used by the opinionated quickstart flow. */
export type PlatformMakerQuickstartProduct = "strand" | "current";
export type PlatformMakerQuickstartSide = "both" | "buy" | "sell";

/**
 * Transaction-only signer for maker controls. The private key remains in the
 * wallet, HSM, or agent-owned signer; Strata only receives the signed packet.
 */
export interface PlatformMakerTransactionSigner {
  readonly publicKey: string;
  signTransaction(transactionBase64: string): Promise<string>;
}

/**
 * The simple market-maker contract. `spreadBps` is the distance from Strata's
 * mark to the first quote on each side. `size` is a decimal base-asset amount,
 * optionally suffixed by its symbol (for example `0.01 SOL`).
 */
export interface PlatformMakerQuickstartPrepareInput {
  /** Public market label (`SOL/USDC`) or opaque market ID. */
  readonly market: string;
  readonly product: PlatformMakerQuickstartProduct;
  readonly makerWallet: string;
  readonly spreadBps: number;
  readonly size: string;
  /** Defaults to `10m`; accepts seconds or `30s`, `10m`, `2h`, `1d`. */
  readonly duration?: number | string;
  /** Defaults to three; capped by the product (Strand 16, Current 8). */
  readonly levels?: number;
  /** Distance between later levels; defaults to `spreadBps`. */
  readonly levelStepBps?: number;
  readonly side?: PlatformMakerQuickstartSide;
  /** Defaults to false so the quote is immediately executable. */
  readonly asyncOnly?: boolean;
}

export interface PlatformMakerQuickstartPrepared {
  readonly market: PlatformMarket;
  readonly base_asset: PlatformAsset;
  readonly product: PlatformMakerQuickstartProduct;
  readonly operation: PlatformMakerStrandPrepareInput | PlatformMakerCurrentPrepareInput;
  readonly prepared: PlatformMakerControlPrepareResponse;
}

export type PlatformMakerStartInput = Omit<
  PlatformMakerQuickstartPrepareInput,
  "makerWallet"
> & {
  readonly signer: PlatformMakerTransactionSigner;
  /** Defaults to 45 seconds. */
  readonly confirmationTimeoutMs?: number;
  /** Defaults to 500ms. */
  readonly confirmationPollMs?: number;
};

export interface PlatformMakerStopPrepareInput {
  readonly market: string;
  readonly product: PlatformMakerQuickstartProduct;
  readonly makerWallet: string;
}

export type PlatformMakerStopInput = Omit<PlatformMakerStopPrepareInput, "makerWallet"> & {
  readonly signer: PlatformMakerTransactionSigner;
  readonly confirmationTimeoutMs?: number;
  readonly confirmationPollMs?: number;
};

/** A chain-observed result, not merely a broadcast acknowledgement. */
export interface PlatformMakerQuickstartResult extends PlatformMakerQuickstartPrepared {
  readonly receipt: PlatformMakerControlSubmitResponse;
  readonly status: "confirmed";
  readonly maker_status: PlatformMakerStatusResponse;
}

export interface PlatformMakerStopPrepared {
  readonly market: PlatformMarket;
  readonly product: PlatformMakerQuickstartProduct;
  readonly operation: PlatformMakerStrandPrepareInput | PlatformMakerCurrentPrepareInput;
  readonly prepared: PlatformMakerControlPrepareResponse;
}

export interface PlatformMakerSubmitPreparedInput {
  readonly prepared: PlatformMakerQuickstartPrepared | PlatformMakerStopPrepared;
  readonly signedTransactionBase64: string;
  /** Defaults to the opaque maker control ID. */
  readonly idempotencyKey?: string;
  readonly confirmationTimeoutMs?: number;
  readonly confirmationPollMs?: number;
}

export interface PlatformMakerStopResult {
  readonly market: PlatformMarket;
  readonly product: PlatformMakerQuickstartProduct;
  readonly operation: PlatformMakerStrandPrepareInput | PlatformMakerCurrentPrepareInput;
  readonly prepared: PlatformMakerControlPrepareResponse | null;
  readonly receipt: PlatformMakerControlSubmitResponse | null;
  readonly status: "confirmed";
  readonly maker_status: PlatformMakerStatusResponse;
  /** True when chain-derived state already showed the product absent. */
  readonly already_stopped: boolean;
}

export type PlatformMakerProduct = "firm_order" | "intent" | "strand" | "current";

/** One maker-side fill: the sanitized settlement view plus the maker product that produced it. */
export interface PlatformMakerFill {
  readonly fill_id: PlatformEntityId;
  readonly product: PlatformMakerProduct;
  readonly side: PlatformTradeSide;
  readonly price_atoms: AtomicString;
  readonly size_atoms: AtomicString;
  readonly fee_quote_atoms: AtomicString;
  readonly fee_is_final: boolean;
  readonly settlement: PlatformSettlementState;
  readonly executed_at_ms: number;
  readonly confirmed_at_ms: number | null;
  readonly transaction_id: string | null;
  readonly realized_pnl_quote_atoms: string;
}

export type PlatformMakerEvent =
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
      readonly type: "maker_snapshot";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly wallet_address: string;
      readonly stream_id: string;
      readonly sequence: AtomicString;
      readonly server_time_ms: number;
      readonly status: PlatformMakerStatusResponse;
      readonly fills: readonly PlatformMakerFill[];
    }
  | {
      readonly type: "maker_fill";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly wallet_address: string;
      readonly stream_id: string;
      readonly sequence: AtomicString;
      readonly previous_sequence: AtomicString;
      readonly server_time_ms: number;
      readonly fill: PlatformMakerFill;
    }
  | {
      readonly type: "maker_status";
      readonly schema_version: typeof PLATFORM_SCHEMA_VERSION;
      readonly contract_version: typeof PLATFORM_CONTRACT_VERSION;
      readonly market_id: PlatformEntityId;
      readonly wallet_address: string;
      readonly stream_id: string;
      readonly sequence: AtomicString;
      readonly previous_sequence: AtomicString;
      readonly server_time_ms: number;
      readonly status: PlatformMakerStatusResponse;
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

/** Client-side view of one authenticated maker stream after each sequenced event. */
export interface PlatformMakerView {
  readonly market_id: PlatformEntityId;
  readonly wallet_address: string;
  readonly stream_id: string;
  readonly sequence: AtomicString;
  readonly server_time_ms: number;
  readonly status: PlatformMakerStatusResponse;
  readonly fills: readonly PlatformMakerFill[];
  /** True when this view came from a recovery snapshot after a gap or reconnect. */
  readonly recovered: boolean;
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
