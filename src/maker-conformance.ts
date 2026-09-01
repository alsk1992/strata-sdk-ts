import {
  StrataApiError,
  StrataClient,
  StrataContractError,
  decodeBase64,
} from "./client.js";
import {
  StrataPlatformClient,
  type StrataPlatformClientOptions,
} from "./platform-client.js";
import {
  decodeTransaction,
} from "./transaction-verifier.js";
import type {
  PlatformMakerQuickstartProduct,
  PlatformMakerQuickstartPrepared,
  PlatformMakerStatusResponse,
  PlatformMakerTransactionSigner,
} from "./platform.js";
import { DEFAULT_API_BASE, type StrataSessionSigner } from "./types.js";

const DEFAULT_MCP_URL = "https://api.stratabook.app/mcp";
const DEFAULT_MARKET = "SOL/USDC";
const DEFAULT_MAKER_WALLET = "5Ji61Fbeb22Yntgv1hhHeSSLgdEdZchHeM1Tv1MjGhSL";
const DEFAULT_SIZE = "0.01 SOL";
const DEFAULT_SPREAD_BPS = 5;
const DEFAULT_DURATION = "10m";
const MAKER_MCP_PROFILE = "market_making";
const REQUIRED_MCP_TOOLS = [
  "strata_market_making_status",
  "strata_market_making_reputation",
  "strata_market_making_prepare",
  "strata_market_making_submit_and_wait",
] as const;

type JsonObject = Record<string, unknown>;

export interface MakerConformanceCheck {
  readonly name: string;
  readonly ok: true;
  readonly detail: string;
}

export interface MakerSafeConformanceOptions extends StrataPlatformClientOptions {
  readonly mcpUrl?: string;
  readonly market?: string;
  readonly makerWallet?: string;
  readonly size?: string;
  readonly spreadBps?: number;
  readonly duration?: number | string;
}

export interface MakerSafeConformanceReport {
  readonly schema_version: 1;
  readonly mode: "safe";
  readonly ok: true;
  readonly api_base: string;
  readonly mcp_url: string;
  readonly mcp_version: string;
  readonly market: string;
  readonly market_id: string;
  readonly maker_wallet: string;
  readonly base_asset_symbol: string;
  readonly maximum_exposure_atoms: string;
  readonly checks: readonly MakerConformanceCheck[];
}

export interface MakerFundedConformanceOptions extends MakerSafeConformanceOptions {
  readonly signer: PlatformMakerTransactionSigner;
  /** How long collateral must remain observable while a product is active. */
  readonly holdMs?: number;
  /** Chain-derived maker-state acknowledgement timeout. */
  readonly confirmationTimeoutMs?: number;
  /** Also prove that an expiring control becomes non-fillable without a cancel. */
  readonly expirySeconds?: number;
}

export interface MakerFundedProductResult {
  readonly product: PlatformMakerQuickstartProduct;
  readonly transport: "mcp" | "typescript_sdk";
  readonly start_control_id: string;
  readonly start_signature: string;
  readonly stop_control_id: string;
  readonly stop_signature: string;
  readonly collateral_observation: "stable" | "fill_observed";
}

export interface MakerFundedConformanceReport {
  readonly schema_version: 1;
  readonly mode: "funded";
  readonly ok: true;
  readonly api_base: string;
  readonly mcp_url: string;
  readonly market: string;
  readonly market_id: string;
  readonly maker_wallet: string;
  readonly products: readonly MakerFundedProductResult[];
  readonly expiry: {
    readonly tested: boolean;
    readonly product?: PlatformMakerQuickstartProduct;
    readonly observed_expired?: boolean;
  };
}

export interface MakerWaterfallConformanceOptions extends MakerFundedConformanceOptions {
  readonly takerOwnerWallet: string;
  readonly takerSigner: StrataSessionSigner;
  /** Base atoms consumed from one product while leaving live exposure. */
  readonly partialFillBaseAtoms?: string | bigint;
  /** Base atoms that must execute beyond combined Strand + Current exposure. */
  readonly fallbackBaseAtoms?: string | bigint;
  readonly takerSide?: "buy" | "sell";
  readonly maximumToleranceBps?: number;
}

export interface MakerWaterfallCaseResult {
  readonly case: "current_only" | "strand_only" | "strand_current_sonar";
  readonly execution_id: string;
  readonly execution_signature: string;
  readonly confirmed_products: readonly PlatformMakerQuickstartProduct[];
  readonly requested_base_atoms: string;
  readonly fallback_required: boolean;
}

export interface MakerWaterfallConformanceReport {
  readonly schema_version: 1;
  readonly mode: "waterfall";
  readonly ok: true;
  readonly api_base: string;
  readonly market: string;
  readonly market_id: string;
  readonly maker_wallet: string;
  readonly taker_owner_wallet: string;
  readonly side: "buy" | "sell";
  readonly cases: readonly MakerWaterfallCaseResult[];
}

interface McpPreparation {
  readonly action: "start" | "stop";
  readonly market: JsonObject;
  readonly base_asset?: JsonObject;
  readonly product: PlatformMakerQuickstartProduct;
  readonly operation: JsonObject;
  readonly prepared: JsonObject & {
    readonly maker_control_id: string;
    readonly maker_wallet: string;
    readonly market_id: string;
    readonly product: PlatformMakerQuickstartProduct;
    readonly transaction_base64: string;
  };
  readonly preparationToken: string;
}

interface McpSubmitResult {
  readonly receipt: JsonObject & {
    readonly maker_control_id: string;
    readonly signature: string;
  };
  readonly maker_status: PlatformMakerStatusResponse;
}

function object(value: unknown, name: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new StrataContractError(`${name} is not an object`);
  }
  return value as JsonObject;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new StrataContractError(`${name} is not a non-empty string`);
  }
  return value;
}

function integer(value: unknown, name: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new TypeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value as number;
}

function normalizedUrl(value: string, name: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError(`${name} must use http or https`);
  }
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

/** Bind maker-only MCP probes to their canonical runtime profile. */
export function makerConformanceMcpUrl(value: string): string {
  const parsed = new URL(normalizedUrl(value, "mcpUrl"));
  const profiles = parsed.searchParams.getAll("profile");
  if (
    profiles.length > 1
    || (profiles.length === 1 && profiles[0] !== MAKER_MCP_PROFILE)
  ) {
    throw new TypeError(`mcpUrl profile must be ${MAKER_MCP_PROFILE}`);
  }
  parsed.searchParams.set("profile", MAKER_MCP_PROFILE);
  return parsed.toString();
}

function productStatus(
  status: PlatformMakerStatusResponse,
  product: PlatformMakerQuickstartProduct,
): PlatformMakerStatusResponse["strands"][number] | PlatformMakerStatusResponse["currents"][number] | undefined {
  return product === "strand" ? status.strands[0] : status.currents[0];
}

function productIsLive(status: PlatformMakerStatusResponse, product: PlatformMakerQuickstartProduct): boolean {
  const row = productStatus(status, product);
  return row !== undefined && row.enabled && !row.expired && BigInt(row.remaining_exposure_atoms) > 0n;
}

function maximumExposure(prepared: PlatformMakerQuickstartPrepared): string {
  const operation = prepared.operation;
  if (operation.action !== "upsert") {
    throw new StrataContractError("maker start did not resolve to an upsert operation");
  }
  return operation.maxExposureBaseAtoms.toString();
}

/**
 * The packet-level invariant shared by the live smoke and funded suites.
 * Maker transactions are deliberately native v0, have no lookup tables, and
 * require only the externally controlled maker wallet.
 */
export function assertNativeMakerTransaction(
  transactionBase64: string,
  makerWallet: string,
): { readonly bytes: number; readonly signatures: number } {
  const decoded = decodeTransaction(transactionBase64);
  if (decoded.version !== 0) {
    throw new StrataContractError("maker preparation is not a native-v0 transaction");
  }
  if (decoded.addressTableLookupCount !== 0) {
    throw new StrataContractError("maker preparation unexpectedly uses lookup tables");
  }
  if (
    decoded.numRequiredSignatures !== 1
    || decoded.signatureCount !== 1
    || decoded.staticAccountKeys[0] !== makerWallet
  ) {
    throw new StrataContractError("maker preparation has an unexpected signer layout");
  }
  const bytes = decodeBase64(transactionBase64).length;
  if (bytes > 1_232) {
    throw new StrataContractError(`maker transaction is ${bytes} bytes; maximum is 1232`);
  }
  return { bytes, signatures: decoded.signatureCount };
}

async function mcpRequest(
  fetchImpl: typeof globalThis.fetch,
  mcpUrl: string,
  id: number,
  method: string,
  params?: JsonObject,
): Promise<JsonObject> {
  const response = await fetchImpl(mcpUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      ...(params === undefined ? {} : { params }),
    }),
  });
  if (!response.ok) {
    throw new StrataContractError(`MCP ${method} returned HTTP ${response.status}`);
  }
  const payload = object(await response.json(), `MCP ${method} response`);
  if (payload.error !== undefined) {
    const error = object(payload.error, `MCP ${method} error`);
    throw new StrataContractError(
      `MCP ${method} failed: ${typeof error.message === "string" ? error.message : "unknown error"}`,
    );
  }
  return object(payload.result, `MCP ${method} result`);
}

function mcpToolContent(result: JsonObject, tool: string): JsonObject {
  if (result.isError === true) {
    const content = Array.isArray(result.content) ? result.content : [];
    const first = content[0];
    const message = typeof first === "object" && first !== null && "text" in first
      ? String((first as { text?: unknown }).text ?? "")
      : "";
    throw new StrataContractError(`${tool} failed${message ? `: ${message}` : ""}`);
  }
  return object(result.structuredContent, `${tool} structuredContent`);
}

function mcpMissingReputation(result: JsonObject): boolean {
  if (result.isError !== true || !Array.isArray(result.content)) return false;
  return result.content.some((item) =>
    typeof item === "object"
    && item !== null
    && "text" in item
    && String(item.text).includes("No maker reputation record exists"));
}

async function mcpTool(
  fetchImpl: typeof globalThis.fetch,
  mcpUrl: string,
  id: number,
  name: string,
  args: JsonObject,
): Promise<JsonObject> {
  return mcpRequest(fetchImpl, mcpUrl, id, "tools/call", {
    name,
    arguments: args,
  });
}

async function mcpPrepare(
  fetchImpl: typeof globalThis.fetch,
  mcpUrl: string,
  id: number,
  args: JsonObject,
): Promise<McpPreparation> {
  const content = mcpToolContent(
    await mcpTool(fetchImpl, mcpUrl, id, "strata_market_making_prepare", args),
    "strata_market_making_prepare",
  );
  const prepared = object(content.prepared, "MCP prepared maker transaction");
  const result: McpPreparation = {
    action: content.action === "stop" ? "stop" : "start",
    market: object(content.market, "MCP prepared market"),
    ...(content.base_asset === undefined
      ? {}
      : { base_asset: object(content.base_asset, "MCP prepared base asset") }),
    product: content.product === "strand" ? "strand" : content.product === "current"
      ? "current"
      : (() => { throw new StrataContractError("MCP prepared product is invalid"); })(),
    operation: object(content.operation, "MCP prepared operation"),
    prepared: {
      ...prepared,
      maker_control_id: string(prepared.maker_control_id, "MCP maker control ID"),
      maker_wallet: string(prepared.maker_wallet, "MCP maker wallet"),
      market_id: string(prepared.market_id, "MCP market ID"),
      product: prepared.product === "strand" ? "strand" : prepared.product === "current"
        ? "current"
        : (() => { throw new StrataContractError("MCP transaction product is invalid"); })(),
      transaction_base64: string(prepared.transaction_base64, "MCP maker transaction"),
    },
    preparationToken: string(content.preparationToken, "MCP preparation token"),
  };
  if (!/^[A-Za-z0-9_-]{16,32768}$/.test(result.preparationToken)) {
    throw new StrataContractError("MCP preparation token is malformed");
  }
  if (result.product !== result.prepared.product) {
    throw new StrataContractError("MCP preparation product binding is inconsistent");
  }
  assertNativeMakerTransaction(result.prepared.transaction_base64, result.prepared.maker_wallet);
  return result;
}

async function mcpSubmit(
  fetchImpl: typeof globalThis.fetch,
  mcpUrl: string,
  id: number,
  prepared: McpPreparation,
  signedTransactionBase64: string,
  confirmationTimeoutMs: number,
): Promise<McpSubmitResult> {
  const content = mcpToolContent(
    await mcpTool(fetchImpl, mcpUrl, id, "strata_market_making_submit_and_wait", {
      makerControlId: prepared.prepared.maker_control_id,
      preparationToken: prepared.preparationToken,
      signedTransactionBase64,
      idempotencyKey: prepared.prepared.maker_control_id,
      confirmationTimeoutMs,
    }),
    "strata_market_making_submit_and_wait",
  );
  const receipt = object(content.receipt, "MCP maker receipt");
  if (receipt.maker_control_id !== prepared.prepared.maker_control_id) {
    throw new StrataContractError("MCP maker receipt changed the control ID");
  }
  return {
    receipt: {
      ...receipt,
      maker_control_id: string(receipt.maker_control_id, "MCP receipt control ID"),
      signature: string(receipt.signature, "MCP receipt signature"),
    },
    maker_status: content.maker_status as PlatformMakerStatusResponse,
  };
}

function checkedCommon(options: MakerSafeConformanceOptions): {
  readonly apiBase: string;
  readonly mcpUrl: string;
  readonly market: string;
  readonly makerWallet: string;
  readonly size: string;
  readonly spreadBps: number;
  readonly duration: number | string;
  readonly fetchImpl: typeof globalThis.fetch;
} {
  const apiBase = normalizedUrl(options.apiBase?.trim() || DEFAULT_API_BASE, "apiBase");
  const mcpUrl = makerConformanceMcpUrl(options.mcpUrl?.trim() || DEFAULT_MCP_URL);
  const market = options.market?.trim() || DEFAULT_MARKET;
  const makerWallet = options.makerWallet?.trim() || DEFAULT_MAKER_WALLET;
  const size = options.size?.trim() || DEFAULT_SIZE;
  const spreadBps = integer(options.spreadBps ?? DEFAULT_SPREAD_BPS, "spreadBps", 1, 5_000);
  const duration = options.duration ?? DEFAULT_DURATION;
  if (typeof duration === "number") integer(duration, "duration", 1, 604_800);
  else if (!/^[1-9][0-9]*(?:s|m|h|d)$/i.test(duration)) {
    throw new TypeError("duration must be seconds or a duration such as 30s, 10m, 2h, or 1d");
  }
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("a Fetch-compatible implementation is required");
  return { apiBase, mcpUrl, market, makerWallet, size, spreadBps, duration, fetchImpl };
}

/**
 * Read-only/non-broadcasting production conformance. It exercises the exact
 * public SDK resolution and verification path plus fresh hosted-MCP requests.
 */
export async function runMakerSafeConformance(
  options: MakerSafeConformanceOptions = {},
): Promise<MakerSafeConformanceReport> {
  const common = checkedCommon(options);
  const client = new StrataPlatformClient({
    apiBase: common.apiBase,
    fetch: common.fetchImpl,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.capabilityCacheMs === undefined
      ? {}
      : { capabilityCacheMs: options.capabilityCacheMs }),
  });
  const checks: MakerConformanceCheck[] = [];
  const market = await client.marketMaking.waitUntilReady(common.market, 30_000);
  checks.push({ name: "market_ready", ok: true, detail: market.label });

  const status = await client.marketMaking.status(market.market_id, common.makerWallet);
  if (status.wallet_address !== common.makerWallet) {
    throw new StrataContractError("maker status binding differs from the requested wallet");
  }
  let reputationDetail = "registered reputation";
  try {
    const reputation = await client.marketMaking.reputation(market.market_id, common.makerWallet);
    if (reputation.wallet_address !== common.makerWallet) {
      throw new StrataContractError("maker reputation binding differs from the requested wallet");
    }
  } catch (error) {
    if (!(error instanceof StrataApiError) || error.status !== 404) throw error;
    reputationDetail = "clean unregistered response";
  }
  checks.push({ name: "maker_reads", ok: true, detail: `status and ${reputationDetail}` });

  const sdkCurrent = await client.marketMaking.prepareStart({
    market: market.market_id,
    product: "current",
    makerWallet: common.makerWallet,
    spreadBps: common.spreadBps,
    size: common.size,
    duration: common.duration,
  });
  const sdkStrand = await client.marketMaking.prepareStart({
    market: market.market_id,
    product: "strand",
    makerWallet: common.makerWallet,
    spreadBps: common.spreadBps,
    size: common.size,
    duration: common.duration,
  });
  const sdkExposure = maximumExposure(sdkCurrent);
  if (maximumExposure(sdkStrand) !== sdkExposure) {
    throw new StrataContractError("Strand and Current resolved different maximum exposure");
  }
  for (const prepared of [sdkCurrent, sdkStrand]) {
    assertNativeMakerTransaction(prepared.prepared.transaction_base64, common.makerWallet);
  }
  checks.push({
    name: "typescript_prepare",
    ok: true,
    detail: `Strand and Current; ${sdkExposure} base atoms`,
  });

  const initialize = await mcpRequest(common.fetchImpl, common.mcpUrl, 1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "strata-maker-conformance", version: "1.0.0" },
  });
  const serverInfo = object(initialize.serverInfo, "MCP serverInfo");
  const mcpVersion = string(serverInfo.version, "MCP server version");
  const tools = await mcpRequest(common.fetchImpl, common.mcpUrl, 2, "tools/list");
  const names = new Set(
    (Array.isArray(tools.tools) ? tools.tools : []).map((tool) =>
      typeof tool === "object" && tool !== null && "name" in tool ? String(tool.name) : ""),
  );
  const missing = REQUIRED_MCP_TOOLS.filter((name) => !names.has(name));
  if (missing.length > 0) throw new StrataContractError(`MCP is missing maker tools: ${missing.join(", ")}`);
  checks.push({ name: "mcp_discovery", ok: true, detail: `version ${mcpVersion}` });

  mcpToolContent(await mcpTool(
    common.fetchImpl,
    common.mcpUrl,
    3,
    "strata_market_making_status",
    { marketId: market.market_id, walletAddress: common.makerWallet },
  ), "strata_market_making_status");
  const mcpReputation = await mcpTool(
    common.fetchImpl,
    common.mcpUrl,
    4,
    "strata_market_making_reputation",
    { marketId: market.market_id, walletAddress: common.makerWallet },
  );
  if (!mcpMissingReputation(mcpReputation)) {
    mcpToolContent(mcpReputation, "strata_market_making_reputation");
  }
  checks.push({ name: "mcp_maker_reads", ok: true, detail: "status and reputation response" });

  const mcpCurrent = await mcpPrepare(common.fetchImpl, common.mcpUrl, 5, {
    action: "start",
    market: common.market,
    product: "current",
    makerWallet: common.makerWallet,
    spreadBps: common.spreadBps,
    size: common.size,
    duration: common.duration,
  });
  const mcpStrand = await mcpPrepare(common.fetchImpl, common.mcpUrl, 6, {
    action: "start",
    market: common.market,
    product: "strand",
    makerWallet: common.makerWallet,
    spreadBps: common.spreadBps,
    size: common.size,
    duration: common.duration,
  });
  const currentExposure = string(mcpCurrent.operation.maxExposureBaseAtoms, "MCP Current exposure");
  const strandExposure = string(mcpStrand.operation.maxExposureBaseAtoms, "MCP Strand exposure");
  if (currentExposure !== sdkExposure || strandExposure !== sdkExposure) {
    throw new StrataContractError("SDK and MCP resolved different maker exposure");
  }
  if (
    mcpCurrent.prepared.market_id !== market.market_id
    || mcpStrand.prepared.market_id !== market.market_id
    || mcpCurrent.prepared.maker_wallet !== common.makerWallet
    || mcpStrand.prepared.maker_wallet !== common.makerWallet
  ) {
    throw new StrataContractError("MCP maker preparation changed request bindings");
  }
  checks.push({
    name: "mcp_prepare",
    ok: true,
    detail: "fresh-request Strand and Current tokens and native-v0 transactions",
  });

  return {
    schema_version: 1,
    mode: "safe",
    ok: true,
    api_base: common.apiBase,
    mcp_url: common.mcpUrl,
    mcp_version: mcpVersion,
    market: market.label,
    market_id: market.market_id,
    maker_wallet: common.makerWallet,
    base_asset_symbol: sdkCurrent.base_asset.symbol,
    maximum_exposure_atoms: sdkExposure,
    checks,
  };
}

function relevantTotals(
  balances: readonly { readonly asset_id: string; readonly total_atoms: string }[],
  assetIds: readonly string[],
): Map<string, bigint> {
  const wanted = new Set(assetIds);
  return new Map(
    balances
      .filter((balance) => wanted.has(balance.asset_id))
      .map((balance) => [balance.asset_id, BigInt(balance.total_atoms)]),
  );
}

function assertCollateralStable(
  before: Map<string, bigint>,
  after: Map<string, bigint>,
): void {
  for (const [assetId, amount] of before) {
    if ((after.get(assetId) ?? 0n) < amount) {
      throw new StrataContractError(
        `active maker collateral decreased for ${assetId} without an observed fill`,
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkedAtoms(value: string | bigint, name: string): bigint {
  const normalized = typeof value === "bigint" ? value.toString() : value.trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) throw new TypeError(`${name} must be positive base atoms`);
  return BigInt(normalized);
}

async function waitForExecution(
  client: StrataPlatformClient,
  marketId: string,
  executionId: string,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      const status = await client.executions.status(marketId, executionId);
      if (status.status === "confirmed" && status.signature !== null) return status.signature;
    } catch (error) {
      if (!(error instanceof StrataApiError) || !error.retryable) throw error;
    }
    await sleep(500);
  } while (Date.now() < deadline);
  throw new StrataContractError(`execution ${executionId} was not confirmed before timeout`);
}

async function waitForProductConsumption(
  client: StrataPlatformClient,
  marketId: string,
  wallet: string,
  initial: ReadonlyMap<PlatformMakerQuickstartProduct, bigint>,
  seenFills: ReadonlySet<PlatformMakerQuickstartProduct>,
  timeoutMs: number,
  partial: boolean,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  do {
    const status = await client.marketMaking.status(marketId, wallet);
    const complete = [...initial].every(([product, starting]) => {
      const row = productStatus(status, product);
      if (row === undefined) return false;
      const remaining = BigInt(row.remaining_exposure_atoms);
      return seenFills.has(product)
        && remaining < starting
        && (!partial || remaining > 0n);
    });
    if (complete) return;
    await sleep(500);
  } while (Date.now() < deadline);
  throw new StrataContractError(
    `maker exposure/fill attribution was not observed for ${[...initial.keys()].join("+")}`,
  );
}

async function stopIfPresent(
  client: StrataPlatformClient,
  market: string,
  product: PlatformMakerQuickstartProduct,
  signer: PlatformMakerTransactionSigner,
  confirmationTimeoutMs: number,
): Promise<void> {
  await client.marketMaking.stop({ market, product, signer, confirmationTimeoutMs });
}

/**
 * Explicitly funded/broadcasting lifecycle proof. Current uses two separate
 * hosted MCP requests (prepare then submit); Strand uses the published SDK's
 * one-call helper. Both remain live across a hold window before cancellation.
 */
export async function runMakerFundedConformance(
  options: MakerFundedConformanceOptions,
): Promise<MakerFundedConformanceReport> {
  const common = checkedCommon({ ...options, makerWallet: options.signer.publicKey });
  if (options.makerWallet !== undefined && options.makerWallet.trim() !== options.signer.publicKey) {
    throw new TypeError("makerWallet differs from signer.publicKey");
  }
  const holdMs = integer(options.holdMs ?? 5_000, "holdMs", 1_000, 120_000);
  const confirmationTimeoutMs = integer(
    options.confirmationTimeoutMs ?? 60_000,
    "confirmationTimeoutMs",
    5_000,
    120_000,
  );
  const expirySeconds = integer(options.expirySeconds ?? 20, "expirySeconds", 0, 300);
  const client = new StrataPlatformClient({
    apiBase: common.apiBase,
    fetch: common.fetchImpl,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.capabilityCacheMs === undefined
      ? {}
      : { capabilityCacheMs: options.capabilityCacheMs }),
  });
  const market = await client.marketMaking.waitUntilReady(common.market, confirmationTimeoutMs);
  await stopIfPresent(client, market.market_id, "strand", options.signer, confirmationTimeoutMs);
  await stopIfPresent(client, market.market_id, "current", options.signer, confirmationTimeoutMs);

  const products: MakerFundedProductResult[] = [];
  let requestId = 100;
  const currentStart = await mcpPrepare(common.fetchImpl, common.mcpUrl, requestId++, {
    action: "start",
    market: market.market_id,
    product: "current",
    makerWallet: options.signer.publicKey,
    spreadBps: common.spreadBps,
    size: common.size,
    duration: common.duration,
  });
  const signedCurrentStart = await options.signer.signTransaction(
    currentStart.prepared.transaction_base64,
  );
  const currentStarted = await mcpSubmit(
    common.fetchImpl,
    common.mcpUrl,
    requestId++,
    currentStart,
    signedCurrentStart,
    confirmationTimeoutMs,
  );
  if (!productIsLive(currentStarted.maker_status, "current")) {
    throw new StrataContractError("Current was submitted but is not live in chain-derived status");
  }
  const currentInitial = productStatus(currentStarted.maker_status, "current")!;
  const currentPortfolio = await client.account.read(options.signer.publicKey);
  await sleep(holdMs);
  const [currentHeldStatus, currentHeldPortfolio] = await Promise.all([
    client.marketMaking.status(market.market_id, options.signer.publicKey),
    client.account.read(options.signer.publicKey),
  ]);
  if (!productIsLive(currentHeldStatus, "current")) {
    throw new StrataContractError("Current did not remain live across the collateral hold window");
  }
  const currentHeld = productStatus(currentHeldStatus, "current")!;
  const currentFilled = BigInt(currentHeld.remaining_exposure_atoms)
    < BigInt(currentInitial.remaining_exposure_atoms);
  if (!currentFilled) {
    assertCollateralStable(
      relevantTotals(currentPortfolio.balances, [market.base_asset_id, market.quote_asset_id]),
      relevantTotals(currentHeldPortfolio.balances, [market.base_asset_id, market.quote_asset_id]),
    );
  }
  const currentStop = await mcpPrepare(common.fetchImpl, common.mcpUrl, requestId++, {
    action: "stop",
    market: market.market_id,
    product: "current",
    makerWallet: options.signer.publicKey,
  });
  const signedCurrentStop = await options.signer.signTransaction(currentStop.prepared.transaction_base64);
  const currentStopped = await mcpSubmit(
    common.fetchImpl,
    common.mcpUrl,
    requestId++,
    currentStop,
    signedCurrentStop,
    confirmationTimeoutMs,
  );
  if (productStatus(currentStopped.maker_status, "current") !== undefined) {
    throw new StrataContractError("Current cancellation was not reflected in chain-derived status");
  }
  products.push({
    product: "current",
    transport: "mcp",
    start_control_id: currentStart.prepared.maker_control_id,
    start_signature: currentStarted.receipt.signature,
    stop_control_id: currentStop.prepared.maker_control_id,
    stop_signature: currentStopped.receipt.signature,
    collateral_observation: currentFilled ? "fill_observed" : "stable",
  });

  const strandStarted = await client.marketMaking.start({
    market: market.market_id,
    product: "strand",
    spreadBps: common.spreadBps,
    size: common.size,
    duration: common.duration,
    signer: options.signer,
    confirmationTimeoutMs,
  });
  const strandInitial = productStatus(strandStarted.maker_status, "strand");
  if (!strandInitial || !productIsLive(strandStarted.maker_status, "strand")) {
    throw new StrataContractError("Strand was submitted but is not live in chain-derived status");
  }
  const strandPortfolio = await client.account.read(options.signer.publicKey);
  await sleep(holdMs);
  const [strandHeldStatus, strandHeldPortfolio] = await Promise.all([
    client.marketMaking.status(market.market_id, options.signer.publicKey),
    client.account.read(options.signer.publicKey),
  ]);
  if (!productIsLive(strandHeldStatus, "strand")) {
    throw new StrataContractError("Strand did not remain live across the collateral hold window");
  }
  const strandHeld = productStatus(strandHeldStatus, "strand")!;
  const strandFilled = BigInt(strandHeld.remaining_exposure_atoms)
    < BigInt(strandInitial.remaining_exposure_atoms);
  if (!strandFilled) {
    assertCollateralStable(
      relevantTotals(strandPortfolio.balances, [market.base_asset_id, market.quote_asset_id]),
      relevantTotals(strandHeldPortfolio.balances, [market.base_asset_id, market.quote_asset_id]),
    );
  }
  const strandStopped = await client.marketMaking.stop({
    market: market.market_id,
    product: "strand",
    signer: options.signer,
    confirmationTimeoutMs,
  });
  if (productStatus(strandStopped.maker_status, "strand") !== undefined) {
    throw new StrataContractError("Strand cancellation was not reflected in chain-derived status");
  }
  products.push({
    product: "strand",
    transport: "typescript_sdk",
    start_control_id: strandStarted.prepared.maker_control_id,
    start_signature: strandStarted.receipt.signature,
    stop_control_id: strandStopped.prepared?.maker_control_id
      ?? (() => { throw new StrataContractError("Strand stop unexpectedly required no transaction"); })(),
    stop_signature: strandStopped.receipt?.signature
      ?? (() => { throw new StrataContractError("Strand stop unexpectedly has no receipt"); })(),
    collateral_observation: strandFilled ? "fill_observed" : "stable",
  });

  let observedExpired = false;
  if (expirySeconds > 0) {
    const expiring = await client.marketMaking.start({
      market: market.market_id,
      product: "current",
      spreadBps: common.spreadBps,
      size: common.size,
      duration: expirySeconds,
      signer: options.signer,
      confirmationTimeoutMs,
    });
    const expiryDeadline = Date.now() + Math.max(confirmationTimeoutMs, expirySeconds * 2_000);
    while (Date.now() < expiryDeadline) {
      const status = await client.marketMaking.status(market.market_id, options.signer.publicKey);
      const current = productStatus(status, "current");
      if (current === undefined || current.expired || !current.enabled || BigInt(current.remaining_exposure_atoms) === 0n) {
        observedExpired = true;
        break;
      }
      await sleep(500);
    }
    await stopIfPresent(client, market.market_id, "current", options.signer, confirmationTimeoutMs);
    if (!observedExpired) {
      throw new StrataContractError(
        `expiring Current ${expiring.prepared.maker_control_id} remained fillable past its deadline`,
      );
    }
  }

  return {
    schema_version: 1,
    mode: "funded",
    ok: true,
    api_base: common.apiBase,
    mcp_url: common.mcpUrl,
    market: market.label,
    market_id: market.market_id,
    maker_wallet: options.signer.publicKey,
    products,
    expiry: {
      tested: expirySeconds > 0,
      ...(expirySeconds > 0 ? { product: "current" as const, observed_expired: observedExpired } : {}),
    },
  };
}

/**
 * Explicit end-to-end execution matrix. It observes only the maker owner's
 * permitted product attribution; internal execution details remain private.
 *
 * - isolated Current and Strand trades must partially consume that product;
 * - the mixed trade is larger than both controls combined, so observing both
 *   maker products plus a confirmed full execution proves the external Sonar
 *   tail was required without exposing which venue supplied it.
 */
export async function runMakerWaterfallConformance(
  options: MakerWaterfallConformanceOptions,
): Promise<MakerWaterfallConformanceReport> {
  const common = checkedCommon({ ...options, makerWallet: options.signer.publicKey });
  if (options.takerOwnerWallet.trim() === options.signer.publicKey) {
    throw new TypeError("the taker owner must differ from the maker wallet");
  }
  const confirmationTimeoutMs = integer(
    options.confirmationTimeoutMs ?? 60_000,
    "confirmationTimeoutMs",
    5_000,
    120_000,
  );
  const partialFillBaseAtoms = checkedAtoms(
    options.partialFillBaseAtoms ?? 1_000_000n,
    "partialFillBaseAtoms",
  );
  const fallbackBaseAtoms = checkedAtoms(
    options.fallbackBaseAtoms ?? partialFillBaseAtoms,
    "fallbackBaseAtoms",
  );
  const side = options.takerSide ?? "buy";
  const maximumToleranceBps = integer(
    options.maximumToleranceBps ?? 100,
    "maximumToleranceBps",
    0,
    1_000,
  );
  const platform = new StrataPlatformClient({
    apiBase: common.apiBase,
    fetch: common.fetchImpl,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.capabilityCacheMs === undefined
      ? {}
      : { capabilityCacheMs: options.capabilityCacheMs }),
  });
  const sonar = new StrataClient({
    apiBase: common.apiBase,
    fetch: common.fetchImpl,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  const market = await platform.marketMaking.waitUntilReady(common.market, confirmationTimeoutMs);
  await stopIfPresent(platform, market.market_id, "strand", options.signer, confirmationTimeoutMs);
  await stopIfPresent(platform, market.market_id, "current", options.signer, confirmationTimeoutMs);

  const seenFills = new Set<PlatformMakerQuickstartProduct>();
  const streamErrors: Error[] = [];
  const stream = await platform.marketMaking.subscribe(
    market.market_id,
    options.signer.publicKey,
    {
      onFill: (_marketId, fill) => {
        if (fill.product === "strand" || fill.product === "current") seenFills.add(fill.product);
      },
      onError: (error) => streamErrors.push(error),
    },
    { reconnect: true },
  );
  await stream.ready;
  const cases: MakerWaterfallCaseResult[] = [];

  const execute = async (baseAtoms: bigint): Promise<{ id: string; signature: string }> => {
    if (streamErrors.length > 0) throw streamErrors[0];
    const quote = await sonar.quote({
      market: market.market_id,
      side,
      ...(side === "buy" ? { amountOutAtoms: baseAtoms } : { amountInAtoms: baseAtoms }),
      maximumToleranceBps,
    });
    const receipt = await sonar.executeQuote({
      quote,
      ownerWallet: options.takerOwnerWallet,
      signer: options.takerSigner,
    });
    const signature = await waitForExecution(
      platform,
      market.market_id,
      receipt.execution_id,
      confirmationTimeoutMs,
    );
    return { id: receipt.execution_id, signature };
  };

  try {
    for (const product of ["current", "strand"] as const) {
      seenFills.clear();
      const started = await platform.marketMaking.start({
        market: market.market_id,
        product,
        spreadBps: common.spreadBps,
        size: common.size,
        duration: common.duration,
        levels: 1,
        signer: options.signer,
        confirmationTimeoutMs,
      });
      const row = productStatus(started.maker_status, product);
      if (row === undefined) throw new StrataContractError(`${product} is absent after start`);
      const initial = BigInt(row.remaining_exposure_atoms);
      if (partialFillBaseAtoms >= initial) {
        throw new TypeError(
          `partialFillBaseAtoms must be smaller than ${product} exposure ${initial}`,
        );
      }
      const execution = await execute(partialFillBaseAtoms);
      await waitForProductConsumption(
        platform,
        market.market_id,
        options.signer.publicKey,
        new Map([[product, initial]]),
        seenFills,
        confirmationTimeoutMs,
        true,
      );
      cases.push({
        case: product === "current" ? "current_only" : "strand_only",
        execution_id: execution.id,
        execution_signature: execution.signature,
        confirmed_products: [product],
        requested_base_atoms: partialFillBaseAtoms.toString(),
        fallback_required: false,
      });
      await stopIfPresent(platform, market.market_id, product, options.signer, confirmationTimeoutMs);
    }

    seenFills.clear();
    const strand = await platform.marketMaking.start({
      market: market.market_id,
      product: "strand",
      spreadBps: common.spreadBps,
      size: common.size,
      duration: common.duration,
      levels: 1,
      signer: options.signer,
      confirmationTimeoutMs,
    });
    const current = await platform.marketMaking.start({
      market: market.market_id,
      product: "current",
      spreadBps: Math.min(common.spreadBps + 1, 5_000),
      size: common.size,
      duration: common.duration,
      levels: 1,
      signer: options.signer,
      confirmationTimeoutMs,
    });
    const strandRow = productStatus(strand.maker_status, "strand");
    const currentRow = productStatus(current.maker_status, "current");
    if (strandRow === undefined || currentRow === undefined) {
      throw new StrataContractError("mixed maker controls are not both live");
    }
    const strandExposure = BigInt(strandRow.remaining_exposure_atoms);
    const currentExposure = BigInt(currentRow.remaining_exposure_atoms);
    const mixedAtoms = strandExposure + currentExposure + fallbackBaseAtoms;
    const execution = await execute(mixedAtoms);
    await waitForProductConsumption(
      platform,
      market.market_id,
      options.signer.publicKey,
      new Map([
        ["strand" as const, strandExposure],
        ["current" as const, currentExposure],
      ]),
      seenFills,
      confirmationTimeoutMs,
      false,
    );
    cases.push({
      case: "strand_current_sonar",
      execution_id: execution.id,
      execution_signature: execution.signature,
      confirmed_products: ["strand", "current"],
      requested_base_atoms: mixedAtoms.toString(),
      fallback_required: true,
    });
  } finally {
    stream.close();
    await stopIfPresent(platform, market.market_id, "strand", options.signer, confirmationTimeoutMs);
    await stopIfPresent(platform, market.market_id, "current", options.signer, confirmationTimeoutMs);
  }

  if (streamErrors.length > 0) throw streamErrors[0];
  return {
    schema_version: 1,
    mode: "waterfall",
    ok: true,
    api_base: common.apiBase,
    market: market.label,
    market_id: market.market_id,
    maker_wallet: options.signer.publicKey,
    taker_owner_wallet: options.takerOwnerWallet,
    side,
    cases,
  };
}
