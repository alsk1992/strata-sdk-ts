import {
  PLATFORM_CONTRACT_VERSION,
  PLATFORM_SCHEMA_VERSION,
  type LivePlatformCapability,
  type PageInfo,
  type PlatformAsset,
  type PlatformAssetsResponse,
  type PlatformAccountEvent,
  type PlatformAccountFill,
  type PlatformAccountOrder,
  type PlatformAccountSnapshotResponse,
  type PlatformBestBidAskResponse,
  type PlatformBookChange,
  type PlatformBookLevel,
  type PlatformBookSnapshotResponse,
  type PlatformDiscoveryResponse,
  type PlatformFeeScheduleResponse,
  type PlatformMarketDataEvent,
  type PlatformMarket,
  type PlatformMarketAction,
  type PlatformMarketStatusResponse,
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
  type PlatformSelfTradePrevention,
  type PlatformTrade,
  type PlatformTradesResponse,
} from "./platform.js";

type JsonObject = Record<string, unknown>;

const RISKS = ["read", "prepare", "submit", "destructive"] as const;
const TRANSPORTS = ["http", "websocket", "mcp"] as const;
const MCP_EXPOSURES = ["none", "read", "prepare", "submit"] as const;
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

function marketId(value: unknown, field = "market_id"): string {
  const id = string(value, field);
  if (!/^market_[0-9a-f]{32}$/.test(id)) throw new Error(`${field} is invalid`);
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
  const place = (item: JsonObject, field: string) => {
    if (item.side !== "buy" && item.side !== "sell") throw new Error(`${field}.side is invalid`);
    if (item.order_type !== "good_until_cancelled" && item.order_type !== "post_only") {
      throw new Error(`${field}.order_type is invalid`);
    }
    return {
      account_sequence: atomicString(item.account_sequence, `${field}.account_sequence`),
      client_order_id: string(item.client_order_id, `${field}.client_order_id`),
      side: item.side,
      order_type: item.order_type,
      limit_price_atoms: atomicString(item.limit_price_atoms, `${field}.limit_price_atoms`, false),
      size_atoms: atomicString(item.size_atoms, `${field}.size_atoms`, false),
    } as const;
  };
  if (action === "place") {
    exactKeys(request, [
      "action", "owner_wallet", "session_public_key", "account_sequence", "client_order_id",
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
    exactKeys(request, [
      "action", "owner_wallet", "session_public_key", "order_id", "account_sequence",
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
      exactKeys(item, [
        "action", "account_sequence", "client_order_id", "side", "order_type",
        "limit_price_atoms", "size_atoms",
      ], `operations[${index}]`);
      return { action: "place" as const, ...place(item, `operations[${index}]`) };
    }
    if (item.action === "replace") {
      exactKeys(item, [
        "action", "order_id", "account_sequence", "client_order_id", "side", "order_type",
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
