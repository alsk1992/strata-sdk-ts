import {
  CONTRACT_SCHEMA_VERSION,
  CONTRACT_VERSION,
  type AtomicString,
  type ActionEdge,
  type ActionGraph,
  type ActionNode,
  type ActionOperation,
  type CapabilityCatalog,
  type CapabilityDescriptor,
  type ErrorResponse,
  type ExecutionChallengeResponse,
  type ExecutionPrepareResponse,
  type ExecutionSubmitResponse,
  type Market,
  type MarketsResponse,
  type QuoteResponse,
} from "./types.js";

type JsonObject = Record<string, unknown>;

const QUOTE_KEYS = [
  "schema_version",
  "contract_version",
  "quote_id",
  "server_time_ms",
  "expires_at_ms",
  "market_id",
  "side",
  "amount_in_atoms",
  "amount_in_consumed_atoms",
  "amount_out_atoms",
  "minimum_output_atoms",
  "input_fee_atoms",
  "output_fee_atoms",
  "maximum_tolerance_bps",
  "reference_price",
  "price_impact_pct",
  "provider",
] as const;

const EXECUTION_BINDING_KEYS = [
  "schema_version",
  "contract_version",
  "quote_id",
  "market_id",
  "side",
  "amount_in_atoms",
  "minimum_output_atoms",
] as const;

function object(value: unknown, field: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonObject;
}

function exactKeys(value: JsonObject, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${field} contains unrecognized or missing fields`);
  }
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} must be boolean`);
  return value;
}

function integer(value: unknown, field: string, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return value as number;
}

function version(value: JsonObject): void {
  if (
    value.schema_version !== CONTRACT_SCHEMA_VERSION
    || value.contract_version !== CONTRACT_VERSION
  ) {
    throw new Error("unsupported Strata public contract");
  }
}

export function atomic(value: unknown, field: string): AtomicString {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`${field} must be an unsigned atomic decimal string`);
  }
  const parsed = BigInt(value);
  if (parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${field} exceeds the supported range`);
  }
  return value;
}

function decimal(value: unknown, field: string, allowZero: boolean): string {
  const raw = string(value, field);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || (!allowZero && parsed === 0)) {
    throw new Error(`${field} must be a finite decimal string`);
  }
  return raw;
}

function market(value: unknown): Market {
  const item = object(value, "market");
  exactKeys(
    item,
    [
      "base",
      "quote",
      "market_pda",
      "label",
      "ready",
      "base_decimals",
      "quote_decimals",
      "quote_path",
    ],
    "market",
  );
  if (item.market_pda !== null && typeof item.market_pda !== "string") {
    throw new Error("market.market_pda must be a string or null");
  }
  if (item.quote_path !== null && typeof item.quote_path !== "string") {
    throw new Error("market.quote_path must be a string or null");
  }
  return {
    base: string(item.base, "market.base"),
    quote: string(item.quote, "market.quote"),
    market_pda: item.market_pda as string | null,
    label: string(item.label, "market.label"),
    ready: boolean(item.ready, "market.ready"),
    base_decimals: integer(item.base_decimals, "market.base_decimals", 255),
    quote_decimals: integer(item.quote_decimals, "market.quote_decimals", 255),
    quote_path: item.quote_path as string | null,
  };
}

export function marketsResponse(value: unknown): MarketsResponse {
  const response = object(value, "markets response");
  exactKeys(response, ["schema_version", "contract_version", "markets"], "markets response");
  version(response);
  if (!Array.isArray(response.markets)) throw new Error("markets must be an array");
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    contract_version: CONTRACT_VERSION,
    markets: response.markets.map(market),
  };
}

function capability(value: unknown): CapabilityDescriptor {
  const item = object(value, "capability");
  exactKeys(
    item,
    [
      "id",
      "introduced_in",
      "stability",
      "required_scope",
      "risk",
      "default_enabled",
      "public_sdk",
      "mcp_exposure",
    ],
    "capability",
  );
  const stability = string(item.stability, "capability.stability");
  const risk = string(item.risk, "capability.risk");
  const exposure = string(item.mcp_exposure, "capability.mcp_exposure");
  if (!["internal", "beta", "stable"].includes(stability)) {
    throw new Error("invalid capability stability");
  }
  if (!["read", "prepare", "submit", "destructive"].includes(risk)) {
    throw new Error("invalid capability risk");
  }
  if (!["none", "read", "prepare", "submit"].includes(exposure)) {
    throw new Error("invalid MCP exposure");
  }
  return {
    id: string(item.id, "capability.id"),
    introduced_in: string(item.introduced_in, "capability.introduced_in"),
    stability: stability as CapabilityDescriptor["stability"],
    required_scope: string(item.required_scope, "capability.required_scope"),
    risk: risk as CapabilityDescriptor["risk"],
    default_enabled: boolean(item.default_enabled, "capability.default_enabled"),
    public_sdk: boolean(item.public_sdk, "capability.public_sdk"),
    mcp_exposure: exposure as CapabilityDescriptor["mcp_exposure"],
  };
}

export function capabilityCatalog(value: unknown): CapabilityCatalog {
  const response = object(value, "capability catalog");
  exactKeys(
    response,
    ["schema_version", "contract_version", "capabilities"],
    "capability catalog",
  );
  version(response);
  if (!Array.isArray(response.capabilities)) throw new Error("capabilities must be an array");
  const capabilities = response.capabilities.map(capability);
  const ids = new Set(capabilities.map((item) => item.id));
  if (ids.size !== capabilities.length) throw new Error("capability IDs must be unique");
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    contract_version: CONTRACT_VERSION,
    capabilities,
  };
}

function actionNode(value: unknown): ActionNode {
  const item = object(value, "action node");
  const expected = ["id", "kind", "summary", "required_capabilities", "available"];
  if (item.operation !== undefined) expected.push("operation");
  exactKeys(item, expected, "action node");
  const kind = string(item.kind, "action node.kind");
  if (![
    "discovery",
    "read",
    "prepare",
    "external_signature",
    "submit",
    "receipt",
  ].includes(kind)) {
    throw new Error("invalid action node kind");
  }
  if (!Array.isArray(item.required_capabilities)) {
    throw new Error("action node.required_capabilities must be an array");
  }
  const operation = item.operation === undefined
    ? undefined
    : (() => {
        const value = object(item.operation, "action operation");
        const keys = ["method", "path"];
        if (value.mcp_tool !== undefined) keys.push("mcp_tool");
        exactKeys(value, keys, "action operation");
        const method = string(value.method, "action operation.method");
        if (method !== "GET" && method !== "POST" && method !== "WEBSOCKET") {
          throw new Error("invalid action operation method");
        }
        return {
          method: method as ActionOperation["method"],
          path: string(value.path, "action operation.path"),
          ...(value.mcp_tool === undefined
            ? {}
            : { mcp_tool: string(value.mcp_tool, "action operation.mcp_tool") }),
        };
      })();
  return {
    id: string(item.id, "action node.id"),
    kind: kind as ActionNode["kind"],
    summary: string(item.summary, "action node.summary"),
    required_capabilities: item.required_capabilities.map((id) =>
      string(id, "action node.required_capabilities[]")
    ),
    available: boolean(item.available, "action node.available"),
    ...(operation ? { operation } : {}),
  };
}

function actionEdge(value: unknown): ActionEdge {
  const item = object(value, "action edge");
  exactKeys(item, ["from", "to", "condition"], "action edge");
  return {
    from: string(item.from, "action edge.from"),
    to: string(item.to, "action edge.to"),
    condition: string(item.condition, "action edge.condition"),
  };
}

export function actionGraph(value: unknown): ActionGraph {
  const graph = object(value, "action graph");
  exactKeys(
    graph,
    [
      "schema_version",
      "graph_version",
      "contract_version",
      "entry_node",
      "authority",
      "nodes",
      "edges",
    ],
    "action graph",
  );
  version(graph);
  if (graph.graph_version !== "1.0") throw new Error("unsupported action graph");
  const authority = object(graph.authority, "action graph.authority");
  exactKeys(
    authority,
    ["permission_source", "signing_location", "accepts_private_keys"],
    "action graph.authority",
  );
  if (
    authority.permission_source !== "external_agent_owner"
    || authority.signing_location !== "external"
    || authority.accepts_private_keys !== false
  ) {
    throw new Error("unsupported action authority model");
  }
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error("action graph nodes and edges must be arrays");
  }
  const nodes = graph.nodes.map(actionNode);
  const edges = graph.edges.map(actionEdge);
  const ids = new Set(nodes.map((node) => node.id));
  const entryNode = string(graph.entry_node, "action graph.entry_node");
  if (ids.size !== nodes.length || !ids.has(entryNode)) {
    throw new Error("action graph node identity is invalid");
  }
  if (edges.some((edge) => !ids.has(edge.from) || !ids.has(edge.to))) {
    throw new Error("action graph edge references an unknown node");
  }
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    graph_version: "1.0",
    contract_version: CONTRACT_VERSION,
    entry_node: entryNode,
    authority: {
      permission_source: "external_agent_owner",
      signing_location: "external",
      accepts_private_keys: false,
    },
    nodes,
    edges,
  };
}

export function quoteResponse(value: unknown): QuoteResponse {
  const response = object(value, "quote response");
  exactKeys(response, QUOTE_KEYS, "quote response");
  version(response);
  if (
    typeof response.quote_id !== "string"
    || !/^sq_[0-9a-f]{32}$/.test(response.quote_id)
  ) {
    throw new Error("quote_id must be an opaque quote handle");
  }
  if (response.side !== "buy" && response.side !== "sell") {
    throw new Error("quote side is invalid");
  }
  if (response.provider !== "Sonar") throw new Error("quote provider is invalid");
  const serverTime = integer(response.server_time_ms, "server_time_ms");
  const expiresAt = integer(response.expires_at_ms, "expires_at_ms");
  if (expiresAt <= serverTime) throw new Error("quote lifetime is invalid");
  const amountIn = atomic(response.amount_in_atoms, "amount_in_atoms");
  const consumed = atomic(
    response.amount_in_consumed_atoms,
    "amount_in_consumed_atoms",
  );
  const amountOut = atomic(response.amount_out_atoms, "amount_out_atoms");
  const minimumOutput = atomic(response.minimum_output_atoms, "minimum_output_atoms");
  const inputFee = atomic(response.input_fee_atoms, "input_fee_atoms");
  const outputFee = atomic(response.output_fee_atoms, "output_fee_atoms");
  if (BigInt(consumed) > BigInt(amountIn) || BigInt(minimumOutput) > BigInt(amountOut)) {
    throw new Error("quote economics are internally inconsistent");
  }
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    contract_version: CONTRACT_VERSION,
    quote_id: response.quote_id,
    server_time_ms: serverTime,
    expires_at_ms: expiresAt,
    market_id: string(response.market_id, "market_id"),
    side: response.side,
    amount_in_atoms: amountIn,
    amount_in_consumed_atoms: consumed,
    amount_out_atoms: amountOut,
    minimum_output_atoms: minimumOutput,
    input_fee_atoms: inputFee,
    output_fee_atoms: outputFee,
    maximum_tolerance_bps: integer(response.maximum_tolerance_bps, "maximum_tolerance_bps", 1_000),
    reference_price: decimal(response.reference_price, "reference_price", false),
    price_impact_pct: decimal(response.price_impact_pct, "price_impact_pct", true),
    provider: "Sonar",
  };
}

function executionBinding(
  value: JsonObject,
  field: string,
): Pick<
  ExecutionChallengeResponse,
  | "schema_version"
  | "contract_version"
  | "quote_id"
  | "market_id"
  | "side"
  | "amount_in_atoms"
  | "minimum_output_atoms"
> {
  version(value);
  if (typeof value.quote_id !== "string" || !/^sq_[0-9a-f]{32}$/.test(value.quote_id)) {
    throw new Error(`${field}.quote_id must be an opaque quote handle`);
  }
  if (value.side !== "buy" && value.side !== "sell") {
    throw new Error(`${field}.side is invalid`);
  }
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    contract_version: CONTRACT_VERSION,
    quote_id: value.quote_id,
    market_id: string(value.market_id, `${field}.market_id`),
    side: value.side,
    amount_in_atoms: atomic(value.amount_in_atoms, `${field}.amount_in_atoms`),
    minimum_output_atoms: atomic(
      value.minimum_output_atoms,
      `${field}.minimum_output_atoms`,
    ),
  };
}

export function executionChallengeResponse(value: unknown): ExecutionChallengeResponse {
  const response = object(value, "execution challenge");
  exactKeys(
    response,
    [
      ...EXECUTION_BINDING_KEYS,
      "challenge_id",
      "authorization_payload_base64",
      "server_time_ms",
      "expires_at_ms",
    ],
    "execution challenge",
  );
  const binding = executionBinding(response, "execution challenge");
  if (
    typeof response.challenge_id !== "string"
    || !/^sc_[0-9a-f]{32}$/.test(response.challenge_id)
  ) {
    throw new Error("challenge_id must be an opaque challenge handle");
  }
  const serverTime = integer(response.server_time_ms, "execution challenge.server_time_ms");
  const expiresAt = integer(response.expires_at_ms, "execution challenge.expires_at_ms");
  if (expiresAt <= serverTime) throw new Error("execution challenge lifetime is invalid");
  const payload = string(
    response.authorization_payload_base64,
    "execution challenge.authorization_payload_base64",
  );
  if (!validBase64(payload)) throw new Error("authorization payload is not canonical base64");
  return {
    ...binding,
    challenge_id: response.challenge_id,
    authorization_payload_base64: payload,
    server_time_ms: serverTime,
    expires_at_ms: expiresAt,
  };
}

export function executionPrepareResponse(value: unknown): ExecutionPrepareResponse {
  const response = object(value, "prepared execution");
  exactKeys(
    response,
    [
      ...EXECUTION_BINDING_KEYS,
      "execution_id",
      "transaction_base64",
      "recent_blockhash",
      "last_valid_block_height",
      "expires_at_ms",
    ],
    "prepared execution",
  );
  const binding = executionBinding(response, "prepared execution");
  if (
    typeof response.execution_id !== "string"
    || !/^se_[0-9a-f]{32}$/.test(response.execution_id)
  ) {
    throw new Error("execution_id must be an opaque execution handle");
  }
  const transaction = string(response.transaction_base64, "prepared transaction");
  if (!validBase64(transaction)) throw new Error("prepared transaction is not canonical base64");
  return {
    ...binding,
    execution_id: response.execution_id,
    transaction_base64: transaction,
    recent_blockhash: string(response.recent_blockhash, "prepared recent_blockhash"),
    last_valid_block_height: integer(
      response.last_valid_block_height,
      "prepared last_valid_block_height",
    ),
    expires_at_ms: integer(response.expires_at_ms, "prepared expires_at_ms"),
  };
}

export function executionSubmitResponse(value: unknown): ExecutionSubmitResponse {
  const response = object(value, "execution submission");
  exactKeys(
    response,
    ["schema_version", "contract_version", "execution_id", "signature", "status"],
    "execution submission",
  );
  version(response);
  if (
    typeof response.execution_id !== "string"
    || !/^se_[0-9a-f]{32}$/.test(response.execution_id)
  ) {
    throw new Error("execution_id must be an opaque execution handle");
  }
  if (response.status !== "submitted") throw new Error("execution status is invalid");
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    contract_version: CONTRACT_VERSION,
    execution_id: response.execution_id,
    signature: string(response.signature, "execution signature"),
    status: "submitted",
  };
}

function validBase64(value: string): boolean {
  return value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}

export function errorResponse(value: unknown): ErrorResponse | null {
  try {
    const response = object(value, "error response");
    exactKeys(response, ["schema_version", "contract_version", "error"], "error response");
    version(response);
    const detail = object(response.error, "error");
    exactKeys(detail, ["code", "message", "retryable"], "error");
    return {
      schema_version: CONTRACT_SCHEMA_VERSION,
      contract_version: CONTRACT_VERSION,
      error: {
        code: string(detail.code, "error.code"),
        message: string(detail.message, "error.message"),
        retryable: boolean(detail.retryable, "error.retryable"),
      },
    };
  } catch {
    return null;
  }
}
