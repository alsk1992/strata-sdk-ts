export const CONTRACT_SCHEMA_VERSION = 1 as const;
export const CONTRACT_VERSION = "1.0" as const;
export const DEFAULT_API_BASE = "https://api.stratabook.app";

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

export interface QuoteRequest {
  /** Human label such as SOL/USDC, or the public market ID. */
  market: string;
  side: QuoteSide;
  amountInAtoms: AtomicString | bigint;
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
