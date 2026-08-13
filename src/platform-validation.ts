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
