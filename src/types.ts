export const CONTRACT_SCHEMA_VERSION = 1 as const;
export const CONTRACT_VERSION = "1.1" as const;
export const DEFAULT_API_BASE = "https://api.stratabook.app";
/** Exact-output default for the current read-only quote surface. */
export const DEFAULT_SLIPPAGE_BPS = 0 as const;

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
  amountInAtoms: AtomicString | bigint;
  /** Optional maximum execution tolerance. Omission means exact output (0 bps). */
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
  amount_out_atoms: AtomicString;
  minimum_output_atoms: AtomicString;
  input_fee_atoms: AtomicString;
  output_fee_atoms: AtomicString;
  reference_price: string;
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
  accountSequence: AtomicString | bigint;
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

export interface ExecutionPrepareRequest {
  /** The same market used to create the challenge. */
  market: string;
  challengeId: string;
  authorizationSignature: string;
}

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
  challenge: ExecutionChallengeResponse;
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
  accountSequence: AtomicString | bigint;
  signer: StrataSessionSigner;
  /**
   * Mandatory deny-by-default transaction verifier. It must reject any
   * transaction that is not acceptable for this exact Vault session.
   */
  verifyTransaction(
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
