import {
  PLATFORM_CONTRACT_VERSION,
  PLATFORM_SCHEMA_VERSION,
  PLATFORM_SESSION_MAX_SPENDING_LIMITS,
  type LivePlatformCapability,
  type PageInfo,
  type PlatformAsset,
  type PlatformAssetsResponse,
  type PlatformSwapQuoteResponse,
  type PlatformAccountEvent,
  type PlatformAccountFill,
  type PlatformAccountOrder,
  type PlatformAccountSnapshotResponse,
  type PlatformMakerCurrentStatus,
  type PlatformMakerControlAction,
  type PlatformMakerControlPrepareResponse,
  type PlatformMakerControlProduct,
  type PlatformMakerControlSubmitResponse,
  type PlatformMakerDeadManGuard,
  type PlatformMakerEvent,
  type PlatformMakerFill,
  type PlatformMakerProduct,
  type PlatformMakerReputationResponse,
  type PlatformMakerReputationTier,
  type PlatformMakerSide,
  type PlatformMakerSignedQuote,
  type PlatformMakerStatusResponse,
  type PlatformMakerStrandLevel,
  type PlatformMakerStrandStatus,
  type PlatformOracleHealth,
  type PlatformActionGraphResponse,
  type PlatformBestBidAskResponse,
  type PlatformBookChange,
  type PlatformBookLevel,
  type PlatformBookSnapshotResponse,
  type PlatformBugReport,
  type PlatformBugSubmitResponse,
  type PlatformBugsResponse,
  type PlatformCandlesResponse,
  type PlatformDiscoveryResponse,
  type PlatformServiceStatusResponse,
  type PlatformFeeScheduleResponse,
  type PlatformExecutionStatusResponse,
  type PlatformMarketDataEvent,
  type PlatformMarket,
  type PlatformMarketAction,
  type PlatformMarketStatusResponse,
  type PlatformMarkResponse,
  type PlatformMarketsResponse,
  type PlatformOrderAction,
  type PlatformOrderChallengeResponse,
  type PlatformOrderChallengeWire,
  type PlatformOrderCommandEvent,
  type PlatformOrderControlStatus,
  type PlatformDeadManState,
  type PlatformOrderPrepareResponse,
  type PlatformOrderStatusResponse,
  type PlatformOrderSubmitResponse,
  type PlatformOwnerRewards,
  type PlatformPortfolioBalance,
  type PlatformPortfolioFill,
  type PlatformPortfolioOrder,
  type PlatformPortfolioHistoryPoint,
  type PlatformPortfolioHistoryResponse,
  type PlatformPortfolioPosition,
  type PlatformPortfolioResponse,
  type PlatformTwapEvent,
  type PlatformExecutionEvent,
  type PlatformExecutionRow,
  type PlatformReferralsResponse,
  type PlatformReferralClaimResponse,
  type PlatformReferralLinkResponse,
  type PlatformRewardStanding,
  type PlatformRewardsResponse,
  type PlatformSelfTradePrevention,
  type PlatformTrade,
  type PlatformTradesResponse,
  type PlatformTwap,
  type PlatformTwapChallengeResponse,
  type PlatformTwapControlAction,
  type PlatformTwapPrepareResponse,
  type PlatformTwapSubmitResponse,
  type PlatformTwapsResponse,
  type PlatformVaultSessionStatus,
  type PlatformVaultSpendingLimit,
  type PlatformVaultPausePrepareResponse,
  type PlatformVaultDelegatePrepareResponse,
  type PlatformVaultPolicyPrepareResponse,
  type PlatformVaultDepositPrepareResponse,
  type PlatformVaultWithdrawPrepareResponse,
  type PlatformVaultSubmitResponse,
  type PlatformVaultSetupPrepareResponse,
  type PlatformVaultStatusResponse,
} from "./platform.js";

type JsonObject = Record<string, unknown>;

const RISKS = ["read", "prepare", "submit", "destructive"] as const;
const TRANSPORTS = ["http", "websocket", "mcp"] as const;
const MCP_EXPOSURES = ["none", "read", "prepare", "submit"] as const;
const ACTION_KINDS = [
  "discovery", "read", "prepare", "external_signature", "submit", "receipt", "stream",
] as const;
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const MARKET_STATES = [
  "active",
  "read_only",
  "quote_only",
  "cancel_only",
  "paused",
  "warming",
  "degraded",
  "unavailable",
] as const;
const MARKET_ACTIONS = [
  "quote",
  "execute_immediate",
  "place_order",
  "schedule_twap",
] as const;
const ACTIVE_ORDER_STATES = ["open", "partially_filled"] as const;
const ORDER_TYPES = [
  "good_until_cancelled", "immediate_or_cancel", "fill_or_kill", "post_only",
] as const;
const FILL_SETTLEMENT_STATES = ["pending", "confirmed", "failed"] as const;
const ORDER_ACTIONS = ["place", "cancel", "cancel_all", "replace", "batch"] as const;
const ORDER_CONTROL_STATUSES = ["submitting", "submitted", "failed"] as const;
const SELF_TRADE_PREVENTION = [
  "cancel_taker", "cancel_maker", "cancel_both", "skip_own_liquidity",
] as const;
const DEAD_MAN_STATUSES = [
  "armed", "triggering", "triggered", "disarmed", "expired", "failed",
] as const;
const PUBLIC_ERROR_CODES = [
  "invalid_request", "unsupported_capability", "market_unavailable", "market_warming",
  "quote_unavailable", "quote_expired", "price_bound_failed", "insufficient_balance",
  "policy_rejected", "session_expired", "sequence_conflict", "duplicate_client_id",
  "order_rejected", "order_not_found", "cancel_too_late", "self_trade_prevented",
  "dead_man_expired", "rate_limited", "temporarily_unavailable", "submission_ambiguous",
  "settlement_pending", "settlement_failed",
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

function atomicString(value: unknown, field: string, allowZero = true): string {
  const text = string(value, field);
  if (!/^(?:0|[1-9][0-9]*)$/.test(text) || (!allowZero && text === "0")) {
    throw new Error(`${field} must be a canonical unsigned atomic string`);
  }
  return text;
}

function decimalPrice(value: unknown, field: string): string {
  const text = string(value, field);
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(text)) {
    throw new Error(`${field} must be a canonical non-negative decimal string`);
  }
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${field} is outside range`);
  return text;
}

function marketId(value: unknown, field = "market_id"): string {
  const id = string(value, field);
  if (!/^market_[0-9a-f]{32}$/.test(id)) throw new Error(`${field} is invalid`);
  return id;
}

function assetId(value: unknown, field = "asset_id"): string {
  const id = string(value, field);
  if (!/^asset_[0-9a-f]{32}$/.test(id)) throw new Error(`${field} is invalid`);
  return id;
}

function walletAddress(value: unknown, field = "wallet_address"): string {
  const address = string(value, field);
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) throw new Error(`${field} is invalid`);
  return address;
}

function opaqueOrderId(value: unknown, field: string): string {
  const id = string(value, field);
  if (!/^order_[0-9a-f]{32}$/.test(id)) throw new Error(`${field} is invalid`);
  return id;
}

function opaqueHandle(value: unknown, field: string, prefix: string): string {
  const handle = string(value, field);
  if (!new RegExp(`^${prefix}[0-9a-f]{32}$`).test(handle)) {
    throw new Error(`${field} is invalid`);
  }
  return handle;
}

function canonicalBase64(value: unknown, field: string): string {
  const encoded = string(value, field);
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error(`${field} must be canonical base64`);
  }
  return encoded;
}

function orderAction(value: unknown, field: string): PlatformOrderAction {
  if (!ORDER_ACTIONS.includes(value as typeof ORDER_ACTIONS[number])) {
    throw new Error(`${field} is invalid`);
  }
  return value as PlatformOrderAction;
}

function opaqueOrderIds(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) {
    throw new Error(`${field} must contain between one and twelve order IDs`);
  }
  const ids = value.map((item, index) => opaqueOrderId(item, `${field}[${index}]`));
  unique(ids, field);
  return ids;
}

function signedAtomicString(value: unknown, field: string): string {
  const text = string(value, field);
  if (!/^(?:0|-?[1-9][0-9]*)$/.test(text)) {
    throw new Error(`${field} must be a canonical signed atomic string`);
  }
  return text;
}

function integer(value: unknown, field: string, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return value as number;
}

function version(value: JsonObject): void {
  if (
    value.schema_version !== PLATFORM_SCHEMA_VERSION
    || value.contract_version !== PLATFORM_CONTRACT_VERSION
  ) {
    throw new Error("unsupported Strata platform contract");
  }
}

function unique<T>(values: readonly T[], field: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${field} must be unique`);
}

function pageInfo(value: unknown): PageInfo {
  const page = object(value, "page");
  exactKeys(page, ["next_cursor", "has_more"], "page");
  if (page.next_cursor !== null && typeof page.next_cursor !== "string") {
    throw new Error("page.next_cursor must be a string or null");
  }
  if (typeof page.has_more !== "boolean") throw new Error("page.has_more must be boolean");
  if (page.has_more !== (page.next_cursor !== null)) {
    throw new Error("page cursor and has_more disagree");
  }
  return {
    next_cursor: page.next_cursor as string | null,
    has_more: page.has_more,
  };
}

function liveCapability(value: unknown): LivePlatformCapability {
  const capability = object(value, "live capability");
  exactKeys(
    capability,
    ["id", "risk", "required_scope", "transports", "mcp_exposure"],
    "live capability",
  );
  const id = string(capability.id, "live capability.id");
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(id)) {
    throw new Error("live capability.id is invalid");
  }
  if (!RISKS.includes(capability.risk as typeof RISKS[number])) {
    throw new Error("live capability.risk is invalid");
  }
  if (!Array.isArray(capability.transports) || capability.transports.length === 0) {
    throw new Error("live capability.transports must be non-empty");
  }
  const transports = capability.transports.map((transport) => {
    if (!TRANSPORTS.includes(transport as typeof TRANSPORTS[number])) {
      throw new Error("live capability transport is invalid");
    }
    return transport as typeof TRANSPORTS[number];
  });
  unique(transports, "live capability transports");
  if (!MCP_EXPOSURES.includes(capability.mcp_exposure as typeof MCP_EXPOSURES[number])) {
    throw new Error("live capability.mcp_exposure is invalid");
  }
  const mcpExposure = capability.mcp_exposure as typeof MCP_EXPOSURES[number];
  if ((mcpExposure === "none") !== !transports.includes("mcp")) {
    throw new Error("live capability MCP transport and exposure disagree");
  }
  return {
    id,
    risk: capability.risk as typeof RISKS[number],
    required_scope: string(capability.required_scope, "live capability.required_scope"),
    transports,
    mcp_exposure: mcpExposure,
  };
}

export function platformDiscoveryResponse(value: unknown): PlatformDiscoveryResponse {
  const response = object(value, "platform discovery response");
  exactKeys(
    response,
    ["schema_version", "contract_version", "server_time_ms", "authority", "capabilities"],
    "platform discovery response",
  );
  version(response);
  const authority = object(response.authority, "platform authority");
  exactKeys(
    authority,
    ["permission_source", "signing_location", "accepts_private_keys"],
    "platform authority",
  );
  if (
    authority.permission_source !== "external_agent_owner"
    || authority.signing_location !== "external"
    || authority.accepts_private_keys !== false
  ) {
    throw new Error("unsupported platform authority");
  }
  if (!Array.isArray(response.capabilities)) throw new Error("capabilities must be an array");
  const capabilities = response.capabilities.map(liveCapability);
  unique(capabilities.map((capability) => capability.id), "live capability IDs");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    authority: {
      permission_source: "external_agent_owner",
      signing_location: "external",
      accepts_private_keys: false,
    },
    capabilities,
  };
}

export function platformServiceStatusResponse(value: unknown): PlatformServiceStatusResponse {
  const response = object(value, "platform service status response");
  exactKeys(response, [
    "schema_version", "contract_version", "server_time_ms", "status", "available_operations",
  ], "platform service status response");
  version(response);
  if (response.status !== "operational" && response.status !== "degraded") {
    throw new Error("platform service status is invalid");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    status: response.status,
    available_operations: integer(response.available_operations, "available_operations"),
  };
}

export function platformActionGraphResponse(value: unknown): PlatformActionGraphResponse {
  const response = object(value, "platform action graph");
  exactKeys(response, [
    "schema_version", "contract_version", "graph_version", "entry_operation_id",
    "authority", "entities", "relations", "modules", "operations", "workflows",
  ], "platform action graph");
  version(response);
  if (response.graph_version !== "2.0") throw new Error("unsupported platform graph version");

  const authority = object(response.authority, "platform graph authority");
  exactKeys(authority, [
    "permission_source", "signing_location", "accepts_private_keys",
  ], "platform graph authority");
  if (
    authority.permission_source !== "external_agent_owner"
    || authority.signing_location !== "external"
    || authority.accepts_private_keys !== false
  ) {
    throw new Error("unsupported platform graph authority");
  }

  if (!Array.isArray(response.entities) || response.entities.length === 0) {
    throw new Error("platform graph entities must be non-empty");
  }
  const entities = response.entities.map((entity, index) => {
    const id = string(entity, `entities[${index}]`);
    if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error(`entities[${index}] is invalid`);
    return id;
  });
  unique(entities, "platform graph entities");
  const entitySet = new Set(entities);

  if (!Array.isArray(response.relations)) throw new Error("platform graph relations must be an array");
  for (const [index, rawRelation] of response.relations.entries()) {
    const relation = object(rawRelation, `relations[${index}]`);
    exactKeys(relation, ["from", "to", "kind"], `relations[${index}]`);
    const from = string(relation.from, `relations[${index}].from`);
    const to = string(relation.to, `relations[${index}].to`);
    if (!entitySet.has(from) || !entitySet.has(to)) {
      throw new Error(`relations[${index}] references an unknown entity`);
    }
    if (!/^[a-z][a-z0-9_]*$/.test(string(relation.kind, `relations[${index}].kind`))) {
      throw new Error(`relations[${index}].kind is invalid`);
    }
  }

  if (!Array.isArray(response.modules) || response.modules.length === 0) {
    throw new Error("platform graph modules must be non-empty");
  }
  const moduleIds: string[] = [];
  const capabilityIds = new Set<string>();
  for (const [index, rawModule] of response.modules.entries()) {
    const module = object(rawModule, `modules[${index}]`);
    exactKeys(module, ["id", "client_property", "capability_ids"], `modules[${index}]`);
    const id = string(module.id, `modules[${index}].id`);
    if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error(`modules[${index}].id is invalid`);
    moduleIds.push(id);
    if (!/^[a-z][A-Za-z0-9]*$/.test(string(module.client_property, `modules[${index}].client_property`))) {
      throw new Error(`modules[${index}].client_property is invalid`);
    }
    if (!Array.isArray(module.capability_ids) || module.capability_ids.length === 0) {
      throw new Error(`modules[${index}].capability_ids must be non-empty`);
    }
    const moduleCapabilities = module.capability_ids.map((rawId, capabilityIndex) => {
      const capabilityId = string(rawId, `modules[${index}].capability_ids[${capabilityIndex}]`);
      if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(capabilityId)) {
        throw new Error(`modules[${index}] has an invalid capability ID`);
      }
      capabilityIds.add(capabilityId);
      return capabilityId;
    });
    unique(moduleCapabilities, `modules[${index}] capability IDs`);
  }
  unique(moduleIds, "platform graph module IDs");

  if (!Array.isArray(response.operations) || response.operations.length === 0) {
    throw new Error("platform graph operations must be non-empty");
  }
  const operationIds: string[] = [];
  const operationCapabilityById = new Map<string, string>();
  for (const [index, rawOperation] of response.operations.entries()) {
    const operation = object(rawOperation, `operations[${index}]`);
    exactKeys(operation, [
      "id", "capability_id", "kind", "summary", "transports", "available",
    ], `operations[${index}]`);
    const id = string(operation.id, `operations[${index}].id`);
    if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(id)) {
      throw new Error(`operations[${index}].id is invalid`);
    }
    operationIds.push(id);
    const capabilityId = string(operation.capability_id, `operations[${index}].capability_id`);
    if (!capabilityIds.has(capabilityId)) {
      throw new Error(`operations[${index}] references an unknown capability`);
    }
    operationCapabilityById.set(id, capabilityId);
    if (!ACTION_KINDS.includes(operation.kind as typeof ACTION_KINDS[number])) {
      throw new Error(`operations[${index}].kind is invalid`);
    }
    string(operation.summary, `operations[${index}].summary`);
    if (typeof operation.available !== "boolean") throw new Error(`operations[${index}].available is invalid`);
    if (!Array.isArray(operation.transports) || operation.transports.length === 0) {
      throw new Error(`operations[${index}].transports must be non-empty`);
    }
    for (const [transportIndex, rawTransport] of operation.transports.entries()) {
      const at = `operations[${index}].transports[${transportIndex}]`;
      const transport = object(rawTransport, at);
      if (transport.transport === "http") {
        exactKeys(transport, ["transport", "method", "path"], at);
        if (!HTTP_METHODS.includes(transport.method as typeof HTTP_METHODS[number])) {
          throw new Error(`${at}.method is invalid`);
        }
        if (!string(transport.path, `${at}.path`).startsWith("/")) throw new Error(`${at}.path is invalid`);
      } else if (transport.transport === "websocket") {
        exactKeys(transport, ["transport", "path"], at);
        if (!string(transport.path, `${at}.path`).startsWith("/")) throw new Error(`${at}.path is invalid`);
      } else if (transport.transport === "mcp") {
        exactKeys(transport, ["transport", "tool"], at);
        if (!/^strata_[a-z0-9_]+$/.test(string(transport.tool, `${at}.tool`))) {
          throw new Error(`${at}.tool is invalid`);
        }
      } else {
        throw new Error(`${at}.transport is invalid`);
      }
    }
  }
  unique(operationIds, "platform graph operation IDs");
  const operationSet = new Set(operationIds);
  if (!operationSet.has(string(response.entry_operation_id, "entry_operation_id"))) {
    throw new Error("platform graph entry operation does not exist");
  }

  if (!Array.isArray(response.workflows) || response.workflows.length === 0) {
    throw new Error("platform graph workflows must be non-empty");
  }
  const workflowIds: string[] = [];
  const coveredOperationIds = new Set<string>();
  for (const [index, rawWorkflow] of response.workflows.entries()) {
    const workflow = object(rawWorkflow, `workflows[${index}]`);
    exactKeys(workflow, ["id", "entry_node", "nodes", "edges"], `workflows[${index}]`);
    workflowIds.push(string(workflow.id, `workflows[${index}].id`));
    if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
      throw new Error(`workflows[${index}].nodes must be non-empty`);
    }
    const nodeIds: string[] = [];
    for (const [nodeIndex, rawNode] of workflow.nodes.entries()) {
      const node = object(rawNode, `workflows[${index}].nodes[${nodeIndex}]`);
      exactKeys(node, [
        "id", "kind", "capability_id", "operation_ids", "available",
      ], `workflows[${index}].nodes[${nodeIndex}]`);
      nodeIds.push(string(node.id, `workflows[${index}].nodes[${nodeIndex}].id`));
      if (!ACTION_KINDS.includes(node.kind as typeof ACTION_KINDS[number])) {
        throw new Error(`workflows[${index}].nodes[${nodeIndex}].kind is invalid`);
      }
      const capabilityId = node.capability_id === null
        ? null
        : string(node.capability_id, "workflow capability");
      if (capabilityId !== null && !capabilityIds.has(capabilityId)) {
        throw new Error(`workflows[${index}].nodes[${nodeIndex}] references an unknown capability`);
      }
      if (!Array.isArray(node.operation_ids)) throw new Error("workflow operation_ids must be an array");
      if (capabilityId === null) {
        if (node.kind !== "external_signature" || node.operation_ids.length !== 0) {
          throw new Error(`workflows[${index}].nodes[${nodeIndex}] has an invalid external boundary`);
        }
      } else if (node.kind === "external_signature" || node.operation_ids.length === 0) {
        throw new Error(`workflows[${index}].nodes[${nodeIndex}] must bind an operation`);
      }
      for (const rawOperationId of node.operation_ids) {
        const operationId = string(rawOperationId, "workflow operation ID");
        if (!operationSet.has(operationId)) {
          throw new Error(`workflows[${index}].nodes[${nodeIndex}] references an unknown operation`);
        }
        if (operationCapabilityById.get(operationId) !== capabilityId) {
          throw new Error(`workflows[${index}].nodes[${nodeIndex}] operation capability does not match`);
        }
        coveredOperationIds.add(operationId);
      }
      if (typeof node.available !== "boolean") throw new Error("workflow node available must be boolean");
    }
    unique(nodeIds, `workflows[${index}] node IDs`);
    const nodeSet = new Set(nodeIds);
    if (!nodeSet.has(string(workflow.entry_node, `workflows[${index}].entry_node`))) {
      throw new Error(`workflows[${index}] entry node does not exist`);
    }
    if (!Array.isArray(workflow.edges) || workflow.edges.length === 0) {
      throw new Error(`workflows[${index}].edges must be non-empty`);
    }
    const outgoing = new Map(nodeIds.map((id) => [id, [] as string[]]));
    for (const [edgeIndex, rawEdge] of workflow.edges.entries()) {
      const edge = object(rawEdge, `workflows[${index}].edges[${edgeIndex}]`);
      exactKeys(edge, ["from", "to", "condition"], `workflows[${index}].edges[${edgeIndex}]`);
      if (!nodeSet.has(string(edge.from, "workflow edge from"))
        || !nodeSet.has(string(edge.to, "workflow edge to"))) {
        throw new Error(`workflows[${index}].edges[${edgeIndex}] references an unknown node`);
      }
      string(edge.condition, `workflows[${index}].edges[${edgeIndex}].condition`);
      outgoing.get(edge.from as string)!.push(edge.to as string);
    }
    const reached = new Set<string>([workflow.entry_node as string]);
    const pending = [workflow.entry_node as string];
    while (pending.length > 0) {
      for (const target of outgoing.get(pending.shift()!) ?? []) {
        if (!reached.has(target)) {
          reached.add(target);
          pending.push(target);
        }
      }
    }
    if (reached.size !== nodeSet.size) {
      throw new Error(`workflows[${index}] contains an unreachable node`);
    }
  }
  unique(workflowIds, "platform graph workflow IDs");
  if (coveredOperationIds.size !== operationSet.size) {
    throw new Error("platform graph contains an operation orphaned from every workflow");
  }

  return response as unknown as PlatformActionGraphResponse;
}

function asset(value: unknown): PlatformAsset {
  const item = object(value, "asset");
  const keys = ["asset_id", "symbol", "name", "decimals", "network"];
  if (item.logo_url !== undefined) keys.push("logo_url");
  exactKeys(item, keys, "asset");
  const assetId = string(item.asset_id, "asset.asset_id");
  if (!/^asset_[0-9a-f]{32}$/.test(assetId)) throw new Error("asset.asset_id is invalid");
  if (item.network !== "solana") throw new Error("asset.network is invalid");
  return {
    asset_id: assetId,
    symbol: string(item.symbol, "asset.symbol"),
    name: string(item.name, "asset.name"),
    decimals: integer(item.decimals, "asset.decimals", 255),
    ...(item.logo_url === undefined
      ? {}
      : { logo_url: string(item.logo_url, "asset.logo_url") }),
    network: "solana",
  };
}

export function platformAssetsResponse(value: unknown): PlatformAssetsResponse {
  const response = object(value, "assets response");
  exactKeys(
    response,
    ["schema_version", "contract_version", "server_time_ms", "assets", "page"],
    "assets response",
  );
  version(response);
  if (!Array.isArray(response.assets)) throw new Error("assets must be an array");
  const assets = response.assets.map(asset);
  unique(assets.map((item) => item.asset_id), "asset IDs");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    assets,
    page: pageInfo(response.page),
  };
}

export function platformSwapQuoteResponse(value: unknown): PlatformSwapQuoteResponse {
  const response = object(value, "swap quote response");
  exactKeys(
    response,
    [
      "schema_version", "contract_version", "quote_id", "server_time_ms", "expires_at_ms",
      "input_asset_id", "output_asset_id", "amount_in_atoms", "amount_in_consumed_atoms",
      "amount_out_atoms", "minimum_output_atoms", "input_fee_atoms", "output_fee_atoms",
      "maximum_tolerance_bps", "reference_price", "price_impact_pct", "provider",
    ],
    "swap quote response",
  );
  version(response);
  const quoteId = string(response.quote_id, "quote_id");
  if (!/^sq_[0-9a-f]{32}$/.test(quoteId)) throw new Error("quote_id is invalid");
  const inputAssetId = string(response.input_asset_id, "input_asset_id");
  const outputAssetId = string(response.output_asset_id, "output_asset_id");
  if (!/^asset_[0-9a-f]{32}$/.test(inputAssetId)
      || !/^asset_[0-9a-f]{32}$/.test(outputAssetId)
      || inputAssetId === outputAssetId) {
    throw new Error("swap quote asset identity is invalid");
  }
  if (response.provider !== "Sonar") throw new Error("swap quote provider is invalid");
  const serverTimeMs = integer(response.server_time_ms, "server_time_ms");
  const expiresAtMs = integer(response.expires_at_ms, "expires_at_ms");
  if (expiresAtMs <= serverTimeMs) throw new Error("swap quote is already expired");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    quote_id: quoteId,
    server_time_ms: serverTimeMs,
    expires_at_ms: expiresAtMs,
    input_asset_id: inputAssetId,
    output_asset_id: outputAssetId,
    amount_in_atoms: atomicString(response.amount_in_atoms, "amount_in_atoms", false),
    amount_in_consumed_atoms: atomicString(
      response.amount_in_consumed_atoms,
      "amount_in_consumed_atoms",
      false,
    ),
    amount_out_atoms: atomicString(response.amount_out_atoms, "amount_out_atoms", false),
    minimum_output_atoms: atomicString(
      response.minimum_output_atoms,
      "minimum_output_atoms",
    ),
    input_fee_atoms: atomicString(response.input_fee_atoms, "input_fee_atoms"),
    output_fee_atoms: atomicString(response.output_fee_atoms, "output_fee_atoms"),
    maximum_tolerance_bps: integer(
      response.maximum_tolerance_bps,
      "maximum_tolerance_bps",
      1_000,
    ),
    reference_price: decimalPrice(response.reference_price, "reference_price"),
    price_impact_pct: decimalPrice(response.price_impact_pct, "price_impact_pct"),
    provider: "Sonar",
  };
}

function market(value: unknown): PlatformMarket {
  const item = object(value, "platform market");
  exactKeys(
    item,
    ["market_id", "label", "base_asset_id", "quote_asset_id", "status", "available_actions"],
    "platform market",
  );
  const marketId = string(item.market_id, "market.market_id");
  const baseAssetId = string(item.base_asset_id, "market.base_asset_id");
  const quoteAssetId = string(item.quote_asset_id, "market.quote_asset_id");
  if (!/^market_[0-9a-f]{32}$/.test(marketId)) throw new Error("market.market_id is invalid");
  if (!/^asset_[0-9a-f]{32}$/.test(baseAssetId) || !/^asset_[0-9a-f]{32}$/.test(quoteAssetId)) {
    throw new Error("market asset identity is invalid");
  }
  if (!MARKET_STATES.includes(item.status as typeof MARKET_STATES[number])) {
    throw new Error("market.status is invalid");
  }
  if (!Array.isArray(item.available_actions)) {
    throw new Error("market.available_actions must be an array");
  }
  const availableActions = item.available_actions.map((action) => {
    if (!MARKET_ACTIONS.includes(action as PlatformMarketAction)) {
      throw new Error("market action is invalid");
    }
    return action as PlatformMarketAction;
  });
  unique(availableActions, "market actions");
  return {
    market_id: marketId,
    label: string(item.label, "market.label"),
    base_asset_id: baseAssetId,
    quote_asset_id: quoteAssetId,
    status: item.status as typeof MARKET_STATES[number],
    available_actions: availableActions,
  };
}

export function platformMarketsResponse(value: unknown): PlatformMarketsResponse {
  const response = object(value, "platform markets response");
  exactKeys(
    response,
    ["schema_version", "contract_version", "server_time_ms", "markets", "page"],
    "platform markets response",
  );
  version(response);
  if (!Array.isArray(response.markets)) throw new Error("markets must be an array");
  const markets = response.markets.map(market);
  unique(markets.map((item) => item.market_id), "market IDs");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    markets,
    page: pageInfo(response.page),
  };
}

function bookLevel(value: unknown, field: string): PlatformBookLevel {
  const item = object(value, field);
  exactKeys(item, ["price_atoms", "size_atoms"], field);
  return {
    price_atoms: atomicString(item.price_atoms, `${field}.price_atoms`, false),
    size_atoms: atomicString(item.size_atoms, `${field}.size_atoms`, false),
  };
}

function bookLevels(value: unknown, field: string, descending: boolean): PlatformBookLevel[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const rows = value.map((item, index) => bookLevel(item, `${field}[${index}]`));
  unique(rows.map((row) => row.price_atoms), `${field} prices`);
  for (let index = 1; index < rows.length; index += 1) {
    const previous = BigInt(rows[index - 1]!.price_atoms);
    const current = BigInt(rows[index]!.price_atoms);
    if ((descending && previous <= current) || (!descending && previous >= current)) {
      throw new Error(`${field} is not in price priority order`);
    }
  }
  return rows;
}

export function platformBookSnapshotResponse(value: unknown): PlatformBookSnapshotResponse {
  const response = object(value, "book snapshot");
  exactKeys(response, [
    "schema_version", "contract_version", "market_id", "stream_id", "sequence",
    "server_time_ms", "snapshot_id", "bids", "asks",
  ], "book snapshot");
  version(response);
  const id = marketId(response.market_id);
  const streamId = string(response.stream_id, "stream_id");
  if (streamId !== `book:${id}`) throw new Error("book stream identity is invalid");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    market_id: id,
    stream_id: streamId,
    sequence: atomicString(response.sequence, "sequence", false),
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    snapshot_id: string(response.snapshot_id, "snapshot_id"),
    bids: bookLevels(response.bids, "bids", true),
    asks: bookLevels(response.asks, "asks", false),
  };
}

export function platformBestBidAskResponse(value: unknown): PlatformBestBidAskResponse {
  const response = object(value, "best bid and ask");
  exactKeys(response, [
    "schema_version", "contract_version", "market_id", "stream_id", "sequence",
    "server_time_ms", "best_bid", "best_ask",
  ], "best bid and ask");
  version(response);
  const id = marketId(response.market_id);
  const streamId = string(response.stream_id, "stream_id");
  if (streamId !== `book:${id}`) throw new Error("book stream identity is invalid");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    market_id: id,
    stream_id: streamId,
    sequence: atomicString(response.sequence, "sequence", false),
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    best_bid: response.best_bid === null ? null : bookLevel(response.best_bid, "best_bid"),
    best_ask: response.best_ask === null ? null : bookLevel(response.best_ask, "best_ask"),
  };
}

export function platformFeeScheduleResponse(value: unknown): PlatformFeeScheduleResponse {
  const response = object(value, "fee schedule");
  exactKeys(response, [
    "schema_version", "contract_version", "market_id", "server_time_ms",
    "passive_maker_fee_bps", "maximum_immediate_execution_fee_bps",
    "book_prices_include_trading_fees", "exact_fee_returned_by_quote",
  ], "fee schedule");
  version(response);
  if (typeof response.book_prices_include_trading_fees !== "boolean"
    || typeof response.exact_fee_returned_by_quote !== "boolean") {
    throw new Error("fee schedule flags must be boolean");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    market_id: marketId(response.market_id),
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    passive_maker_fee_bps: integer(response.passive_maker_fee_bps, "passive_maker_fee_bps", 10_000),
    maximum_immediate_execution_fee_bps: integer(
      response.maximum_immediate_execution_fee_bps,
      "maximum_immediate_execution_fee_bps",
      10_000,
    ),
    book_prices_include_trading_fees: response.book_prices_include_trading_fees,
    exact_fee_returned_by_quote: response.exact_fee_returned_by_quote,
  };
}

export function platformMarketStatusResponse(value: unknown): PlatformMarketStatusResponse {
  const response = object(value, "market status");
  exactKeys(response, [
    "schema_version", "contract_version", "market_id", "server_time_ms", "status",
    "tick_size_atoms", "minimum_order_size_atoms",
  ], "market status");
  version(response);
  if (!MARKET_STATES.includes(response.status as typeof MARKET_STATES[number])) {
    throw new Error("market status is invalid");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    market_id: marketId(response.market_id),
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    status: response.status as typeof MARKET_STATES[number],
    tick_size_atoms: atomicString(response.tick_size_atoms, "tick_size_atoms"),
    minimum_order_size_atoms: atomicString(
      response.minimum_order_size_atoms,
      "minimum_order_size_atoms",
      false,
    ),
  };
}

export function platformCandlesResponse(value: unknown): PlatformCandlesResponse {
  const response = object(value, "platform candles response");
  exactKeys(response, [
    "schema_version", "contract_version", "market_id", "server_time_ms",
    "resolution_seconds", "candles",
  ], "platform candles response");
  version(response);
  const resolution = integer(response.resolution_seconds, "resolution_seconds", 86_400);
  if (resolution < 60 || resolution % 60 !== 0) throw new Error("candle resolution is invalid");
  if (!Array.isArray(response.candles) || response.candles.length > 5_000) {
    throw new Error("candles must be a bounded array");
  }
  let previousStartedAt = -1;
  const candles = response.candles.map((raw, index) => {
    const candle = object(raw, `candles[${index}]`);
    exactKeys(candle, [
      "started_at_ms", "open_price", "high_price", "low_price", "close_price",
    ], `candles[${index}]`);
    const startedAt = integer(candle.started_at_ms, `candles[${index}].started_at_ms`);
    if (startedAt <= previousStartedAt) throw new Error("candles must be time ordered");
    previousStartedAt = startedAt;
    const open = decimalPrice(candle.open_price, `candles[${index}].open_price`);
    const high = decimalPrice(candle.high_price, `candles[${index}].high_price`);
    const low = decimalPrice(candle.low_price, `candles[${index}].low_price`);
    const close = decimalPrice(candle.close_price, `candles[${index}].close_price`);
    if (Number(high) < Math.max(Number(open), Number(close))
        || Number(low) > Math.min(Number(open), Number(close))) {
      throw new Error(`candles[${index}] has invalid OHLC bounds`);
    }
    return {
      started_at_ms: startedAt,
      open_price: open,
      high_price: high,
      low_price: low,
      close_price: close,
    };
  });
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    market_id: marketId(response.market_id),
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    resolution_seconds: resolution,
    candles,
  };
}

export function platformMarkResponse(value: unknown): PlatformMarkResponse {
  const response = object(value, "platform mark response");
  exactKeys(response, [
    "schema_version", "contract_version", "market_id", "server_time_ms",
    "price_atoms_per_base_unit", "quote_decimals", "stale", "age_ms",
  ], "platform mark response");
  version(response);
  const price = response.price_atoms_per_base_unit === null
    ? null
    : atomicString(response.price_atoms_per_base_unit, "price_atoms_per_base_unit", false);
  if (typeof response.stale !== "boolean" || response.stale !== (price === null)) {
    throw new Error("mark price and stale state disagree");
  }
  const quoteDecimals = integer(response.quote_decimals, "quote_decimals", 18);
  const age = response.age_ms === null ? null : integer(response.age_ms, "age_ms");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    market_id: marketId(response.market_id),
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    price_atoms_per_base_unit: price,
    quote_decimals: quoteDecimals,
    stale: response.stale,
    age_ms: age,
  };
}

export function platformExecutionStatusResponse(value: unknown): PlatformExecutionStatusResponse {
  const response = object(value, "platform execution status response");
  exactKeys(response, [
    "schema_version", "contract_version", "execution_id", "market_id", "status",
    "signature", "settlement", "updated_at_ms",
  ], "platform execution status response");
  version(response);
  const executionId = string(response.execution_id, "execution_id");
  if (!/^se_[0-9a-f]{32}$/.test(executionId)) throw new Error("execution_id is invalid");
  if (response.status !== "prepared" && response.status !== "confirmed") {
    throw new Error("execution status is invalid");
  }
  const signature = response.signature === null
    ? null
    : string(response.signature, "signature");
  if (signature !== null && !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) {
    throw new Error("execution signature is invalid");
  }
  if (response.status === "prepared") {
    if (signature !== null || response.settlement !== "pending") {
      throw new Error("prepared execution receipt is inconsistent");
    }
  } else if (signature === null || response.settlement !== "confirmed") {
    throw new Error("confirmed execution receipt is inconsistent");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    execution_id: executionId,
    market_id: marketId(response.market_id),
    status: response.status,
    signature,
    settlement: response.settlement,
    updated_at_ms: integer(response.updated_at_ms, "updated_at_ms"),
  };
}

function optionalTransactionSignature(value: unknown, field: string): string | null {
  if (value === null) return null;
  const signature = string(value, field);
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) {
    throw new Error(`${field} is invalid`);
  }
  return signature;
}

function twapEntry(raw: unknown, field: string): PlatformTwap {
    const twap = object(raw, field);
    exactKeys(twap, [
      "twap_id", "side", "status", "slices_total", "slices_executed",
      "interval_slots", "maximum_tolerance_bps", "limit_price_atoms",
      "total_size_atoms", "executed_size_atoms", "gross_quote_executed_atoms",
      "complete_execution_value", "created_at_ms", "completed_at_ms",
      "placed_signature", "terminal_signature", "fills",
    ], field);
    const twapId = string(twap.twap_id, `${field}.twap_id`);
    if (!/^twap_[0-9a-f]{32}$/.test(twapId)) throw new Error("twap_id is invalid");
    const side = twap.side;
    if (side !== "buy" && side !== "sell") throw new Error("TWAP side is invalid");
    if (!(["active", "completed", "cancelled"] as const).includes(
      twap.status as "active" | "completed" | "cancelled",
    )) throw new Error("TWAP status is invalid");
    const slicesTotal = integer(twap.slices_total, "slices_total", 120);
    const slicesExecuted = integer(twap.slices_executed, "slices_executed", slicesTotal);
    if (slicesTotal < 2) throw new Error("TWAP slices_total is invalid");
    if (typeof twap.complete_execution_value !== "boolean") {
      throw new Error("TWAP complete_execution_value is invalid");
    }
    if (!Array.isArray(twap.fills) || twap.fills.length > 120) {
      throw new Error("TWAP fills must be a bounded array");
    }
    const fills = twap.fills.map((rawFill, fillIndex) => {
      const fill = object(rawFill, `${field}.fills[${fillIndex}]`);
      exactKeys(fill, [
        "fill_id", "size_atoms", "price_atoms", "gross_quote_atoms", "base_fee_atoms",
        "quote_fee_atoms", "signature", "observed_at_ms",
      ], `${field}.fills[${fillIndex}]`);
      const fillId = string(fill.fill_id, "fill_id");
      if (!/^twap_fill_[0-9a-f]{32}$/.test(fillId)) throw new Error("TWAP fill_id is invalid");
      return {
        fill_id: fillId,
        size_atoms: atomicString(fill.size_atoms, "size_atoms", false),
        price_atoms: atomicString(fill.price_atoms, "price_atoms", false),
        gross_quote_atoms: atomicString(fill.gross_quote_atoms, "gross_quote_atoms"),
        base_fee_atoms: atomicString(fill.base_fee_atoms, "base_fee_atoms"),
        quote_fee_atoms: atomicString(fill.quote_fee_atoms, "quote_fee_atoms"),
        signature: optionalTransactionSignature(fill.signature, "signature"),
        observed_at_ms: integer(fill.observed_at_ms, "observed_at_ms"),
      };
    });
    return {
      twap_id: twapId,
      side,
      status: twap.status as "active" | "completed" | "cancelled",
      slices_total: slicesTotal,
      slices_executed: slicesExecuted,
      interval_slots: integer(twap.interval_slots, "interval_slots"),
      maximum_tolerance_bps: integer(twap.maximum_tolerance_bps, "maximum_tolerance_bps", 1_000),
      limit_price_atoms: atomicString(twap.limit_price_atoms, "limit_price_atoms", false),
      total_size_atoms: atomicString(twap.total_size_atoms, "total_size_atoms", false),
      executed_size_atoms: atomicString(twap.executed_size_atoms, "executed_size_atoms"),
      gross_quote_executed_atoms: atomicString(
        twap.gross_quote_executed_atoms,
        "gross_quote_executed_atoms",
      ),
      complete_execution_value: twap.complete_execution_value,
      created_at_ms: integer(twap.created_at_ms, "created_at_ms"),
      completed_at_ms: twap.completed_at_ms === null
        ? null
        : integer(twap.completed_at_ms, "completed_at_ms"),
      placed_signature: optionalTransactionSignature(twap.placed_signature, "placed_signature"),
      terminal_signature: optionalTransactionSignature(twap.terminal_signature, "terminal_signature"),
      fills,
    };
}

export function platformTwapsResponse(value: unknown): PlatformTwapsResponse {
  const response = object(value, "platform TWAP response");
  exactKeys(response, [
    "schema_version", "contract_version", "market_id", "wallet_address",
    "server_time_ms", "twaps",
  ], "platform TWAP response");
  version(response);
  const wallet = string(response.wallet_address, "wallet_address");
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) throw new Error("wallet_address is invalid");
  if (!Array.isArray(response.twaps) || response.twaps.length > 2_000) {
    throw new Error("twaps must be a bounded array");
  }
  const twaps = response.twaps.map<PlatformTwap>((raw, index) => twapEntry(raw, `twaps[${index}]`));
  unique(twaps.map((twap) => twap.twap_id), "TWAP IDs");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    market_id: marketId(response.market_id),
    wallet_address: wallet,
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    twaps,
  };
}

function twapControlAction(value: unknown, field: string): PlatformTwapControlAction {
  if (value !== "place" && value !== "cancel") throw new Error(`${field} is invalid`);
  return value;
}

function twapId(value: unknown, field: string): string {
  const id = string(value, field);
  if (!/^twap_[0-9a-f]{32}$/.test(id)) throw new Error(`${field} is invalid`);
  return id;
}

export function platformTwapChallengeResponse(
  value: unknown,
): PlatformTwapChallengeResponse {
  const response = object(value, "TWAP challenge response");
  exactKeys(response, [
    "schema_version", "contract_version", "challenge_id", "market_id", "action",
    "twap_id", "authorization_payload_base64", "server_time_ms", "expires_at_ms",
  ], "TWAP challenge response");
  version(response);
  const serverTime = integer(response.server_time_ms, "server_time_ms");
  const expiresAt = integer(response.expires_at_ms, "expires_at_ms");
  if (expiresAt <= serverTime) throw new Error("TWAP challenge is already expired");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    challenge_id: opaqueHandle(response.challenge_id, "challenge_id", "twc_"),
    market_id: marketId(response.market_id),
    action: twapControlAction(response.action, "action"),
    twap_id: twapId(response.twap_id, "twap_id"),
    authorization_payload_base64: canonicalBase64(
      response.authorization_payload_base64,
      "authorization_payload_base64",
    ),
    server_time_ms: serverTime,
    expires_at_ms: expiresAt,
  };
}

export function platformTwapPrepareResponse(value: unknown): PlatformTwapPrepareResponse {
  const response = object(value, "TWAP prepare response");
  exactKeys(response, [
    "schema_version", "contract_version", "twap_control_id", "market_id", "action",
    "twap_id", "transaction_base64", "recent_blockhash", "last_valid_block_height",
    "expires_at_ms",
  ], "TWAP prepare response");
  version(response);
  const recentBlockhash = string(response.recent_blockhash, "recent_blockhash");
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(recentBlockhash)) {
    throw new Error("recent_blockhash is invalid");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    twap_control_id: opaqueHandle(response.twap_control_id, "twap_control_id", "twctl_"),
    market_id: marketId(response.market_id),
    action: twapControlAction(response.action, "action"),
    twap_id: twapId(response.twap_id, "twap_id"),
    transaction_base64: canonicalBase64(response.transaction_base64, "transaction_base64"),
    recent_blockhash: recentBlockhash,
    last_valid_block_height: integer(
      response.last_valid_block_height,
      "last_valid_block_height",
    ),
    expires_at_ms: integer(response.expires_at_ms, "expires_at_ms"),
  };
}

export function platformTwapSubmitResponse(value: unknown): PlatformTwapSubmitResponse {
  const response = object(value, "TWAP submit response");
  exactKeys(response, [
    "schema_version", "contract_version", "twap_control_id", "market_id", "action",
    "twap_id", "signature", "status",
  ], "TWAP submit response");
  version(response);
  if (response.status !== "submitted") throw new Error("TWAP submission status is invalid");
  const signature = string(response.signature, "signature");
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) {
    throw new Error("signature is invalid");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    twap_control_id: opaqueHandle(response.twap_control_id, "twap_control_id", "twctl_"),
    market_id: marketId(response.market_id),
    action: twapControlAction(response.action, "action"),
    twap_id: twapId(response.twap_id, "twap_id"),
    signature,
    status: "submitted",
  };
}

function nullableInteger(value: unknown, field: string): number | null {
  return value === null ? null : integer(value, field);
}

function twapStreamIdentity(value: unknown, field = "stream_id"): string {
  const id = string(value, field);
  if (!/^twap_stream_[0-9a-f]{32}$/.test(id)) throw new Error(`${field} is invalid`);
  return id;
}

export function platformTwapEvent(value: unknown): PlatformTwapEvent {
  const event = object(value, "TWAP event");
  const type = string(event.type, "TWAP event.type");
  if (type === "twaps_snapshot") {
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "wallet_address",
      "stream_id", "sequence", "server_time_ms", "twaps",
    ], "TWAP stream snapshot");
    version(event);
    if (!Array.isArray(event.twaps) || event.twaps.length > 2_000) {
      throw new Error("twaps must be a bounded array");
    }
    const twaps = event.twaps.map((raw, index) => twapEntry(raw, `twaps[${index}]`));
    unique(twaps.map((twap) => twap.twap_id), "TWAP IDs");
    return {
      type,
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: marketId(event.market_id),
      wallet_address: walletAddress(event.wallet_address),
      stream_id: twapStreamIdentity(event.stream_id),
      sequence: atomicString(event.sequence, "sequence", false),
      server_time_ms: integer(event.server_time_ms, "server_time_ms"),
      twaps,
    };
  }
  if (type === "twap_update" || type === "heartbeat") {
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "wallet_address",
      "stream_id", "sequence", "previous_sequence", "server_time_ms",
      ...(type === "twap_update" ? ["twap"] : []),
    ], `TWAP ${type} event`);
    version(event);
    const base = {
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: marketId(event.market_id),
      wallet_address: walletAddress(event.wallet_address),
      stream_id: twapStreamIdentity(event.stream_id),
      sequence: atomicString(event.sequence, "sequence", false),
      previous_sequence: atomicString(event.previous_sequence, "previous_sequence", false),
      server_time_ms: integer(event.server_time_ms, "server_time_ms"),
    } as const;
    if (type === "twap_update") return { type, ...base, twap: twapEntry(event.twap, "twap") };
    return { type, ...base };
  }
  throw new Error("TWAP event type is invalid");
}

function executionHandle(value: unknown, field: string): string {
  const id = string(value, field);
  if (!/^se_[0-9a-f]{32}$/.test(id)) throw new Error(`${field} is invalid`);
  return id;
}

function executionRow(value: unknown, field: string): PlatformExecutionRow {
  const row = object(value, field);
  exactKeys(row, [
    "execution_id", "market_id", "status", "signature", "settlement", "updated_at_ms",
  ], field);
  if (row.status !== "prepared" && row.status !== "confirmed") {
    throw new Error(`${field}.status is invalid`);
  }
  if (!FILL_SETTLEMENT_STATES.includes(row.settlement as typeof FILL_SETTLEMENT_STATES[number])) {
    throw new Error(`${field}.settlement is invalid`);
  }
  const signature = row.signature === null
    ? null
    : string(row.signature, `${field}.signature`);
  if (signature !== null && !/^[1-9A-HJ-NP-Za-km-z]{32,100}$/.test(signature)) {
    throw new Error(`${field}.signature is invalid`);
  }
  if ((row.status === "confirmed") !== (signature !== null)) {
    throw new Error(`${field} confirmation and signature disagree`);
  }
  if ((row.status === "confirmed") !== (row.settlement === "confirmed")) {
    throw new Error(`${field} status and settlement disagree`);
  }
  return {
    execution_id: executionHandle(row.execution_id, `${field}.execution_id`),
    market_id: marketId(row.market_id, `${field}.market_id`),
    status: row.status,
    signature,
    settlement: row.settlement as PlatformExecutionRow["settlement"],
    updated_at_ms: integer(row.updated_at_ms, `${field}.updated_at_ms`),
  };
}

function executionStreamIdentity(value: unknown, field = "stream_id"): string {
  const id = string(value, field);
  if (!/^execution_stream_[0-9a-f]{32}$/.test(id)) throw new Error(`${field} is invalid`);
  return id;
}

export function platformExecutionEvent(value: unknown): PlatformExecutionEvent {
  const event = object(value, "execution event");
  const type = string(event.type, "execution event.type");
  if (type === "executions_snapshot") {
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "stream_id", "sequence",
      "server_time_ms", "executions", "unknown_execution_ids",
    ], "execution stream snapshot");
    version(event);
    const market = marketId(event.market_id);
    const executions = boundedArray(event.executions, "executions", 64)
      .map((raw, index) => executionRow(raw, `executions[${index}]`));
    if (executions.some((row) => row.market_id !== market)) {
      throw new Error("execution stream rows must belong to the stream market");
    }
    const unknown = boundedArray(event.unknown_execution_ids, "unknown_execution_ids", 64)
      .map((raw, index) => executionHandle(raw, `unknown_execution_ids[${index}]`));
    unique([...executions.map((row) => row.execution_id), ...unknown], "watched executions");
    return {
      type,
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: market,
      stream_id: executionStreamIdentity(event.stream_id),
      sequence: atomicString(event.sequence, "sequence", false),
      server_time_ms: integer(event.server_time_ms, "server_time_ms"),
      executions,
      unknown_execution_ids: unknown,
    };
  }
  if (
    type === "execution_update" || type === "execution_expired"
    || type === "execution_unknown" || type === "heartbeat"
  ) {
    const payload = type === "execution_update"
      ? ["execution"]
      : type === "heartbeat" ? [] : ["execution_id"];
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "stream_id", "sequence",
      "previous_sequence", "server_time_ms", ...payload,
    ], `execution ${type} event`);
    version(event);
    const market = marketId(event.market_id);
    const base = {
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: market,
      stream_id: executionStreamIdentity(event.stream_id),
      sequence: atomicString(event.sequence, "sequence", false),
      previous_sequence: atomicString(event.previous_sequence, "previous_sequence", false),
      server_time_ms: integer(event.server_time_ms, "server_time_ms"),
    } as const;
    if (type === "execution_update") {
      const execution = executionRow(event.execution, "execution");
      if (execution.market_id !== market) {
        throw new Error("execution update must belong to the stream market");
      }
      return { type, ...base, execution };
    }
    if (type === "heartbeat") return { type, ...base };
    return { type, ...base, execution_id: executionHandle(event.execution_id, "execution_id") };
  }
  throw new Error("execution event type is invalid");
}

export function platformPortfolioHistoryResponse(
  value: unknown,
): PlatformPortfolioHistoryResponse {
  const response = object(value, "platform portfolio history response");
  exactKeys(response, [
    "schema_version", "contract_version", "wallet_address", "server_time_ms", "range",
    "points", "collecting", "first_sample_ms", "last_sample_ms",
  ], "platform portfolio history response");
  version(response);
  if (response.range !== "24h" && response.range !== "7d" && response.range !== "30d") {
    throw new Error("portfolio history range is invalid");
  }
  if (!Array.isArray(response.points) || response.points.length > 10_000) {
    throw new Error("portfolio history points must be a bounded array");
  }
  const points = response.points.map<PlatformPortfolioHistoryPoint>((raw, index) => {
    const point = object(raw, `points[${index}]`);
    exactKeys(point, [
      "recorded_at_ms", "equity_usd_micros", "available_usd_micros",
      "locked_usd_micros", "market_count",
    ], `points[${index}]`);
    return {
      recorded_at_ms: integer(point.recorded_at_ms, "recorded_at_ms"),
      equity_usd_micros: atomicString(point.equity_usd_micros, "equity_usd_micros"),
      available_usd_micros: atomicString(point.available_usd_micros, "available_usd_micros"),
      locked_usd_micros: atomicString(point.locked_usd_micros, "locked_usd_micros"),
      market_count: integer(point.market_count, "market_count", 100_000),
    };
  });
  for (let index = 1; index < points.length; index += 1) {
    if (points[index]!.recorded_at_ms <= points[index - 1]!.recorded_at_ms) {
      throw new Error("portfolio history points must be strictly chronological");
    }
  }
  const firstSample = nullableInteger(response.first_sample_ms, "first_sample_ms");
  const lastSample = nullableInteger(response.last_sample_ms, "last_sample_ms");
  if (typeof response.collecting !== "boolean") throw new Error("collecting must be boolean");
  if (points.length > 0 && (
    firstSample !== points[0]!.recorded_at_ms
    || lastSample !== points[points.length - 1]!.recorded_at_ms
  )) throw new Error("portfolio history sample bounds disagree");
  if (points.length === 0 && (firstSample !== null || lastSample !== null)) {
    throw new Error("empty portfolio history cannot have sample bounds");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    wallet_address: walletAddress(response.wallet_address),
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    range: response.range,
    points,
    collecting: response.collecting,
    first_sample_ms: firstSample,
    last_sample_ms: lastSample,
  };
}

function nullableAtomicString(value: unknown, field: string): string | null {
  return value === null ? null : atomicString(value, field);
}

export function platformPortfolioResponse(value: unknown): PlatformPortfolioResponse {
  const response = object(value, "platform portfolio response");
  exactKeys(response, [
    "schema_version", "contract_version", "wallet_address", "server_time_ms",
    "observed_at_ms", "observed_slot", "market_count", "balances", "positions",
    "open_orders", "recent_fills", "unavailable_market_ids",
    "equity_usd_micros", "available_usd_micros", "locked_usd_micros",
    "valuation_complete", "unpriced_asset_ids",
  ], "platform portfolio response");
  version(response);
  if (!Array.isArray(response.balances) || response.balances.length > 10_000) {
    throw new Error("portfolio balances must be a bounded array");
  }
  if (!Array.isArray(response.positions) || response.positions.length > 10_000) {
    throw new Error("portfolio positions must be a bounded array");
  }
  if (!Array.isArray(response.unpriced_asset_ids) || response.unpriced_asset_ids.length > 10_000) {
    throw new Error("portfolio unpriced_asset_ids must be a bounded array");
  }
  const balances = response.balances.map<PlatformPortfolioBalance>((raw, index) => {
    const balance = object(raw, `balances[${index}]`);
    exactKeys(balance, [
      "asset_id", "available_atoms", "locked_atoms", "total_atoms", "value_usd_micros",
    ], `balances[${index}]`);
    const available = atomicString(balance.available_atoms, "available_atoms");
    const locked = atomicString(balance.locked_atoms, "locked_atoms");
    const total = atomicString(balance.total_atoms, "total_atoms", false);
    if (BigInt(available) + BigInt(locked) !== BigInt(total)) {
      throw new Error("portfolio balance total must equal available plus locked");
    }
    return {
      asset_id: assetId(balance.asset_id),
      available_atoms: available,
      locked_atoms: locked,
      total_atoms: total,
      value_usd_micros: nullableAtomicString(balance.value_usd_micros, "value_usd_micros"),
    };
  });
  unique(balances.map((balance) => balance.asset_id), "portfolio balances");
  const positions = response.positions.map<PlatformPortfolioPosition>((raw, index) => {
    const position = object(raw, `positions[${index}]`);
    exactKeys(position, [
      "market_id", "base_asset_id", "quote_asset_id", "base_available_atoms",
      "base_locked_atoms", "quote_available_atoms", "quote_locked_atoms",
    ], `positions[${index}]`);
    const base = assetId(position.base_asset_id, "base_asset_id");
    const quote = assetId(position.quote_asset_id, "quote_asset_id");
    if (base === quote) throw new Error("portfolio position assets must differ");
    return {
      market_id: marketId(position.market_id),
      base_asset_id: base,
      quote_asset_id: quote,
      base_available_atoms: atomicString(position.base_available_atoms, "base_available_atoms"),
      base_locked_atoms: atomicString(position.base_locked_atoms, "base_locked_atoms"),
      quote_available_atoms: atomicString(position.quote_available_atoms, "quote_available_atoms"),
      quote_locked_atoms: atomicString(position.quote_locked_atoms, "quote_locked_atoms"),
    };
  });
  unique(positions.map((position) => position.market_id), "portfolio positions");
  if (!Array.isArray(response.open_orders) || response.open_orders.length > 10_000) {
    throw new Error("portfolio open_orders must be a bounded array");
  }
  if (!Array.isArray(response.recent_fills) || response.recent_fills.length > 10_000) {
    throw new Error("portfolio recent_fills must be a bounded array");
  }
  if (
    !Array.isArray(response.unavailable_market_ids)
    || response.unavailable_market_ids.length > 10_000
  ) {
    throw new Error("portfolio unavailable_market_ids must be a bounded array");
  }
  const openOrders = response.open_orders.map<PlatformPortfolioOrder>((raw, index) => {
    const { market_id, ...order } = object(raw, `open_orders[${index}]`);
    return { market_id: marketId(market_id), ...accountOrder(order, `open_orders[${index}]`) };
  });
  unique(openOrders.map((order) => order.order_id), "portfolio open orders");
  const recentFills = response.recent_fills.map<PlatformPortfolioFill>((raw, index) => {
    const { market_id, ...fill } = object(raw, `recent_fills[${index}]`);
    return { market_id: marketId(market_id), ...accountFill(fill, `recent_fills[${index}]`) };
  });
  unique(recentFills.map((fill) => fill.fill_id), "portfolio recent fills");
  const unavailableMarkets = response.unavailable_market_ids.map((raw, index) =>
    marketId(raw, `unavailable_market_ids[${index}]`));
  unique(unavailableMarkets, "portfolio unavailable_market_ids");
  const unpriced = response.unpriced_asset_ids.map((raw, index) =>
    assetId(raw, `unpriced_asset_ids[${index}]`));
  unique(unpriced, "portfolio unpriced_asset_ids");
  if (typeof response.valuation_complete !== "boolean") {
    throw new Error("valuation_complete must be boolean");
  }
  const heldAssets = new Set(balances.map((balance) => balance.asset_id));
  for (const id of unpriced) {
    if (!heldAssets.has(id)) throw new Error("unpriced assets must be held assets");
  }
  for (const balance of balances) {
    if ((balance.value_usd_micros === null) !== unpriced.includes(balance.asset_id)) {
      throw new Error("portfolio balance valuation disagrees with unpriced_asset_ids");
    }
  }
  const equity = nullableAtomicString(response.equity_usd_micros, "equity_usd_micros");
  const available = nullableAtomicString(response.available_usd_micros, "available_usd_micros");
  const locked = nullableAtomicString(response.locked_usd_micros, "locked_usd_micros");
  if (response.valuation_complete) {
    if (unpriced.length !== 0 || equity === null || available === null || locked === null) {
      throw new Error("complete portfolio valuation must price every held asset");
    }
    if (BigInt(available) + BigInt(locked) !== BigInt(equity)) {
      throw new Error("portfolio equity must equal available plus locked value");
    }
    const summed = balances.reduce((sum, balance) => sum + BigInt(balance.value_usd_micros!), 0n);
    if (summed !== BigInt(equity)) {
      throw new Error("portfolio equity must equal the sum of balance values");
    }
  } else if (unpriced.length === 0 || equity !== null || available !== null || locked !== null) {
    throw new Error("incomplete portfolio valuation must report null totals");
  }
  const observedAt = integer(response.observed_at_ms, "observed_at_ms");
  const serverTime = integer(response.server_time_ms, "server_time_ms");
  if (observedAt > serverTime) throw new Error("portfolio cannot be observed after server time");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    wallet_address: walletAddress(response.wallet_address),
    server_time_ms: serverTime,
    observed_at_ms: observedAt,
    observed_slot: atomicString(response.observed_slot, "observed_slot"),
    market_count: integer(response.market_count, "market_count", 100_000),
    balances,
    positions,
    open_orders: openOrders,
    recent_fills: recentFills,
    unavailable_market_ids: unavailableMarkets,
    equity_usd_micros: equity,
    available_usd_micros: available,
    locked_usd_micros: locked,
    valuation_complete: response.valuation_complete,
    unpriced_asset_ids: unpriced,
  };
}

function platformVaultSession(
  value: unknown,
  serverTimeMs: number,
  vaultState: "absent" | "active" | "paused",
): PlatformVaultSessionStatus {
  const session = object(value, "vault session");
  exactKeys(session, [
    "session_public_key", "state", "expires_at_ms", "permanent",
    "minimum_interval_seconds", "maximum_tolerance_bps", "last_execution_at_ms",
    "market_execution_ready", "price_protection_active", "spending_limits",
  ], "vault session");
  if (session.state !== "absent" && session.state !== "active" && session.state !== "expired") {
    throw new Error("vault session state is invalid");
  }
  if (typeof session.permanent !== "boolean") throw new Error("permanent must be boolean");
  if (typeof session.market_execution_ready !== "boolean") {
    throw new Error("market_execution_ready must be boolean");
  }
  if (typeof session.price_protection_active !== "boolean") {
    throw new Error("price_protection_active must be boolean");
  }
  const expiresAt = nullableInteger(session.expires_at_ms, "expires_at_ms");
  const lastExecution = nullableInteger(session.last_execution_at_ms, "last_execution_at_ms");
  if (!Array.isArray(session.spending_limits) || session.spending_limits.length > 4) {
    throw new Error("spending_limits must be a bounded array");
  }
  const spendingLimits = session.spending_limits.map<PlatformVaultSpendingLimit>((raw, index) => {
    const limit = object(raw, `spending_limits[${index}]`);
    exactKeys(limit, ["asset_id", "maximum_per_execution_atoms"], `spending_limits[${index}]`);
    return {
      asset_id: assetId(limit.asset_id),
      maximum_per_execution_atoms: limit.maximum_per_execution_atoms === null
        ? null
        : atomicString(limit.maximum_per_execution_atoms, "maximum_per_execution_atoms", false),
    };
  });
  unique(spendingLimits.map((limit) => limit.asset_id), "spending limit assets");
  if (session.permanent !== (expiresAt === null && session.state !== "absent")) {
    throw new Error("vault session permanence is inconsistent");
  }
  if (session.state === "active" && expiresAt !== null && expiresAt <= serverTimeMs) {
    throw new Error("active vault session is expired");
  }
  if (session.state === "expired" && (expiresAt === null || expiresAt > serverTimeMs)) {
    throw new Error("expired vault session has invalid expiry");
  }
  if (
    (vaultState !== "active" || session.state !== "active")
    && (session.market_execution_ready || session.price_protection_active)
  ) {
    throw new Error("inactive vault session cannot be execution-ready");
  }
  return {
    session_public_key: walletAddress(session.session_public_key, "session_public_key"),
    state: session.state,
    expires_at_ms: expiresAt,
    permanent: session.permanent,
    minimum_interval_seconds: integer(
      session.minimum_interval_seconds,
      "minimum_interval_seconds",
      86_400,
    ),
    maximum_tolerance_bps: integer(session.maximum_tolerance_bps, "maximum_tolerance_bps", 10_000),
    last_execution_at_ms: lastExecution,
    market_execution_ready: session.market_execution_ready,
    price_protection_active: session.price_protection_active,
    spending_limits: spendingLimits,
  };
}

export function platformVaultSubmitResponse(value: unknown): PlatformVaultSubmitResponse {
  const response = object(value, "platform vault submission");
  exactKeys(response, [
    "schema_version", "contract_version", "preparation_id", "action", "wallet_address",
    "sponsored", "signature", "status", "failure_code", "updated_at_ms",
  ], "platform vault submission");
  version(response);
  const actions = ["setup", "deposit", "withdraw", "delegate", "policy", "pause"] as const;
  const action = actions.find((candidate) => candidate === response.action);
  if (!action) throw new Error("vault submission action is invalid");
  const statuses = ["submitted", "confirmed", "failed"] as const;
  const status = statuses.find((candidate) => candidate === response.status);
  if (!status) throw new Error("vault submission status is invalid");
  const signature = string(response.signature, "signature");
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) {
    throw new Error("vault submission signature is invalid");
  }
  let failureCode: string | null = null;
  if (response.failure_code !== null) {
    failureCode = string(response.failure_code, "failure_code");
    if (!/^[a-z][a-z0-9_]{2,63}$/.test(failureCode)) {
      throw new Error("failure_code is invalid");
    }
  }
  if ((status === "failed") !== (failureCode !== null)) {
    throw new Error("failure_code does not match the submission status");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    preparation_id: opaqueHandle(response.preparation_id, "preparation_id", "vp_"),
    action,
    wallet_address: walletAddress(response.wallet_address),
    sponsored: boolean(response.sponsored, "sponsored"),
    signature,
    status,
    failure_code: failureCode,
    updated_at_ms: integer(response.updated_at_ms, "updated_at_ms"),
  };
}

export function platformVaultStatusResponse(value: unknown): PlatformVaultStatusResponse {
  const response = object(value, "platform vault status response");
  exactKeys(response, [
    "schema_version", "contract_version", "server_time_ms", "wallet_address", "state",
    "session", "withdrawal_access",
  ], "platform vault status response");
  version(response);
  if (response.state !== "absent" && response.state !== "active" && response.state !== "paused") {
    throw new Error("vault state is invalid");
  }
  const serverTimeMs = integer(response.server_time_ms, "server_time_ms");
  const session = response.session === null
    ? null
    : platformVaultSession(response.session, serverTimeMs, response.state);
  const withdrawal = object(response.withdrawal_access, "withdrawal_access");
  exactKeys(withdrawal, ["mode", "allowed_wallet_addresses"], "withdrawal_access");
  if (
    withdrawal.mode !== "unrestricted"
    && withdrawal.mode !== "blocked"
    && withdrawal.mode !== "restricted"
  ) throw new Error("withdrawal access mode is invalid");
  if (!Array.isArray(withdrawal.allowed_wallet_addresses) || withdrawal.allowed_wallet_addresses.length > 8) {
    throw new Error("allowed_wallet_addresses must be a bounded array");
  }
  const allowedWallets = withdrawal.allowed_wallet_addresses.map((address, index) =>
    walletAddress(address, `allowed_wallet_addresses[${index}]`));
  unique(allowedWallets, "allowed withdrawal wallets");
  if ((withdrawal.mode === "restricted") !== (allowedWallets.length > 0)) {
    throw new Error("withdrawal access mode and wallet list disagree");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: serverTimeMs,
    wallet_address: walletAddress(response.wallet_address),
    state: response.state,
    session,
    withdrawal_access: {
      mode: withdrawal.mode,
      allowed_wallet_addresses: allowedWallets,
    },
  };
}

export function platformVaultPausePrepareResponse(
  value: unknown,
): PlatformVaultPausePrepareResponse {
  const response = object(value, "platform vault pause preparation response");
  exactKeys(response, [
    "schema_version", "contract_version", "server_time_ms", "wallet_address", "paused",
    "transaction_base64", "recent_blockhash", "owner_signature_required",
    "preparation_id", "sponsored", "submit_by_ms",
  ], "platform vault pause preparation response");
  version(response);
  if (typeof response.paused !== "boolean") throw new Error("paused must be boolean");
  if (response.owner_signature_required !== true) {
    throw new Error("owner_signature_required must be true");
  }
  const blockhash = walletAddress(response.recent_blockhash, "recent_blockhash");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    wallet_address: walletAddress(response.wallet_address),
    paused: response.paused,
    transaction_base64: canonicalBase64(response.transaction_base64, "transaction_base64"),
    recent_blockhash: blockhash,
    owner_signature_required: true,
    preparation_id: opaqueHandle(response.preparation_id, "preparation_id", "vp_"),
    sponsored: boolean(response.sponsored, "sponsored"),
    submit_by_ms: integer(response.submit_by_ms, "submit_by_ms"),
  };
}

export function platformVaultDelegatePrepareResponse(
  value: unknown,
): PlatformVaultDelegatePrepareResponse {
  const response = object(value, "platform vault delegate preparation response");
  exactKeys(response, [
    "schema_version", "contract_version", "server_time_ms", "wallet_address",
    "session_public_key", "action", "transaction_base64", "recent_blockhash",
    "owner_signature_required", "preparation_id", "sponsored", "submit_by_ms",
  ], "platform vault delegate preparation response");
  version(response);
  if (response.action !== "revoke") throw new Error("vault delegate action is invalid");
  if (response.owner_signature_required !== true) {
    throw new Error("owner_signature_required must be true");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    wallet_address: walletAddress(response.wallet_address),
    session_public_key: walletAddress(response.session_public_key, "session_public_key"),
    action: response.action,
    transaction_base64: canonicalBase64(response.transaction_base64, "transaction_base64"),
    recent_blockhash: walletAddress(response.recent_blockhash, "recent_blockhash"),
    owner_signature_required: true,
    preparation_id: opaqueHandle(response.preparation_id, "preparation_id", "vp_"),
    sponsored: boolean(response.sponsored, "sponsored"),
    submit_by_ms: integer(response.submit_by_ms, "submit_by_ms"),
  };
}

export function platformVaultPolicyPrepareResponse(
  value: unknown,
): PlatformVaultPolicyPrepareResponse {
  const response = object(value, "platform vault policy preparation response");
  exactKeys(response, [
    "schema_version", "contract_version", "server_time_ms", "wallet_address",
    "withdrawal_access", "transaction_base64", "recent_blockhash",
    "owner_signature_required", "preparation_id", "sponsored", "submit_by_ms",
  ], "platform vault policy preparation response");
  version(response);
  if (response.owner_signature_required !== true) {
    throw new Error("owner_signature_required must be true");
  }
  const rawAccess = object(response.withdrawal_access, "withdrawal_access");
  exactKeys(rawAccess, ["mode", "allowed_wallet_addresses"], "withdrawal_access");
  if (rawAccess.mode !== "blocked" && rawAccess.mode !== "restricted") {
    throw new Error("preparable withdrawal access mode is invalid");
  }
  if (!Array.isArray(rawAccess.allowed_wallet_addresses)) {
    throw new Error("allowed_wallet_addresses must be an array");
  }
  const allowed = rawAccess.allowed_wallet_addresses.map((address, index) =>
    walletAddress(address, `allowed_wallet_addresses[${index}]`));
  unique(allowed, "allowed withdrawal wallets");
  if (
    allowed.length > 8
    || (rawAccess.mode === "blocked" && allowed.length !== 0)
    || (rawAccess.mode === "restricted" && allowed.length === 0)
  ) throw new Error("withdrawal access policy is inconsistent");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    wallet_address: walletAddress(response.wallet_address),
    withdrawal_access: {
      mode: rawAccess.mode,
      allowed_wallet_addresses: allowed,
    },
    transaction_base64: canonicalBase64(response.transaction_base64, "transaction_base64"),
    recent_blockhash: walletAddress(response.recent_blockhash, "recent_blockhash"),
    owner_signature_required: true,
    preparation_id: opaqueHandle(response.preparation_id, "preparation_id", "vp_"),
    sponsored: boolean(response.sponsored, "sponsored"),
    submit_by_ms: integer(response.submit_by_ms, "submit_by_ms"),
  };
}

export function platformVaultDepositPrepareResponse(
  value: unknown,
): PlatformVaultDepositPrepareResponse {
  const response = object(value, "platform vault deposit preparation response");
  exactKeys(response, [
    "schema_version", "contract_version", "server_time_ms", "wallet_address",
    "market_id", "asset_id", "amount_atoms", "network_cost_atoms", "session_public_key",
    "registers_session", "transaction_base64", "recent_blockhash", "owner_signature_required",
    "preparation_id", "sponsored", "submit_by_ms",
  ], "platform vault deposit preparation response");
  version(response);
  if (response.owner_signature_required !== true) {
    throw new Error("owner_signature_required must be true");
  }
  const sessionPublicKey = response.session_public_key === null
    ? null
    : walletAddress(response.session_public_key, "session_public_key");
  const registersSession = boolean(response.registers_session, "registers_session");
  if (registersSession && sessionPublicKey === null) {
    throw new Error("registers_session requires a session_public_key");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    wallet_address: walletAddress(response.wallet_address),
    market_id: marketId(response.market_id),
    asset_id: assetId(response.asset_id),
    amount_atoms: atomicString(response.amount_atoms, "amount_atoms", false),
    network_cost_atoms: atomicString(response.network_cost_atoms, "network_cost_atoms"),
    session_public_key: sessionPublicKey,
    registers_session: registersSession,
    transaction_base64: canonicalBase64(response.transaction_base64, "transaction_base64"),
    recent_blockhash: walletAddress(response.recent_blockhash, "recent_blockhash"),
    owner_signature_required: true,
    preparation_id: opaqueHandle(response.preparation_id, "preparation_id", "vp_"),
    sponsored: boolean(response.sponsored, "sponsored"),
    submit_by_ms: integer(response.submit_by_ms, "submit_by_ms"),
  };
}

export function platformVaultWithdrawPrepareResponse(
  value: unknown,
): PlatformVaultWithdrawPrepareResponse {
  const response = object(value, "platform vault withdrawal preparation response");
  exactKeys(response, [
    "schema_version", "contract_version", "server_time_ms", "wallet_address",
    "market_id", "asset_id", "destination_wallet_address", "amount_atoms",
    "transaction_base64", "recent_blockhash", "owner_signature_required",
    "preparation_id", "sponsored", "submit_by_ms",
  ], "platform vault withdrawal preparation response");
  version(response);
  if (response.owner_signature_required !== true) {
    throw new Error("owner_signature_required must be true");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    wallet_address: walletAddress(response.wallet_address),
    market_id: marketId(response.market_id),
    asset_id: assetId(response.asset_id),
    destination_wallet_address: walletAddress(
      response.destination_wallet_address,
      "destination_wallet_address",
    ),
    amount_atoms: atomicString(response.amount_atoms, "amount_atoms", false),
    transaction_base64: canonicalBase64(response.transaction_base64, "transaction_base64"),
    recent_blockhash: walletAddress(response.recent_blockhash, "recent_blockhash"),
    owner_signature_required: true,
    preparation_id: opaqueHandle(response.preparation_id, "preparation_id", "vp_"),
    sponsored: boolean(response.sponsored, "sponsored"),
    submit_by_ms: integer(response.submit_by_ms, "submit_by_ms"),
  };
}

export function platformVaultSetupPrepareResponse(
  value: unknown,
): PlatformVaultSetupPrepareResponse {
  const response = object(value, "platform vault setup preparation response");
  exactKeys(response, [
    "schema_version", "contract_version", "server_time_ms", "wallet_address",
    "session_public_key", "replace_session_public_key", "market_id", "mode", "expires_at_ms", "permanent",
    "minimum_interval_seconds", "maximum_tolerance_bps", "spending_limits",
    "transaction_base64", "recent_blockhash", "owner_signature_required",
    "preparation_id", "sponsored", "submit_by_ms",
  ], "platform vault setup preparation response");
  version(response);
  if (response.mode !== "create" && response.mode !== "replace_session") {
    throw new Error("vault setup mode is invalid");
  }
  if (typeof response.permanent !== "boolean") throw new Error("permanent must be boolean");
  if (response.owner_signature_required !== true) {
    throw new Error("owner_signature_required must be true");
  }
  const serverTimeMs = integer(response.server_time_ms, "server_time_ms");
  const expiresAtMs = nullableInteger(response.expires_at_ms, "expires_at_ms");
  if (response.permanent !== (expiresAtMs === null)) {
    throw new Error("vault setup expiry is inconsistent");
  }
  if (expiresAtMs !== null && (expiresAtMs % 1_000 !== 0 || expiresAtMs <= serverTimeMs + 60_000)) {
    throw new Error("vault setup expiry is invalid");
  }
  if (
    !Array.isArray(response.spending_limits)
    || response.spending_limits.length > PLATFORM_SESSION_MAX_SPENDING_LIMITS
  ) {
    throw new Error("vault setup carries at most four spending limits");
  }
  const spendingLimits = response.spending_limits.map<PlatformVaultSpendingLimit>((raw, index) => {
    const limit = object(raw, `spending_limits[${index}]`);
    exactKeys(limit, ["asset_id", "maximum_per_execution_atoms"], `spending_limits[${index}]`);
    return {
      asset_id: assetId(limit.asset_id),
      maximum_per_execution_atoms: limit.maximum_per_execution_atoms === null
        ? null
        : atomicString(limit.maximum_per_execution_atoms, "maximum_per_execution_atoms", false),
    };
  });
  unique(spendingLimits.map((limit) => limit.asset_id), "vault setup spending limit assets");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: serverTimeMs,
    wallet_address: walletAddress(response.wallet_address),
    session_public_key: walletAddress(response.session_public_key, "session_public_key"),
    replace_session_public_key: response.replace_session_public_key === null
      ? null
      : walletAddress(response.replace_session_public_key, "replace_session_public_key"),
    market_id: response.market_id === null ? null : marketId(response.market_id),
    mode: response.mode,
    expires_at_ms: expiresAtMs,
    permanent: response.permanent,
    minimum_interval_seconds: (() => {
      const interval = integer(
        response.minimum_interval_seconds,
        "minimum_interval_seconds",
        86_400,
      );
      if (interval < 1) throw new Error("minimum_interval_seconds must be positive");
      return interval;
    })(),
    maximum_tolerance_bps: (() => {
      const tolerance = integer(
        response.maximum_tolerance_bps,
        "maximum_tolerance_bps",
        1_000,
      );
      if (tolerance < 1) throw new Error("maximum_tolerance_bps must be positive");
      return tolerance;
    })(),
    spending_limits: spendingLimits,
    transaction_base64: canonicalBase64(response.transaction_base64, "transaction_base64"),
    recent_blockhash: walletAddress(response.recent_blockhash, "recent_blockhash"),
    owner_signature_required: true,
    preparation_id: opaqueHandle(response.preparation_id, "preparation_id", "vp_"),
    sponsored: boolean(response.sponsored, "sponsored"),
    submit_by_ms: integer(response.submit_by_ms, "submit_by_ms"),
  };
}

function rewardStanding(value: unknown, index: number): PlatformRewardStanding {
  const standing = object(value, `standings[${index}]`);
  exactKeys(standing, ["rank", "wallet_address", "points"], `standings[${index}]`);
  return {
    rank: integer(standing.rank, "rank", 1_000_000),
    wallet_address: walletAddress(standing.wallet_address),
    points: atomicString(standing.points, "points"),
  };
}

function ownerRewards(value: unknown): PlatformOwnerRewards {
  const owner = object(value, "owner rewards");
  exactKeys(owner, [
    "wallet_address", "rank", "points", "trading_points", "making_points",
    "bug_points", "referral_points",
  ], "owner rewards");
  return {
    wallet_address: walletAddress(owner.wallet_address),
    rank: nullableInteger(owner.rank, "owner.rank"),
    points: atomicString(owner.points, "owner.points"),
    trading_points: atomicString(owner.trading_points, "owner.trading_points"),
    making_points: atomicString(owner.making_points, "owner.making_points"),
    bug_points: atomicString(owner.bug_points, "owner.bug_points"),
    referral_points: atomicString(owner.referral_points, "owner.referral_points"),
  };
}

export function platformRewardsResponse(value: unknown): PlatformRewardsResponse {
  const response = object(value, "platform rewards response");
  exactKeys(response, [
    "schema_version", "contract_version", "server_time_ms", "season", "total_wallets",
    "owner", "standings",
  ], "platform rewards response");
  version(response);
  if (!Array.isArray(response.standings) || response.standings.length > 100) {
    throw new Error("reward standings must be a bounded array");
  }
  const standings = response.standings.map(rewardStanding);
  unique(standings.map((standing) => standing.wallet_address), "reward wallets");
  standings.forEach((standing, index) => {
    if (standing.rank !== index + 1) throw new Error("reward standings rank is invalid");
  });
  const totalWallets = integer(response.total_wallets, "total_wallets", 100_000_000);
  if (standings.length > totalWallets) throw new Error("reward standings exceed total wallets");
  const owner = response.owner === null ? null : ownerRewards(response.owner);
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    season: string(response.season, "season"),
    total_wallets: totalWallets,
    owner,
    standings,
  };
}

function optionalReferralCode(value: unknown, field: string): string | null {
  if (value === null) return null;
  const code = string(value, field);
  if (code.length > 64 || !/^[A-Za-z0-9_-]+$/.test(code)) throw new Error(`${field} is invalid`);
  return code;
}

export function platformReferralsResponse(value: unknown): PlatformReferralsResponse {
  const response = object(value, "platform referrals response");
  exactKeys(response, [
    "schema_version", "contract_version", "server_time_ms", "wallet_address", "enabled",
    "cash_rewards_enabled", "referral_code", "referred_wallets", "referral_points",
    "referred_by", "referral_locked", "cash_accrued_atoms", "cash_paid_atoms",
    "cash_claimable_atoms",
  ], "platform referrals response");
  version(response);
  const enabled = response.enabled;
  const cashRewardsEnabled = response.cash_rewards_enabled;
  const referralLocked = response.referral_locked;
  if (typeof enabled !== "boolean") throw new Error("enabled must be boolean");
  if (typeof cashRewardsEnabled !== "boolean") {
    throw new Error("cash_rewards_enabled must be boolean");
  }
  if (typeof referralLocked !== "boolean") throw new Error("referral_locked must be boolean");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    wallet_address: walletAddress(response.wallet_address),
    enabled,
    cash_rewards_enabled: cashRewardsEnabled,
    referral_code: optionalReferralCode(response.referral_code, "referral_code"),
    referred_wallets: integer(response.referred_wallets, "referred_wallets", 100_000_000),
    referral_points: atomicString(response.referral_points, "referral_points"),
    referred_by: optionalReferralCode(response.referred_by, "referred_by"),
    referral_locked: referralLocked,
    cash_accrued_atoms: atomicString(response.cash_accrued_atoms, "cash_accrued_atoms"),
    cash_paid_atoms: atomicString(response.cash_paid_atoms, "cash_paid_atoms"),
    cash_claimable_atoms: atomicString(response.cash_claimable_atoms, "cash_claimable_atoms"),
  };
}

export function platformReferralLinkResponse(value: unknown): PlatformReferralLinkResponse {
  const response = object(value, "platform referral link response");
  exactKeys(response, [
    "schema_version", "contract_version", "server_time_ms", "wallet_address",
    "referral_code", "status",
  ], "platform referral link response");
  version(response);
  const referralCode = optionalReferralCode(response.referral_code, "referral_code");
  if (referralCode === null || response.status !== "pending_first_fill") {
    throw new Error("referral link response is invalid");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    wallet_address: walletAddress(response.wallet_address),
    referral_code: referralCode,
    status: "pending_first_fill",
  };
}

export function platformReferralClaimResponse(value: unknown): PlatformReferralClaimResponse {
  const response = object(value, "platform referral claim response");
  exactKeys(response, [
    "schema_version", "contract_version", "server_time_ms", "wallet_address",
    "payout_wallet_address", "claimable_atoms", "status",
  ], "platform referral claim response");
  version(response);
  if (response.status !== "requested") throw new Error("referral claim status is invalid");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    wallet_address: walletAddress(response.wallet_address),
    payout_wallet_address: walletAddress(response.payout_wallet_address, "payout_wallet_address"),
    claimable_atoms: atomicString(response.claimable_atoms, "claimable_atoms", false),
    status: "requested",
  };
}

function bugReport(value: unknown, index: number): PlatformBugReport {
  const report = object(value, `reports[${index}]`);
  exactKeys(report, [
    "bug_id", "status", "severity", "points", "created_at_ms", "triaged_at_ms",
    "completed_at_ms",
  ], `reports[${index}]`);
  const bugId = string(report.bug_id, "bug_id");
  if (!/^bug_[0-9a-f]{32}$/.test(bugId)) throw new Error("bug_id is invalid");
  if (report.status !== "pending" && report.status !== "confirmed"
      && report.status !== "rejected") throw new Error("bug status is invalid");
  return {
    bug_id: bugId,
    status: report.status,
    severity: integer(report.severity, "severity", 255),
    points: atomicString(report.points, "points"),
    created_at_ms: integer(report.created_at_ms, "created_at_ms"),
    triaged_at_ms: nullableInteger(report.triaged_at_ms, "triaged_at_ms"),
    completed_at_ms: nullableInteger(report.completed_at_ms, "completed_at_ms"),
  };
}

export function platformBugsResponse(value: unknown): PlatformBugsResponse {
  const response = object(value, "platform bugs response");
  exactKeys(response, [
    "schema_version", "contract_version", "server_time_ms", "wallet_address", "points",
    "confirmed_reports", "reports",
  ], "platform bugs response");
  version(response);
  if (!Array.isArray(response.reports) || response.reports.length > 100) {
    throw new Error("bug reports must be a bounded array");
  }
  const reports = response.reports.map(bugReport);
  unique(reports.map((report) => report.bug_id), "bug IDs");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    wallet_address: walletAddress(response.wallet_address),
    points: atomicString(response.points, "points"),
    confirmed_reports: integer(response.confirmed_reports, "confirmed_reports", 100),
    reports,
  };
}

export function platformBugSubmitResponse(value: unknown): PlatformBugSubmitResponse {
  const response = object(value, "platform bug submit response");
  exactKeys(response, [
    "schema_version", "contract_version", "server_time_ms", "bug_id", "status",
  ], "platform bug submit response");
  version(response);
  const bugId = string(response.bug_id, "bug_id");
  if (!/^bug_[0-9a-f]{32}$/.test(bugId)) throw new Error("bug_id is invalid");
  if (response.status !== "pending") throw new Error("submitted bug status is invalid");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    bug_id: bugId,
    status: "pending",
  };
}

function trade(value: unknown, field: string): PlatformTrade {
  const item = object(value, field);
  exactKeys(item, ["trade_id", "side", "price_atoms", "size_atoms", "executed_at_ms"], field);
  const tradeId = string(item.trade_id, `${field}.trade_id`);
  if (!/^trade_[0-9a-f]{32}$/.test(tradeId)) throw new Error(`${field}.trade_id is invalid`);
  if (item.side !== "buy" && item.side !== "sell") throw new Error(`${field}.side is invalid`);
  return {
    trade_id: tradeId,
    side: item.side,
    price_atoms: atomicString(item.price_atoms, `${field}.price_atoms`, false),
    size_atoms: atomicString(item.size_atoms, `${field}.size_atoms`, false),
    executed_at_ms: integer(item.executed_at_ms, `${field}.executed_at_ms`),
  };
}

export function platformTradesResponse(value: unknown): PlatformTradesResponse {
  const response = object(value, "trades response");
  exactKeys(response, [
    "schema_version", "contract_version", "market_id", "server_time_ms", "trades",
  ], "trades response");
  version(response);
  if (!Array.isArray(response.trades)) throw new Error("trades must be an array");
  const trades = response.trades.map((item, index) => trade(item, `trades[${index}]`));
  unique(trades.map((item) => item.trade_id), "trade IDs");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    market_id: marketId(response.market_id),
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    trades,
  };
}

function bookChange(value: unknown, field: string): PlatformBookChange {
  const item = object(value, field);
  exactKeys(item, ["side", "price_atoms", "size_atoms"], field);
  if (item.side !== "bid" && item.side !== "ask") throw new Error(`${field}.side is invalid`);
  return {
    side: item.side,
    price_atoms: atomicString(item.price_atoms, `${field}.price_atoms`, false),
    size_atoms: atomicString(item.size_atoms, `${field}.size_atoms`),
  };
}

export function platformMarketDataEvent(value: unknown): PlatformMarketDataEvent {
  const event = object(value, "market data event");
  const type = string(event.type, "market data event.type");
  if (type === "book_snapshot") {
    const { type: _, ...snapshot } = event;
    return { type, ...platformBookSnapshotResponse(snapshot) };
  }
  if (type === "book_delta") {
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "stream_id", "sequence",
      "previous_sequence", "server_time_ms", "changes",
    ], "book delta");
    version(event);
    const id = marketId(event.market_id);
    const streamId = string(event.stream_id, "stream_id");
    if (streamId !== `book:${id}`) throw new Error("book stream identity is invalid");
    if (!Array.isArray(event.changes) || event.changes.length === 0) {
      throw new Error("book delta changes must be non-empty");
    }
    return {
      type,
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: id,
      stream_id: streamId,
      sequence: atomicString(event.sequence, "sequence", false),
      previous_sequence: atomicString(event.previous_sequence, "previous_sequence", false),
      server_time_ms: integer(event.server_time_ms, "server_time_ms"),
      changes: event.changes.map((item, index) => bookChange(item, `changes[${index}]`)),
    };
  }
  if (type === "trade") {
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "server_time_ms", "trade",
    ], "trade event");
    version(event);
    return {
      type,
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: marketId(event.market_id),
      server_time_ms: integer(event.server_time_ms, "server_time_ms"),
      trade: trade(event.trade, "trade"),
    };
  }
  if (type === "best_bid_ask") {
    const { type: _, ...value } = event;
    return { type, ...platformBestBidAskResponse(value) };
  }
  if (type === "market_status") {
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "server_time_ms", "status",
    ], "market status event");
    version(event);
    if (!MARKET_STATES.includes(event.status as typeof MARKET_STATES[number])) {
      throw new Error("market status event is invalid");
    }
    return {
      type,
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: marketId(event.market_id),
      server_time_ms: integer(event.server_time_ms, "server_time_ms"),
      status: event.status as typeof MARKET_STATES[number],
    };
  }
  if (type === "heartbeat") {
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "server_time_ms",
    ], "heartbeat event");
    version(event);
    return {
      type,
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: marketId(event.market_id),
      server_time_ms: integer(event.server_time_ms, "server_time_ms"),
    };
  }
  throw new Error("market data event type is invalid");
}

function accountOrder(value: unknown, field: string): PlatformAccountOrder {
  const item = object(value, field);
  exactKeys(item, [
    "order_id", "side", "order_type", "state", "limit_price_atoms",
    "original_size_atoms", "remaining_size_atoms",
  ], field);
  const orderId = string(item.order_id, `${field}.order_id`);
  if (!/^order_[0-9a-f]{32}$/.test(orderId)) throw new Error(`${field}.order_id is invalid`);
  if (item.side !== "buy" && item.side !== "sell") throw new Error(`${field}.side is invalid`);
  if (!ORDER_TYPES.includes(item.order_type as typeof ORDER_TYPES[number])) {
    throw new Error(`${field}.order_type is invalid`);
  }
  if (!ACTIVE_ORDER_STATES.includes(item.state as typeof ACTIVE_ORDER_STATES[number])) {
    throw new Error(`${field}.state is invalid`);
  }
  const original = atomicString(item.original_size_atoms, `${field}.original_size_atoms`, false);
  const remaining = atomicString(item.remaining_size_atoms, `${field}.remaining_size_atoms`, false);
  if (BigInt(remaining) > BigInt(original)) {
    throw new Error(`${field}.remaining_size_atoms exceeds original size`);
  }
  const expectedState = remaining === original ? "open" : "partially_filled";
  if (item.state !== expectedState) throw new Error(`${field}.state contradicts remaining size`);
  return {
    order_id: orderId,
    side: item.side,
    order_type: item.order_type as PlatformAccountOrder["order_type"],
    state: item.state as PlatformAccountOrder["state"],
    limit_price_atoms: atomicString(item.limit_price_atoms, `${field}.limit_price_atoms`, false),
    original_size_atoms: original,
    remaining_size_atoms: remaining,
  };
}

function accountOrders(value: unknown, field: string): PlatformAccountOrder[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const orders = value.map((item, index) => accountOrder(item, `${field}[${index}]`));
  unique(orders.map((item) => item.order_id), `${field} IDs`);
  return orders;
}

function accountFill(value: unknown, field: string): PlatformAccountFill {
  const item = object(value, field);
  exactKeys(item, [
    "fill_id", "side", "price_atoms", "size_atoms", "fee_quote_atoms",
    "fee_is_final", "settlement", "executed_at_ms", "confirmed_at_ms",
    "transaction_id", "realized_pnl_quote_atoms",
  ], field);
  const fillId = string(item.fill_id, `${field}.fill_id`);
  if (!/^fill_[0-9a-f]{32}$/.test(fillId)) throw new Error(`${field}.fill_id is invalid`);
  if (item.side !== "buy" && item.side !== "sell") throw new Error(`${field}.side is invalid`);
  if (!FILL_SETTLEMENT_STATES.includes(item.settlement as typeof FILL_SETTLEMENT_STATES[number])) {
    throw new Error(`${field}.settlement is invalid`);
  }
  if (typeof item.fee_is_final !== "boolean") throw new Error(`${field}.fee_is_final is invalid`);
  const executedAt = integer(item.executed_at_ms, `${field}.executed_at_ms`);
  const confirmedAt = item.confirmed_at_ms === null
    ? null
    : integer(item.confirmed_at_ms, `${field}.confirmed_at_ms`);
  if (confirmedAt !== null && confirmedAt < executedAt) {
    throw new Error(`${field}.confirmed_at_ms precedes execution`);
  }
  if (item.settlement === "confirmed" && confirmedAt === null) {
    throw new Error(`${field}.confirmed settlement is missing confirmation time`);
  }
  const transactionId = item.transaction_id === null
    ? null
    : string(item.transaction_id, `${field}.transaction_id`);
  if (transactionId !== null && !/^[1-9A-HJ-NP-Za-km-z]{32,100}$/.test(transactionId)) {
    throw new Error(`${field}.transaction_id is invalid`);
  }
  return {
    fill_id: fillId,
    side: item.side,
    price_atoms: atomicString(item.price_atoms, `${field}.price_atoms`, false),
    size_atoms: atomicString(item.size_atoms, `${field}.size_atoms`, false),
    fee_quote_atoms: atomicString(item.fee_quote_atoms, `${field}.fee_quote_atoms`),
    fee_is_final: item.fee_is_final,
    settlement: item.settlement as PlatformAccountFill["settlement"],
    executed_at_ms: executedAt,
    confirmed_at_ms: confirmedAt,
    transaction_id: transactionId,
    realized_pnl_quote_atoms: signedAtomicString(
      item.realized_pnl_quote_atoms,
      `${field}.realized_pnl_quote_atoms`,
    ),
  };
}

function accountFills(value: unknown, field: string): PlatformAccountFill[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const fills = value.map((item, index) => accountFill(item, `${field}[${index}]`));
  unique(fills.map((item) => item.fill_id), `${field} IDs`);
  return fills;
}

export function platformAccountSnapshotResponse(value: unknown): PlatformAccountSnapshotResponse {
  const response = object(value, "account snapshot");
  exactKeys(response, [
    "schema_version", "contract_version", "market_id", "wallet_address",
    "server_time_ms", "orders", "fills",
  ], "account snapshot");
  version(response);
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    market_id: marketId(response.market_id),
    wallet_address: walletAddress(response.wallet_address),
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    orders: accountOrders(response.orders, "orders"),
    fills: accountFills(response.fills, "fills"),
  };
}

const MAKER_REPUTATION_TIERS = [
  "probation", "bronze", "silver", "gold", "platinum",
] as const;

function makerReputationTier(value: unknown, field: string): PlatformMakerReputationTier {
  if (!MAKER_REPUTATION_TIERS.includes(value as PlatformMakerReputationTier)) {
    throw new Error(`${field} is invalid`);
  }
  return value as PlatformMakerReputationTier;
}

function optionalAtomicString(value: unknown, field: string): string | null {
  return value === null ? null : atomicString(value, field);
}

function makerSide(value: unknown, field: string): PlatformMakerSide {
  if (value !== "buy" && value !== "sell") throw new Error(`${field} must be buy or sell`);
  return value;
}

function oracleHealth(value: unknown, field: string): PlatformOracleHealth {
  if (value !== "fresh" && value !== "stale" && value !== "unknown") {
    throw new Error(`${field} must be fresh, stale, or unknown`);
  }
  return value;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} must be boolean`);
  return value;
}

function nullableAtomic(value: unknown, field: string): string | null {
  return value === null ? null : atomicString(value, field);
}

function boundedArray(value: unknown, field: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new Error(`${field} must be a bounded array`);
  }
  return value;
}

export function platformMakerStatusResponse(value: unknown): PlatformMakerStatusResponse {
  const response = object(value, "maker status");
  exactKeys(response, [
    "schema_version", "contract_version", "market_id", "maker_id", "wallet_address",
    "server_time_ms", "current_slot", "firm_orders", "intent", "signed_quotes", "strands",
    "currents", "dead_man_guards", "active_products",
  ], "maker status");
  version(response);
  const makerId = string(response.maker_id, "maker_id");
  if (!/^maker_[0-9a-f]{32}$/.test(makerId)) throw new Error("maker_id is invalid");

  const firm = object(response.firm_orders, "firm_orders");
  exactKeys(firm, [
    "resting_orders", "bid_orders", "ask_orders", "bid_size_atoms", "ask_size_atoms",
  ], "firm_orders");
  const bidOrders = integer(firm.bid_orders, "bid_orders", 1_000_000);
  const askOrders = integer(firm.ask_orders, "ask_orders", 1_000_000);
  const restingOrders = integer(firm.resting_orders, "resting_orders", 2_000_000);
  if (restingOrders !== bidOrders + askOrders) {
    throw new Error("resting_orders must equal bid_orders plus ask_orders");
  }

  let intent: PlatformMakerStatusResponse["intent"] = null;
  if (response.intent !== null) {
    const raw = object(response.intent, "intent");
    exactKeys(raw, [
      "active", "side", "minimum_price_atoms", "maximum_price_atoms",
      "maximum_fill_size_atoms", "remaining_fill_size_atoms", "minimum_spread_bps",
      "stake_atoms",
    ], "intent");
    const minimum = atomicString(raw.minimum_price_atoms, "minimum_price_atoms");
    const maximum = atomicString(raw.maximum_price_atoms, "maximum_price_atoms");
    const maximumFill = atomicString(raw.maximum_fill_size_atoms, "maximum_fill_size_atoms");
    const remainingFill = atomicString(raw.remaining_fill_size_atoms, "remaining_fill_size_atoms");
    if (BigInt(minimum) > BigInt(maximum)) throw new Error("intent price bounds are inverted");
    if (BigInt(remainingFill) > BigInt(maximumFill)) {
      throw new Error("intent remaining fill size exceeds its maximum");
    }
    intent = {
      active: boolean(raw.active, "intent.active"),
      side: makerSide(raw.side, "intent.side"),
      minimum_price_atoms: minimum,
      maximum_price_atoms: maximum,
      maximum_fill_size_atoms: maximumFill,
      remaining_fill_size_atoms: remainingFill,
      minimum_spread_bps: integer(raw.minimum_spread_bps, "minimum_spread_bps", 10_000),
      stake_atoms: atomicString(raw.stake_atoms, "stake_atoms"),
    };
  }

  const lane = object(response.signed_quotes, "signed_quotes");
  exactKeys(lane, ["eligible", "live_quotes"], "signed_quotes");
  const liveQuotes = boundedArray(lane.live_quotes, "live_quotes", 2)
    .map<PlatformMakerSignedQuote>((raw, index) => {
      const quote = object(raw, `live_quotes[${index}]`);
      exactKeys(quote, [
        "side", "price_atoms", "size_atoms", "nonce", "issued_at_ms", "expires_at_ms",
      ], `live_quotes[${index}]`);
      const issued = integer(quote.issued_at_ms, "issued_at_ms");
      const expires = integer(quote.expires_at_ms, "expires_at_ms");
      if (expires < issued) throw new Error("signed quote expires before it was issued");
      return {
        side: makerSide(quote.side, "live_quotes.side"),
        price_atoms: atomicString(quote.price_atoms, "price_atoms", false),
        size_atoms: atomicString(quote.size_atoms, "size_atoms", false),
        nonce: atomicString(quote.nonce, "nonce"),
        issued_at_ms: issued,
        expires_at_ms: expires,
      };
    });
  unique(liveQuotes.map((quote) => quote.side), "signed quote sides");

  const currentSlot = atomicString(response.current_slot, "current_slot");
  const strands = boundedArray(response.strands, "strands", 256)
    .map<PlatformMakerStrandStatus>((raw, index) => {
      const strand = object(raw, `strands[${index}]`);
      exactKeys(strand, [
        "enabled", "async_only", "expired", "mid_price_atoms", "tick_size_atoms",
        "valid_until_slot", "bids", "asks", "maximum_exposure_atoms", "remaining_exposure_atoms",
      ], `strands[${index}]`);
      const level = (rawLevel: unknown, field: string): PlatformMakerStrandLevel => {
        const entry = object(rawLevel, field);
        exactKeys(entry, ["price_atoms", "size_atoms", "remaining_size_atoms"], field);
        const size = atomicString(entry.size_atoms, `${field}.size_atoms`);
        const remaining = atomicString(entry.remaining_size_atoms, `${field}.remaining_size_atoms`);
        if (BigInt(remaining) > BigInt(size)) throw new Error(`${field} remaining exceeds size`);
        return {
          price_atoms: nullableAtomic(entry.price_atoms, `${field}.price_atoms`),
          size_atoms: size,
          remaining_size_atoms: remaining,
        };
      };
      const maximumExposure = atomicString(strand.maximum_exposure_atoms, "maximum_exposure_atoms");
      const remainingExposure = atomicString(strand.remaining_exposure_atoms, "remaining_exposure_atoms");
      if (BigInt(remainingExposure) > BigInt(maximumExposure)) {
        throw new Error("strand remaining exposure exceeds its maximum");
      }
      const validUntil = nullableAtomic(strand.valid_until_slot, "valid_until_slot");
      const expired = boolean(strand.expired, "strand.expired");
      if (validUntil === null && expired) throw new Error("a strand without expiry cannot be expired");
      if (validUntil !== null && expired !== (BigInt(currentSlot) > BigInt(validUntil))) {
        throw new Error("strand expiry disagrees with the current slot");
      }
      return {
        enabled: boolean(strand.enabled, "strand.enabled"),
        async_only: boolean(strand.async_only, "strand.async_only"),
        expired,
        mid_price_atoms: atomicString(strand.mid_price_atoms, "mid_price_atoms", false),
        tick_size_atoms: atomicString(strand.tick_size_atoms, "tick_size_atoms", false),
        valid_until_slot: validUntil,
        bids: boundedArray(strand.bids, "bids", 16).map((entry, i) => level(entry, `bids[${i}]`)),
        asks: boundedArray(strand.asks, "asks", 16).map((entry, i) => level(entry, `asks[${i}]`)),
        maximum_exposure_atoms: maximumExposure,
        remaining_exposure_atoms: remainingExposure,
      };
    });

  const currents = boundedArray(response.currents, "currents", 256)
    .map<PlatformMakerCurrentStatus>((raw, index) => {
      const current = object(raw, `currents[${index}]`);
      exactKeys(current, [
        "enabled", "async_only", "expired", "half_spread_bps", "band_step_bps",
        "maximum_confidence_bps", "maximum_oracle_age_seconds", "sync_spread_bps",
        "valid_until_slot", "bid_depth_atoms", "ask_depth_atoms", "maximum_exposure_atoms",
        "remaining_exposure_atoms", "oracle_health",
      ], `currents[${index}]`);
      const maximumExposure = atomicString(current.maximum_exposure_atoms, "maximum_exposure_atoms");
      const remainingExposure = atomicString(current.remaining_exposure_atoms, "remaining_exposure_atoms");
      if (BigInt(remainingExposure) > BigInt(maximumExposure)) {
        throw new Error("current remaining exposure exceeds its maximum");
      }
      const validUntil = nullableAtomic(current.valid_until_slot, "valid_until_slot");
      const expired = boolean(current.expired, "current.expired");
      if (validUntil === null && expired) throw new Error("a current without expiry cannot be expired");
      if (validUntil !== null && expired !== (BigInt(currentSlot) > BigInt(validUntil))) {
        throw new Error("current expiry disagrees with the current slot");
      }
      return {
        enabled: boolean(current.enabled, "current.enabled"),
        async_only: boolean(current.async_only, "current.async_only"),
        expired,
        half_spread_bps: integer(current.half_spread_bps, "half_spread_bps", 10_000),
        band_step_bps: integer(current.band_step_bps, "band_step_bps", 10_000),
        maximum_confidence_bps: integer(current.maximum_confidence_bps, "maximum_confidence_bps", 10_000),
        maximum_oracle_age_seconds: integer(current.maximum_oracle_age_seconds, "maximum_oracle_age_seconds"),
        sync_spread_bps: integer(current.sync_spread_bps, "sync_spread_bps", 10_000),
        valid_until_slot: validUntil,
        bid_depth_atoms: boundedArray(current.bid_depth_atoms, "bid_depth_atoms", 8)
          .map((entry, i) => atomicString(entry, `bid_depth_atoms[${i}]`)),
        ask_depth_atoms: boundedArray(current.ask_depth_atoms, "ask_depth_atoms", 8)
          .map((entry, i) => atomicString(entry, `ask_depth_atoms[${i}]`)),
        maximum_exposure_atoms: maximumExposure,
        remaining_exposure_atoms: remainingExposure,
        oracle_health: oracleHealth(current.oracle_health, "oracle_health"),
      };
    });

  const guards = boundedArray(response.dead_man_guards, "dead_man_guards", 32)
    .map<PlatformMakerDeadManGuard>((raw, index) => {
      const guard = object(raw, `dead_man_guards[${index}]`);
      exactKeys(guard, [
        "session_public_key", "status", "timeout_ms", "heartbeat_deadline_ms", "updated_at_ms",
      ], `dead_man_guards[${index}]`);
      if (!DEAD_MAN_STATUSES.includes(guard.status as typeof DEAD_MAN_STATUSES[number])) {
        throw new Error("dead-man guard status is invalid");
      }
      return {
        session_public_key: walletAddress(guard.session_public_key, "session_public_key"),
        status: guard.status as PlatformMakerDeadManGuard["status"],
        timeout_ms: integer(guard.timeout_ms, "timeout_ms"),
        heartbeat_deadline_ms: integer(guard.heartbeat_deadline_ms, "heartbeat_deadline_ms"),
        updated_at_ms: integer(guard.updated_at_ms, "updated_at_ms"),
      };
    });
  unique(guards.map((guard) => guard.session_public_key), "dead-man guard sessions");

  const expectedActive = (restingOrders > 0 ? 1 : 0)
    + (intent?.active ? 1 : 0)
    + strands.filter((strand) => strand.enabled && !strand.expired).length
    + currents.filter((current) => current.enabled && !current.expired).length;
  const activeProducts = integer(response.active_products, "active_products", 65_535);
  if (activeProducts !== expectedActive) {
    throw new Error("active_products disagrees with the reported maker products");
  }

  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    market_id: marketId(response.market_id),
    maker_id: makerId,
    wallet_address: walletAddress(response.wallet_address),
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
    current_slot: currentSlot,
    firm_orders: {
      resting_orders: restingOrders,
      bid_orders: bidOrders,
      ask_orders: askOrders,
      bid_size_atoms: atomicString(firm.bid_size_atoms, "bid_size_atoms"),
      ask_size_atoms: atomicString(firm.ask_size_atoms, "ask_size_atoms"),
    },
    intent,
    signed_quotes: { eligible: boolean(lane.eligible, "signed_quotes.eligible"), live_quotes: liveQuotes },
    strands,
    currents,
    dead_man_guards: guards,
    active_products: activeProducts,
  };
}

export function platformMakerReputationResponse(
  value: unknown,
): PlatformMakerReputationResponse {
  const response = object(value, "maker reputation");
  exactKeys(response, [
    "schema_version", "contract_version", "market_id", "maker_id", "wallet_address",
    "active", "tier", "reputation_score", "total_quote_requests", "successful_fills",
    "missed_quote_requests", "fill_rate_bps", "consecutive_misses",
    "lifetime_filled_quote_atoms", "distinct_counterparties", "recent_average_latency_ms",
    "configured_minimum_spread_bps", "weighted_average_spread_bps", "stake_atoms",
    "epoch_start_stake_atoms", "epoch_slashed_atoms", "epoch_slashed_bps",
    "lifetime_auto_slashed_atoms", "registered_slot", "last_active_slot",
    "last_settled_slot", "revoked_at_slot", "tenure_slots",
    "signed_quote_stream_eligible", "minimum_quote_interval_ms", "tier_progress",
    "server_time_ms",
  ], "maker reputation");
  version(response);
  if (typeof response.active !== "boolean") throw new Error("active must be boolean");
  if (typeof response.signed_quote_stream_eligible !== "boolean") {
    throw new Error("signed_quote_stream_eligible must be boolean");
  }
  const tier = makerReputationTier(response.tier, "tier");
  const minimumInterval = response.minimum_quote_interval_ms === null
    ? null
    : integer(response.minimum_quote_interval_ms, "minimum_quote_interval_ms", 60_000);
  const expectedInterval = response.active
    ? tier === "platinum"
      ? 10
      : tier === "silver" || tier === "gold"
        ? 100
        : null
    : null;
  if (
    minimumInterval !== expectedInterval
    || response.signed_quote_stream_eligible !== (expectedInterval !== null)
  ) {
    throw new Error("stream eligibility and minimum interval disagree");
  }
  const progress = object(response.tier_progress, "tier_progress");
  exactKeys(progress, [
    "next_tier", "reputation_score_required", "reputation_score_remaining",
    "quote_requests_required", "quote_requests_remaining", "stake_atoms_required",
    "stake_atoms_remaining", "tenure_slots_required", "tenure_slots_remaining",
  ], "tier_progress");
  const nextTier = progress.next_tier === null
    ? null
    : makerReputationTier(progress.next_tier, "tier_progress.next_tier");
  const requiredScore = progress.reputation_score_required === null
    ? null
    : integer(progress.reputation_score_required, "tier_progress.reputation_score_required", 10_000);
  const reputationScore = integer(response.reputation_score, "reputation_score", 10_000);
  const scoreRemaining = integer(
    progress.reputation_score_remaining,
    "tier_progress.reputation_score_remaining",
    10_000,
  );
  const totalQuoteRequests = atomicString(response.total_quote_requests, "total_quote_requests");
  const stakeAtoms = atomicString(response.stake_atoms, "stake_atoms");
  const tenureSlots = atomicString(response.tenure_slots, "tenure_slots");
  const quoteRequestsRequired = optionalAtomicString(
    progress.quote_requests_required,
    "tier_progress.quote_requests_required",
  );
  const quoteRequestsRemaining = atomicString(
    progress.quote_requests_remaining,
    "tier_progress.quote_requests_remaining",
  );
  const stakeAtomsRequired = optionalAtomicString(
    progress.stake_atoms_required,
    "tier_progress.stake_atoms_required",
  );
  const stakeAtomsRemaining = atomicString(
    progress.stake_atoms_remaining,
    "tier_progress.stake_atoms_remaining",
  );
  const tenureSlotsRequired = optionalAtomicString(
    progress.tenure_slots_required,
    "tier_progress.tenure_slots_required",
  );
  const tenureSlotsRemaining = atomicString(
    progress.tenure_slots_remaining,
    "tier_progress.tenure_slots_remaining",
  );
  const expectedNextTier = tier === "probation" || tier === "bronze"
    ? "silver"
    : tier === "silver"
      ? "gold"
      : tier === "gold"
        ? "platinum"
        : null;
  const progressShapeIsValid = tier === "probation"
    ? requiredScore === 5_000 && quoteRequestsRequired === "50"
      && stakeAtomsRequired === null && tenureSlotsRequired === null
    : tier === "bronze"
      ? requiredScore === 5_000 && quoteRequestsRequired === null
        && stakeAtomsRequired === null && tenureSlotsRequired === null
      : tier === "silver"
        ? requiredScore === 7_500 && quoteRequestsRequired === null
          && stakeAtomsRequired === null && tenureSlotsRequired === null
        : tier === "gold"
          ? requiredScore === 9_000 && quoteRequestsRequired === null
            && stakeAtomsRequired !== null && tenureSlotsRequired === "6480000"
          : requiredScore === null && quoteRequestsRequired === null
            && stakeAtomsRequired === null && tenureSlotsRequired === null;
  const remaining = (required: string | null, current: string): bigint => required === null
    ? 0n
    : BigInt(required) > BigInt(current)
      ? BigInt(required) - BigInt(current)
      : 0n;
  if (
    nextTier !== expectedNextTier
    || !progressShapeIsValid
    || scoreRemaining !== Math.max(0, (requiredScore ?? reputationScore) - reputationScore)
    || BigInt(quoteRequestsRemaining) !== remaining(quoteRequestsRequired, totalQuoteRequests)
    || BigInt(stakeAtomsRemaining) !== remaining(stakeAtomsRequired, stakeAtoms)
    || BigInt(tenureSlotsRemaining) !== remaining(tenureSlotsRequired, tenureSlots)
  ) {
    throw new Error("tier_progress is inconsistent");
  }
  const makerId = string(response.maker_id, "maker_id");
  if (!/^maker_[0-9a-f]{32}$/.test(makerId)) throw new Error("maker_id is invalid");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    market_id: marketId(response.market_id),
    maker_id: makerId,
    wallet_address: walletAddress(response.wallet_address),
    active: response.active,
    tier,
    reputation_score: reputationScore,
    total_quote_requests: totalQuoteRequests,
    successful_fills: atomicString(response.successful_fills, "successful_fills"),
    missed_quote_requests: atomicString(response.missed_quote_requests, "missed_quote_requests"),
    fill_rate_bps: integer(response.fill_rate_bps, "fill_rate_bps", 10_000),
    consecutive_misses: integer(response.consecutive_misses, "consecutive_misses", 65_535),
    lifetime_filled_quote_atoms: atomicString(
      response.lifetime_filled_quote_atoms,
      "lifetime_filled_quote_atoms",
    ),
    distinct_counterparties: integer(response.distinct_counterparties, "distinct_counterparties", 65_535),
    recent_average_latency_ms: integer(response.recent_average_latency_ms, "recent_average_latency_ms", 65_535),
    configured_minimum_spread_bps: integer(response.configured_minimum_spread_bps, "configured_minimum_spread_bps", 10_000),
    weighted_average_spread_bps: integer(response.weighted_average_spread_bps, "weighted_average_spread_bps", 10_000),
    stake_atoms: stakeAtoms,
    epoch_start_stake_atoms: atomicString(response.epoch_start_stake_atoms, "epoch_start_stake_atoms"),
    epoch_slashed_atoms: atomicString(response.epoch_slashed_atoms, "epoch_slashed_atoms"),
    epoch_slashed_bps: integer(response.epoch_slashed_bps, "epoch_slashed_bps", 10_000),
    lifetime_auto_slashed_atoms: atomicString(response.lifetime_auto_slashed_atoms, "lifetime_auto_slashed_atoms"),
    registered_slot: atomicString(response.registered_slot, "registered_slot"),
    last_active_slot: atomicString(response.last_active_slot, "last_active_slot"),
    last_settled_slot: atomicString(response.last_settled_slot, "last_settled_slot"),
    revoked_at_slot: optionalAtomicString(response.revoked_at_slot, "revoked_at_slot"),
    tenure_slots: tenureSlots,
    signed_quote_stream_eligible: response.signed_quote_stream_eligible,
    minimum_quote_interval_ms: minimumInterval,
    tier_progress: {
      next_tier: nextTier,
      reputation_score_required: requiredScore,
      reputation_score_remaining: scoreRemaining,
      quote_requests_required: quoteRequestsRequired,
      quote_requests_remaining: quoteRequestsRemaining,
      stake_atoms_required: stakeAtomsRequired,
      stake_atoms_remaining: stakeAtomsRemaining,
      tenure_slots_required: tenureSlotsRequired,
      tenure_slots_remaining: tenureSlotsRemaining,
    },
    server_time_ms: integer(response.server_time_ms, "server_time_ms"),
  };
}

function accountStreamIdentity(value: unknown, field = "stream_id"): string {
  const id = string(value, field);
  if (!/^account_stream_[0-9a-f]{32}$/.test(id)) throw new Error(`${field} is invalid`);
  return id;
}

export function platformAccountEvent(value: unknown): PlatformAccountEvent {
  const event = object(value, "account event");
  const type = string(event.type, "account event.type");
  if (type === "auth_challenge") {
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "wallet_address",
      "challenge", "server_time_ms", "expires_at_ms",
    ], "account challenge");
    version(event);
    const challenge = string(event.challenge, "challenge");
    if (!/^[0-9a-f]{64}$/.test(challenge)) throw new Error("account challenge is invalid");
    const serverTime = integer(event.server_time_ms, "server_time_ms");
    const expiresAt = integer(event.expires_at_ms, "expires_at_ms");
    if (expiresAt <= serverTime) throw new Error("account challenge is already expired");
    return {
      type,
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: marketId(event.market_id),
      wallet_address: walletAddress(event.wallet_address),
      challenge,
      server_time_ms: serverTime,
      expires_at_ms: expiresAt,
    };
  }
  if (type === "account_snapshot") {
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "wallet_address",
      "stream_id", "sequence", "server_time_ms", "orders", "fills",
    ], "account stream snapshot");
    version(event);
    return {
      type,
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: marketId(event.market_id),
      wallet_address: walletAddress(event.wallet_address),
      stream_id: accountStreamIdentity(event.stream_id),
      sequence: atomicString(event.sequence, "sequence", false),
      server_time_ms: integer(event.server_time_ms, "server_time_ms"),
      orders: accountOrders(event.orders, "orders"),
      fills: accountFills(event.fills, "fills"),
    };
  }
  if (type === "orders_snapshot") {
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "wallet_address",
      "stream_id", "sequence", "previous_sequence", "server_time_ms", "orders",
    ], "account orders event");
    version(event);
    return {
      type,
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: marketId(event.market_id),
      wallet_address: walletAddress(event.wallet_address),
      stream_id: accountStreamIdentity(event.stream_id),
      sequence: atomicString(event.sequence, "sequence", false),
      previous_sequence: atomicString(event.previous_sequence, "previous_sequence", false),
      server_time_ms: integer(event.server_time_ms, "server_time_ms"),
      orders: accountOrders(event.orders, "orders"),
    };
  }
  if (type === "fill") {
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "wallet_address",
      "stream_id", "sequence", "previous_sequence", "server_time_ms", "fill",
    ], "account fill event");
    version(event);
    return {
      type,
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: marketId(event.market_id),
      wallet_address: walletAddress(event.wallet_address),
      stream_id: accountStreamIdentity(event.stream_id),
      sequence: atomicString(event.sequence, "sequence", false),
      previous_sequence: atomicString(event.previous_sequence, "previous_sequence", false),
      server_time_ms: integer(event.server_time_ms, "server_time_ms"),
      fill: accountFill(event.fill, "fill"),
    };
  }
  if (type === "heartbeat") {
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "wallet_address",
      "stream_id", "sequence", "previous_sequence", "server_time_ms",
    ], "account heartbeat");
    version(event);
    return {
      type,
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: marketId(event.market_id),
      wallet_address: walletAddress(event.wallet_address),
      stream_id: accountStreamIdentity(event.stream_id),
      sequence: atomicString(event.sequence, "sequence", false),
      previous_sequence: atomicString(event.previous_sequence, "previous_sequence", false),
      server_time_ms: integer(event.server_time_ms, "server_time_ms"),
    };
  }
  throw new Error("account event type is invalid");
}

function makerStreamIdentity(value: unknown, field = "stream_id"): string {
  const id = string(value, field);
  if (!/^maker_stream_[0-9a-f]{32}$/.test(id)) throw new Error(`${field} is invalid`);
  return id;
}

const MAKER_PRODUCTS = ["firm_order", "intent", "strand", "current"] as const;

function makerFill(value: unknown, field: string): PlatformMakerFill {
  const item = object(value, field);
  exactKeys(item, [
    "fill_id", "product", "side", "price_atoms", "size_atoms", "fee_quote_atoms",
    "fee_is_final", "settlement", "executed_at_ms", "confirmed_at_ms",
    "transaction_id", "realized_pnl_quote_atoms",
  ], field);
  if (!MAKER_PRODUCTS.includes(item.product as PlatformMakerProduct)) {
    throw new Error(`${field}.product is invalid`);
  }
  const { product: _product, ...rest } = item;
  const fill = accountFill(rest, field);
  return { ...fill, product: item.product as PlatformMakerProduct };
}

function makerFills(value: unknown, field: string): PlatformMakerFill[] {
  const fills = boundedArray(value, field, 2_000)
    .map((item, index) => makerFill(item, `${field}[${index}]`));
  unique(fills.map((fill) => fill.fill_id), field);
  return fills;
}

export function platformMakerEvent(value: unknown): PlatformMakerEvent {
  const event = object(value, "maker event");
  const type = string(event.type, "maker event.type");
  if (type === "auth_challenge") {
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "wallet_address",
      "challenge", "server_time_ms", "expires_at_ms",
    ], "maker challenge");
    version(event);
    const challenge = string(event.challenge, "challenge");
    if (!/^[0-9a-f]{64}$/.test(challenge)) throw new Error("maker challenge is invalid");
    const serverTime = integer(event.server_time_ms, "server_time_ms");
    const expiresAt = integer(event.expires_at_ms, "expires_at_ms");
    if (expiresAt <= serverTime) throw new Error("maker challenge is already expired");
    return {
      type,
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: marketId(event.market_id),
      wallet_address: walletAddress(event.wallet_address),
      challenge,
      server_time_ms: serverTime,
      expires_at_ms: expiresAt,
    };
  }
  const bindStatus = (raw: unknown, market: string, wallet: string) => {
    const status = platformMakerStatusResponse(raw);
    if (status.market_id !== market || status.wallet_address !== wallet) {
      throw new Error("maker stream status bindings disagree with the event");
    }
    return status;
  };
  if (type === "maker_snapshot") {
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "wallet_address",
      "stream_id", "sequence", "server_time_ms", "status", "fills",
    ], "maker stream snapshot");
    version(event);
    const market = marketId(event.market_id);
    const wallet = walletAddress(event.wallet_address);
    return {
      type,
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: market,
      wallet_address: wallet,
      stream_id: makerStreamIdentity(event.stream_id),
      sequence: atomicString(event.sequence, "sequence", false),
      server_time_ms: integer(event.server_time_ms, "server_time_ms"),
      status: bindStatus(event.status, market, wallet),
      fills: makerFills(event.fills, "fills"),
    };
  }
  if (type === "maker_fill" || type === "maker_status" || type === "heartbeat") {
    const payloadKey = type === "maker_fill" ? ["fill"] : type === "maker_status" ? ["status"] : [];
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "wallet_address",
      "stream_id", "sequence", "previous_sequence", "server_time_ms", ...payloadKey,
    ], `maker ${type} event`);
    version(event);
    const market = marketId(event.market_id);
    const wallet = walletAddress(event.wallet_address);
    const base = {
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: market,
      wallet_address: wallet,
      stream_id: makerStreamIdentity(event.stream_id),
      sequence: atomicString(event.sequence, "sequence", false),
      previous_sequence: atomicString(event.previous_sequence, "previous_sequence", false),
      server_time_ms: integer(event.server_time_ms, "server_time_ms"),
    } as const;
    if (type === "maker_fill") return { type, ...base, fill: makerFill(event.fill, "fill") };
    if (type === "maker_status") {
      return { type, ...base, status: bindStatus(event.status, market, wallet) };
    }
    return { type, ...base };
  }
  throw new Error("maker event type is invalid");
}

export function platformOrderChallengeResponse(
  value: unknown,
): PlatformOrderChallengeResponse {
  const response = object(value, "order challenge response");
  exactKeys(response, [
    "schema_version", "contract_version", "challenge_id", "market_id", "action",
    "order_ids", "authorization_payload_base64", "server_time_ms", "expires_at_ms",
  ], "order challenge response");
  version(response);
  const serverTime = integer(response.server_time_ms, "server_time_ms");
  const expiresAt = integer(response.expires_at_ms, "expires_at_ms");
  if (expiresAt <= serverTime) throw new Error("order challenge is already expired");
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    challenge_id: opaqueHandle(response.challenge_id, "challenge_id", "oc_"),
    market_id: marketId(response.market_id),
    action: orderAction(response.action, "action"),
    order_ids: opaqueOrderIds(response.order_ids, "order_ids"),
    authorization_payload_base64: canonicalBase64(
      response.authorization_payload_base64,
      "authorization_payload_base64",
    ),
    server_time_ms: serverTime,
    expires_at_ms: expiresAt,
  };
}

function makerControlProduct(value: unknown): PlatformMakerControlProduct {
  if (value !== "strand" && value !== "current") {
    throw new Error("maker-control product is invalid");
  }
  return value;
}

function makerControlAction(value: unknown): PlatformMakerControlAction {
  const actions: readonly PlatformMakerControlAction[] = [
    "strand_upsert",
    "strand_recenter",
    "strand_set_enabled",
    "strand_cancel",
    "current_upsert",
    "current_cancel",
  ];
  if (!actions.includes(value as PlatformMakerControlAction)) {
    throw new Error("maker-control action is invalid");
  }
  return value as PlatformMakerControlAction;
}

export function platformMakerControlPrepareResponse(
  value: unknown,
): PlatformMakerControlPrepareResponse {
  const response = object(value, "maker-control prepare response");
  exactKeys(response, [
    "schema_version", "contract_version", "maker_control_id", "market_id",
    "maker_wallet", "product", "action", "transaction_base64", "recent_blockhash",
    "last_valid_block_height", "expires_at_ms",
  ], "maker-control prepare response");
  version(response);
  const recentBlockhash = string(response.recent_blockhash, "recent_blockhash");
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(recentBlockhash)) {
    throw new Error("recent_blockhash is invalid");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    maker_control_id: opaqueHandle(response.maker_control_id, "maker_control_id", "mc_"),
    market_id: marketId(response.market_id),
    maker_wallet: walletAddress(response.maker_wallet, "maker_wallet"),
    product: makerControlProduct(response.product),
    action: makerControlAction(response.action),
    transaction_base64: canonicalBase64(response.transaction_base64, "transaction_base64"),
    recent_blockhash: recentBlockhash,
    last_valid_block_height: integer(response.last_valid_block_height, "last_valid_block_height"),
    expires_at_ms: integer(response.expires_at_ms, "expires_at_ms"),
  };
}

export function platformMakerControlSubmitResponse(
  value: unknown,
): PlatformMakerControlSubmitResponse {
  const response = object(value, "maker-control submit response");
  exactKeys(response, [
    "schema_version", "contract_version", "maker_control_id", "market_id",
    "maker_wallet", "product", "action", "signature", "status",
  ], "maker-control submit response");
  version(response);
  if (response.status !== "submitted") throw new Error("maker-control status is invalid");
  const signature = string(response.signature, "signature");
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) {
    throw new Error("signature is invalid");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    maker_control_id: opaqueHandle(response.maker_control_id, "maker_control_id", "mc_"),
    market_id: marketId(response.market_id),
    maker_wallet: walletAddress(response.maker_wallet, "maker_wallet"),
    product: makerControlProduct(response.product),
    action: makerControlAction(response.action),
    signature,
    status: "submitted",
  };
}

export function platformOrderPrepareResponse(value: unknown): PlatformOrderPrepareResponse {
  const response = object(value, "order prepare response");
  exactKeys(response, [
    "schema_version", "contract_version", "order_control_id", "market_id", "action",
    "order_ids", "transaction_base64", "recent_blockhash", "last_valid_block_height",
    "expires_at_ms",
  ], "order prepare response");
  version(response);
  const recentBlockhash = string(response.recent_blockhash, "recent_blockhash");
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(recentBlockhash)) {
    throw new Error("recent_blockhash is invalid");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    order_control_id: opaqueHandle(response.order_control_id, "order_control_id", "or_"),
    market_id: marketId(response.market_id),
    action: orderAction(response.action, "action"),
    order_ids: opaqueOrderIds(response.order_ids, "order_ids"),
    transaction_base64: canonicalBase64(response.transaction_base64, "transaction_base64"),
    recent_blockhash: recentBlockhash,
    last_valid_block_height: integer(
      response.last_valid_block_height,
      "last_valid_block_height",
    ),
    expires_at_ms: integer(response.expires_at_ms, "expires_at_ms"),
  };
}

export function platformOrderSubmitResponse(value: unknown): PlatformOrderSubmitResponse {
  const response = object(value, "order submit response");
  exactKeys(response, [
    "schema_version", "contract_version", "order_control_id", "market_id", "action",
    "order_ids", "signature", "status",
  ], "order submit response");
  version(response);
  if (response.status !== "submitted") throw new Error("order submission status is invalid");
  const signature = string(response.signature, "signature");
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) {
    throw new Error("signature is invalid");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    order_control_id: opaqueHandle(response.order_control_id, "order_control_id", "or_"),
    market_id: marketId(response.market_id),
    action: orderAction(response.action, "action"),
    order_ids: opaqueOrderIds(response.order_ids, "order_ids"),
    signature,
    status: "submitted",
  };
}

export function platformOrderStatusResponse(value: unknown): PlatformOrderStatusResponse {
  const response = object(value, "order status response");
  exactKeys(response, [
    "schema_version", "contract_version", "order_control_id", "market_id", "action",
    "order_ids", "signature", "status", "failure_code", "updated_at_ms",
  ], "order status response");
  version(response);
  if (!ORDER_CONTROL_STATUSES.includes(
    response.status as typeof ORDER_CONTROL_STATUSES[number],
  )) {
    throw new Error("order control status is invalid");
  }
  const status = response.status as PlatformOrderControlStatus;
  const signature = string(response.signature, "signature");
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) {
    throw new Error("signature is invalid");
  }
  let failureCode: string | null = null;
  if (response.failure_code !== null) {
    failureCode = string(response.failure_code, "failure_code");
    if (!/^[a-z][a-z0-9_]{2,63}$/.test(failureCode)) {
      throw new Error("failure_code is invalid");
    }
  }
  if ((status === "failed") !== (failureCode !== null)) {
    throw new Error("failure_code does not match order status");
  }
  return {
    schema_version: PLATFORM_SCHEMA_VERSION,
    contract_version: PLATFORM_CONTRACT_VERSION,
    order_control_id: opaqueHandle(response.order_control_id, "order_control_id", "or_"),
    market_id: marketId(response.market_id),
    action: orderAction(response.action, "action"),
    order_ids: opaqueOrderIds(response.order_ids, "order_ids"),
    signature,
    status,
    failure_code: failureCode,
    updated_at_ms: integer(response.updated_at_ms, "updated_at_ms"),
  };
}

function orderChallengeWire(value: unknown): PlatformOrderChallengeWire {
  const request = object(value, "effective order challenge");
  const action = orderAction(request.action, "effective order challenge.action");
  const common = {
    action,
    owner_wallet: walletAddress(request.owner_wallet, "owner_wallet"),
    session_public_key: walletAddress(request.session_public_key, "session_public_key"),
  };
  if (common.owner_wallet === common.session_public_key) {
    throw new Error("effective order challenge reuses the owner as session key");
  }
  // The account sequence is optional on the wire: an omitted one is resolved
  // by Strata from the Vault's confirmed market account, so the echoed
  // effective request may carry it or not.
  const placeKeys = (item: JsonObject, keys: readonly string[], field: string) =>
    exactKeys(item, "account_sequence" in item ? [...keys, "account_sequence"] : keys, field);
  const place = (item: JsonObject, field: string) => {
    if (item.side !== "buy" && item.side !== "sell") throw new Error(`${field}.side is invalid`);
    if (item.order_type !== "good_until_cancelled" && item.order_type !== "post_only") {
      throw new Error(`${field}.order_type is invalid`);
    }
    return {
      ...("account_sequence" in item
        ? { account_sequence: atomicString(item.account_sequence, `${field}.account_sequence`) }
        : {}),
      client_order_id: string(item.client_order_id, `${field}.client_order_id`),
      side: item.side,
      order_type: item.order_type,
      limit_price_atoms: atomicString(item.limit_price_atoms, `${field}.limit_price_atoms`, false),
      size_atoms: atomicString(item.size_atoms, `${field}.size_atoms`, false),
    } as const;
  };
  if (action === "place") {
    placeKeys(request, [
      "action", "owner_wallet", "session_public_key", "client_order_id",
      "side", "order_type", "limit_price_atoms", "size_atoms",
    ], "effective order challenge");
    return { ...common, action, ...place(request, "effective order challenge") };
  }
  if (action === "cancel") {
    exactKeys(request, ["action", "owner_wallet", "session_public_key", "order_id"],
      "effective order challenge");
    return { ...common, action, order_id: opaqueOrderId(request.order_id, "order_id") };
  }
  if (action === "cancel_all") {
    exactKeys(request, ["action", "owner_wallet", "session_public_key"],
      "effective order challenge");
    return { ...common, action };
  }
  if (action === "replace") {
    placeKeys(request, [
      "action", "owner_wallet", "session_public_key", "order_id",
      "client_order_id", "side", "order_type", "limit_price_atoms", "size_atoms",
    ], "effective order challenge");
    return {
      ...common,
      action,
      order_id: opaqueOrderId(request.order_id, "order_id"),
      ...place(request, "effective order challenge"),
    };
  }
  exactKeys(request, ["action", "owner_wallet", "session_public_key", "operations"],
    "effective order challenge");
  if (!Array.isArray(request.operations)
      || request.operations.length < 1 || request.operations.length > 6) {
    throw new Error("effective order batch must contain between one and six operations");
  }
  const operations = request.operations.map((raw, index) => {
    const item = object(raw, `operations[${index}]`);
    if (item.action === "cancel") {
      exactKeys(item, ["action", "order_id"], `operations[${index}]`);
      return {
        action: "cancel" as const,
        order_id: opaqueOrderId(item.order_id, `operations[${index}].order_id`),
      };
    }
    if (item.action === "place") {
      placeKeys(item, [
        "action", "client_order_id", "side", "order_type",
        "limit_price_atoms", "size_atoms",
      ], `operations[${index}]`);
      return { action: "place" as const, ...place(item, `operations[${index}]`) };
    }
    if (item.action === "replace") {
      placeKeys(item, [
        "action", "order_id", "client_order_id", "side", "order_type",
        "limit_price_atoms", "size_atoms",
      ], `operations[${index}]`);
      return {
        action: "replace" as const,
        order_id: opaqueOrderId(item.order_id, `operations[${index}].order_id`),
        ...place(item, `operations[${index}]`),
      };
    }
    throw new Error(`operations[${index}].action is invalid`);
  });
  return { ...common, action: "batch", operations };
}

function deadManState(value: unknown): PlatformDeadManState {
  const state = object(value, "dead-man state");
  exactKeys(state, [
    "status", "timeout_ms", "heartbeat_deadline_ms", "order_control_id",
    "signature", "failure_code", "updated_at_ms",
  ], "dead-man state");
  if (!DEAD_MAN_STATUSES.includes(state.status as typeof DEAD_MAN_STATUSES[number])) {
    throw new Error("dead-man status is invalid");
  }
  const optional = (value: unknown, field: string): string | null =>
    value === null ? null : string(value, field);
  const controlId = optional(state.order_control_id, "order_control_id");
  if (controlId !== null) opaqueHandle(controlId, "order_control_id", "or_");
  const signature = optional(state.signature, "signature");
  if (signature !== null && !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) {
    throw new Error("dead-man signature is invalid");
  }
  const failureCode = optional(state.failure_code, "failure_code");
  if (failureCode !== null && !/^[a-z][a-z0-9_]{2,63}$/.test(failureCode)) {
    throw new Error("dead-man failure code is invalid");
  }
  return {
    status: state.status as PlatformDeadManState["status"],
    timeout_ms: integer(state.timeout_ms, "timeout_ms", 30_000),
    heartbeat_deadline_ms: integer(state.heartbeat_deadline_ms, "heartbeat_deadline_ms"),
    order_control_id: controlId,
    signature,
    failure_code: failureCode,
    updated_at_ms: integer(state.updated_at_ms, "updated_at_ms"),
  };
}

function commandStreamId(value: unknown): string {
  const id = string(value, "stream_id");
  if (!/^order_command_stream_[0-9a-f]{32}$/.test(id)) {
    throw new Error("order command stream ID is invalid");
  }
  return id;
}

export function platformOrderCommandEvent(value: unknown): PlatformOrderCommandEvent {
  const event = object(value, "order command event");
  const type = string(event.type, "order command event.type");
  const base = () => {
    version(event);
    return {
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: marketId(event.market_id),
      server_time_ms: integer(event.server_time_ms, "server_time_ms"),
    } as const;
  };
  if (type === "auth_challenge") {
    exactKeys(event, [
      "type", "schema_version", "contract_version", "market_id", "challenge",
      "server_time_ms", "expires_at_ms",
    ], "order command auth challenge");
    const common = base();
    const challenge = string(event.challenge, "challenge");
    if (!/^[0-9a-f]{64}$/.test(challenge)) throw new Error("order command challenge is invalid");
    const expiresAt = integer(event.expires_at_ms, "expires_at_ms");
    if (expiresAt <= common.server_time_ms) throw new Error("order command challenge is expired");
    return { type, ...common, challenge, expires_at_ms: expiresAt };
  }
  const ready = type === "ready";
  const resultKeys = ready
    ? ["type", "schema_version", "contract_version", "market_id", "stream_id", "sequence",
      "server_time_ms"]
    : undefined;
  if (ready) {
    exactKeys(event, resultKeys!, "order command ready");
    return {
      type,
      ...base(),
      stream_id: commandStreamId(event.stream_id),
      sequence: atomicString(event.sequence, "sequence", false),
    };
  }
  const commonKeys = [
    "type", "schema_version", "contract_version", "market_id", "stream_id", "sequence",
    "previous_sequence", "server_time_ms",
  ];
  const common = () => ({
    ...base(),
    stream_id: commandStreamId(event.stream_id),
    sequence: atomicString(event.sequence, "sequence", false),
    previous_sequence: atomicString(event.previous_sequence, "previous_sequence"),
  });
  if (type === "heartbeat") {
    exactKeys(event, commonKeys, "order command heartbeat");
    return { type, ...common() };
  }
  const requestId = string(event.request_id, "request_id");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(requestId)) throw new Error("request_id is invalid");
  if (type === "probe_result") {
    exactKeys(event, [...commonKeys, "request_id", "nonce"], "order command probe result");
    const nonce = string(event.nonce, "nonce");
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(nonce)) {
      throw new Error("order command probe nonce is invalid");
    }
    return { type, ...common(), request_id: requestId, nonce };
  }
  if (type === "challenge_result") {
    exactKeys(event, [...commonKeys, "request_id", "self_trade_prevention",
      "prevented_order_ids", "effective_request", "response"], "order challenge result");
    if (!SELF_TRADE_PREVENTION.includes(
      event.self_trade_prevention as typeof SELF_TRADE_PREVENTION[number],
    )) throw new Error("self-trade prevention mode is invalid");
    if (!Array.isArray(event.prevented_order_ids) || event.prevented_order_ids.length > 12) {
      throw new Error("prevented_order_ids is invalid");
    }
    const preventedOrderIds = event.prevented_order_ids.map((item, index) =>
      opaqueOrderId(item, `prevented_order_ids[${index}]`));
    unique(preventedOrderIds, "prevented_order_ids");
    return {
      type,
      ...common(),
      request_id: requestId,
      self_trade_prevention: event.self_trade_prevention as PlatformSelfTradePrevention,
      prevented_order_ids: preventedOrderIds,
      effective_request: orderChallengeWire(event.effective_request),
      response: platformOrderChallengeResponse(event.response),
    };
  }
  if (type === "prepare_result") {
    exactKeys(event, [...commonKeys, "request_id", "response"], "order prepare result");
    return { type, ...common(), request_id: requestId,
      response: platformOrderPrepareResponse(event.response) };
  }
  if (type === "submit_result") {
    exactKeys(event, [...commonKeys, "request_id", "response"], "order submit result");
    return { type, ...common(), request_id: requestId,
      response: platformOrderSubmitResponse(event.response) };
  }
  if (type === "status_result") {
    exactKeys(event, [...commonKeys, "request_id", "response"], "order status result");
    return { type, ...common(), request_id: requestId,
      response: platformOrderStatusResponse(event.response) };
  }
  if (type === "dead_man_result") {
    exactKeys(event, [...commonKeys, "request_id", "state"], "dead-man result");
    return { type, ...common(), request_id: requestId, state: deadManState(event.state) };
  }
  if (type === "command_error") {
    exactKeys(event, [...commonKeys, "request_id", "error"], "order command error");
    const error = object(event.error, "order command error.error");
    const keys = ["code", "message", "retryable"];
    if (error.retry_after_ms !== undefined) keys.push("retry_after_ms");
    if (error.operation_id !== undefined) keys.push("operation_id");
    exactKeys(error, keys, "order command error.error");
    const code = string(error.code, "error.code");
    if (!PUBLIC_ERROR_CODES.includes(code as typeof PUBLIC_ERROR_CODES[number])
        || typeof error.retryable !== "boolean") {
      throw new Error("order command error is invalid");
    }
    return {
      type,
      ...common(),
      request_id: requestId,
      error: {
        code: code as typeof PUBLIC_ERROR_CODES[number],
        message: string(error.message, "error.message"),
        retryable: error.retryable,
        ...(error.retry_after_ms === undefined ? {} : {
          retry_after_ms: integer(error.retry_after_ms, "error.retry_after_ms"),
        }),
        ...(error.operation_id === undefined ? {} : {
          operation_id: string(error.operation_id, "error.operation_id"),
        }),
      },
    };
  }
  throw new Error("order command event type is invalid");
}

export function platformOrderCommandEvents(
  value: unknown,
  maximumEvents = 64,
): PlatformOrderCommandEvent[] {
  if (Array.isArray(value)) {
    if (value.length < 1 || value.length > maximumEvents) {
      throw new Error("order command event batch is invalid");
    }
    return value.map(platformOrderCommandEvent);
  }
  const candidate = object(value, "order command server frame");
  if (candidate.type !== "event_batch") return [platformOrderCommandEvent(candidate)];
  exactKeys(candidate, [
    "type", "schema_version", "contract_version", "market_id", "stream_id",
    "first_sequence", "previous_sequence", "server_time_ms", "events",
  ], "order command compact event batch");
  version(candidate);
  const market = marketId(candidate.market_id);
  const stream = commandStreamId(candidate.stream_id);
  const firstSequence = atomicString(candidate.first_sequence, "first_sequence", false);
  const previousSequence = atomicString(candidate.previous_sequence, "previous_sequence");
  const first = BigInt(firstSequence);
  const previous = BigInt(previousSequence);
  if (first !== previous + 1n) throw new Error("order command compact sequence is invalid");
  const serverTime = integer(candidate.server_time_ms, "server_time_ms");
  if (!Array.isArray(candidate.events)
      || candidate.events.length < 1
      || candidate.events.length > maximumEvents) {
    throw new Error("order command compact event batch is invalid");
  }
  const forbidden = [
    "schema_version", "contract_version", "market_id", "stream_id", "sequence",
    "previous_sequence", "server_time_ms",
  ];
  return candidate.events.map((raw, index) => {
    const event = object(raw, `order command compact event[${index}]`);
    if (forbidden.some((key) => Object.hasOwn(event, key))) {
      throw new Error("order command compact event repeats shared metadata");
    }
    const sequence = first + BigInt(index);
    return platformOrderCommandEvent({
      ...event,
      schema_version: PLATFORM_SCHEMA_VERSION,
      contract_version: PLATFORM_CONTRACT_VERSION,
      market_id: market,
      stream_id: stream,
      sequence: sequence.toString(),
      previous_sequence: (sequence - 1n).toString(),
      server_time_ms: serverTime,
    });
  });
}
