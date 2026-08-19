export const CONTRACT_SCHEMA_VERSION = 1 as const;
export const CONTRACT_VERSION = "1.1" as const;
export const DEFAULT_API_BASE = "https://api.stratabook.app";
/** Exact-output default for the current read-only quote surface. */
/**
 * Default maximum tolerance: zero, so a quote is exact unless the caller opts
 * into a lower floor. Tolerance is the caller's choice; it is not price impact.
 */
export const DEFAULT_MAXIMUM_TOLERANCE_BPS = 0 as const;
/** @deprecated Legacy name for DEFAULT_MAXIMUM_TOLERANCE_BPS. */
export const DEFAULT_SLIPPAGE_BPS = DEFAULT_MAXIMUM_TOLERANCE_BPS;

export type QuoteSide = "buy" | "sell";
export type CapabilityStability = "internal" | "beta" | "stable";
export type CapabilityRisk = "read" | "prepare" | "submit" | "destructive";
export type McpExposure = "none" | "read" | "prepare" | "submit";

/** Unsigned base-10 amount in a token's smallest atomic unit. */
export type AtomicString = string;

export interface Market {
  base: string;
  quote: string;
  market_pda: string | null;
  label: string;
  ready: boolean;
  base_decimals: number;
  quote_decimals: number;
  quote_path: string | null;
}

export interface MarketsResponse {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  contract_version: typeof CONTRACT_VERSION;
  markets: Market[];
}

export interface CapabilityDescriptor {
  id: string;
  introduced_in: string;
  stability: CapabilityStability;
  required_scope: string;
  risk: CapabilityRisk;
  default_enabled: boolean;
  public_sdk: boolean;
  mcp_exposure: McpExposure;
}

export interface CapabilityCatalog {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  contract_version: typeof CONTRACT_VERSION;
  capabilities: CapabilityDescriptor[];
}

export type ActionNodeKind =
  | "discovery"
  | "read"
  | "prepare"
  | "external_signature"
  | "submit"
  | "receipt";

export interface ActionAuthorityModel {
  permission_source: "external_agent_owner";
  signing_location: "external";
  accepts_private_keys: false;
}

export interface ActionOperation {
  method: "GET" | "POST" | "WEBSOCKET";
  path: string;
  mcp_tool?: string;
}

export interface ActionNode {
  id: string;
  kind: ActionNodeKind;
  summary: string;
  required_capabilities: string[];
  available: boolean;
  operation?: ActionOperation;
}

export interface ActionEdge {
  from: string;
  to: string;
  condition: string;
}

export interface ActionGraph {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  graph_version: "1.0";
  contract_version: typeof CONTRACT_VERSION;
  entry_node: string;
  authority: ActionAuthorityModel;
  nodes: ActionNode[];
  edges: ActionEdge[];
}

export interface QuoteRequest {
  /** Human label such as SOL/USDC, or the public market ID. */
  market: string;
  side: QuoteSide;
  /**
   * Exact-input quote: spend exactly this many input atoms. Provide exactly one
   * of `amountInAtoms` and `amountOutAtoms`.
   */
  amountInAtoms?: AtomicString | bigint;
  /**
   * Exact-output quote: the output atoms you want. Strata inverts its best
   * route at quote time and returns the input that delivers it as
   * `amount_in_atoms` (no cushion of its own); `minimum_output_atoms` is this
   * amount lowered by `maximumToleranceBps` exactly as for exact input — zero
   * by default, so execution delivers the requested amount or fails closed.
   */
  amountOutAtoms?: AtomicString | bigint;
  /**
   * The most you accept below the quoted output, in basis points. This is
   * your choice and has nothing to do with the measured `price_impact_pct`
   * the response reports. Omission means the quoted output exactly (0 bps).
   */
  maximumToleranceBps?: number;
  /** @deprecated Legacy name for `maximumToleranceBps`. */
  slippageBps?: number;
}

export interface QuoteResponse {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  contract_version: typeof CONTRACT_VERSION;
  quote_id: string;
  server_time_ms: number;
  expires_at_ms: number;
  market_id: string;
  side: QuoteSide;
  amount_in_atoms: AtomicString;
  amount_in_consumed_atoms: AtomicString;
  /** User-net output after the separately reported output_fee_atoms. */
  amount_out_atoms: AtomicString;
  /** User-net execution floor after fees and the requested tolerance. */
  minimum_output_atoms: AtomicString;
  /** Fee charged in the input token, when applicable. */
  input_fee_atoms: AtomicString;
  /** Strata fee charged in the output token. Gross pre-fee output is
   * amount_out_atoms + output_fee_atoms. */
  output_fee_atoms: AtomicString;
  /**
   * Your tolerance echoed back: the most you accept below `amount_out_atoms`,
   * already applied in `minimum_output_atoms`. A choice, not a measurement —
   * compare `price_impact_pct`.
   */
  maximum_tolerance_bps: number;
  /** Best price before your order (display only). */
  reference_price: string;
  /**
   * Measured from the book: how far the quoted fills' average price sits from
   * `reference_price`. Not a setting; unrelated to `maximum_tolerance_bps`.
   */
  price_impact_pct: string;
  provider: "Sonar";
}

export interface ExecutionChallengeResponse {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  contract_version: typeof CONTRACT_VERSION;
  challenge_id: string;
  quote_id: string;
  market_id: string;
  side: QuoteSide;
  amount_in_atoms: AtomicString;
  minimum_output_atoms: AtomicString;
  authorization_payload_base64: string;
  server_time_ms: number;
  expires_at_ms: number;
}

export interface ExecutionChallengeRequest {
  /** Human label such as SOL/USDC, or the public market ID. */
  market: string;
  quoteId: string;
  ownerWallet: string;
  sessionPublicKey: string;
  /**
   * Vault market account sequence. Omit it and Strata resolves the next
   * sequence from the Vault's confirmed market account when the challenge is
   * issued; supply it to pin a sequence tracked locally.
   */
  accountSequence?: AtomicString | bigint;
}

export interface ExecutionPrepareResponse {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  contract_version: typeof CONTRACT_VERSION;
  execution_id: string;
  quote_id: string;
  market_id: string;
  side: QuoteSide;
  amount_in_atoms: AtomicString;
  minimum_output_atoms: AtomicString;
  transaction_base64: string;
  recent_blockhash: string;
  last_valid_block_height: number;
  expires_at_ms: number;
}

/**
 * Prepare a quote-bound execution transaction. Either hand back a signed
 * challenge (two signatures per trade) or bind the quote directly (one
 * signature: the session's signature over the returned transaction is the
 * whole authorization). The response is identical.
 */
export type ExecutionPrepareRequest =
  | {
      /** The same market used to create the challenge. */
      market: string;
      challengeId: string;
      authorizationSignature: string;
    }
  | {
      /** Human label such as SOL/USDC, or the public market ID. */
      market: string;
      quoteId: string;
      ownerWallet: string;
      sessionPublicKey: string;
      accountSequence?: AtomicString | bigint;
    };

export interface ExecutionSubmitResponse {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  contract_version: typeof CONTRACT_VERSION;
  execution_id: string;
  signature: string;
  status: "submitted";
}

export interface ExecutionSubmitRequest {
  /** The same market used to prepare the execution. */
  market: string;
  executionId: string;
  signedTransactionBase64: string;
  idempotencyKey: string;
}

export interface ExecutionVerificationContext {
  quote: QuoteResponse;
  /** Present only on the two-step (challenge) path. */
  challenge?: ExecutionChallengeResponse;
  prepared: ExecutionPrepareResponse;
  ownerWallet: string;
  sessionPublicKey: string;
}

/**
 * A non-exportable Vault session adapter. The SDK never accepts, stores, or
 * transmits the corresponding private key.
 */
export interface StrataSessionSigner {
  /** Base58 Ed25519 public key registered as the Vault delegate. */
  publicKey: string;
  /** Sign one exact, SDK-validated authorization payload. */
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  /** Add only the session signature to the already-verified transaction. */
  signTransaction(transactionBase64: string): Promise<string>;
}

export interface ExecuteQuoteRequest {
  quote: QuoteResponse;
  ownerWallet: string;
  /** Optional pinned Vault market account sequence; see ExecutionChallengeRequest. */
  accountSequence?: AtomicString | bigint;
  signer: StrataSessionSigner;
  /**
   * Optional deny-by-default transaction verifier. When omitted the SDK's
   * built-in `verifyExecutionTransaction` runs: the session key co-signs only
   * Vault-delegated instructions and never pays, the owner wallet is not
   * asked to sign, and the echoed quote economics are checked. Supply your own
   * to enforce a stricter policy.
   */
  verifyTransaction?(
    context: ExecutionVerificationContext,
  ): void | Promise<void>;
  /**
   * Retry key for this exact execution. Reuse it after transport failures.
   * The opaque execution ID is used when omitted.
   */
  idempotencyKey?: string;
}

export interface ErrorDetail {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ErrorResponse {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  contract_version: typeof CONTRACT_VERSION;
  error: ErrorDetail;
}

export interface StrataClientOptions {
  apiBase?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}
