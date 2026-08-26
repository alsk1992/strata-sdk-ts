import {
  base58Encode,
  base58Decode,
  canonicalPublicKey,
  decodeBase64,
  normalizeIdempotencyKey,
  StrataApiError,
  StrataContractError,
} from "./client.js";
import {
  platformAccountSnapshotResponse,
  platformMakerReputationResponse,
  platformMakerControlPrepareResponse,
  platformMakerControlSubmitResponse,
  platformMakerIntentPrepareResponse,
  platformMakerIntentSubmitResponse,
  platformMakerStatusResponse,
  platformActionGraphResponse,
  platformAssetsResponse,
  platformSwapQuoteResponse,
  platformBestBidAskResponse,
  platformBookSnapshotResponse,
  platformBugSubmitResponse,
  platformBugsResponse,
  platformCandlesResponse,
  platformDiscoveryResponse,
  platformFeeScheduleResponse,
  platformExecutionStatusResponse,
  platformMarketStatusResponse,
  platformMarkResponse,
  platformServiceStatusResponse,
  platformMarketsResponse,
  platformOrderChallengeResponse,
  platformOrderPrepareResponse,
  platformOrderStatusResponse,
  platformOrderSubmitResponse,
  platformPortfolioHistoryResponse,
  platformPortfolioResponse,
  platformReferralsResponse,
  platformReferralClaimResponse,
  platformReferralLinkResponse,
  platformRewardsResponse,
  platformTradesResponse,
  platformTwapChallengeResponse,
  platformTwapPrepareResponse,
  platformTwapSubmitResponse,
  platformTwapsResponse,
  platformVaultStatusResponse,
  platformVaultPausePrepareResponse,
  platformVaultDelegatePrepareResponse,
  platformVaultPolicyPrepareResponse,
  platformVaultDepositPrepareResponse,
  platformVaultWithdrawPrepareResponse,
  platformVaultSubmitResponse,
  platformVaultSetupPrepareResponse,
} from "./platform-validation.js";
import {
  accountHttpAuthMessage,
  bytesToHex,
  subscribePlatformAccount,
  type PlatformAccountHandlers,
  type PlatformAccountSubscription,
  type PlatformAccountSubscriptionOptions,
} from "./platform-account-stream.js";
import {
  subscribePlatformExecutions,
  type PlatformExecutionHandlers,
  type PlatformExecutionSubscription,
  type PlatformExecutionSubscriptionOptions,
} from "./platform-execution-stream.js";
import {
  subscribePlatformTwaps,
  type PlatformTwapHandlers,
  type PlatformTwapSubscription,
  type PlatformTwapSubscriptionOptions,
} from "./platform-twap-stream.js";
import {
  subscribePlatformMaker,
  type PlatformMakerIdentity,
  type PlatformMakerHandlers,
  type PlatformMakerSubscription,
  type PlatformMakerSubscriptionOptions,
} from "./platform-maker-stream.js";
import {
  subscribePlatformMarketData,
  type PlatformMarketDataHandlers,
  type PlatformMarketDataSubscription,
  type PlatformMarketDataSubscriptionOptions,
} from "./platform-stream.js";
import {
  connectPlatformOrderCommands,
  type PlatformOrderCommandConnection,
  type PlatformOrderCommandHandlers,
  type PlatformOrderCommandOptions,
} from "./platform-order-stream.js";
import {
  verifyIntentTransaction,
  verifyMakerTransaction,
  verifyOrderTransaction,
  verifySignedTransactionMessage,
  verifyTwapTransaction,
} from "./transaction-verifier.js";
import {
  PLATFORM_SESSION_DEFAULT_MAXIMUM_TOLERANCE_BPS,
  PLATFORM_SESSION_DEFAULT_MINIMUM_INTERVAL_SECONDS,
  PLATFORM_SESSION_MAX_SPENDING_LIMITS,
} from "./platform.js";
import type {
  PageRequest,
  PlatformAccountSigner,
  PlatformAccountSnapshot,
  PlatformAccountSnapshotResponse,
  PlatformMakerReputationResponse,
  PlatformMakerControlAction,
  PlatformMakerControlPrepareResponse,
  PlatformMakerControlProduct,
  PlatformMakerControlSubmitInput,
  PlatformMakerControlSubmitResponse,
  PlatformMakerCurrentPrepareInput,
  PlatformMakerIntentExecuteInput,
  PlatformMakerIntentPrepareInput,
  PlatformMakerIntentPrepareResponse,
  PlatformMakerIntentSubmitInput,
  PlatformMakerIntentSubmitResponse,
  PlatformMakerQuickstartPrepareInput,
  PlatformMakerQuickstartPrepared,
  PlatformMakerQuickstartProduct,
  PlatformMakerQuickstartResult,
  PlatformMakerStartInput,
  PlatformMakerStatusResponse,
  PlatformMakerStopInput,
  PlatformMakerStopPrepareInput,
  PlatformMakerStopPrepared,
  PlatformMakerStopResult,
  PlatformMakerSubmitPreparedInput,
  PlatformMakerStrandPrepareInput,
  PlatformMakerTransactionSigner,
  PlatformAsset,
  PlatformActionGraphResponse,
  PlatformAssetsResponse,
  PlatformSwapQuoteInput,
  PlatformSwapQuoteResponse,
  PlatformBestBidAskResponse,
  PlatformBookSnapshotResponse,
  PlatformBugSubmitInput,
  PlatformBugSubmitResponse,
  PlatformBugsResponse,
  PlatformCandlesResponse,
  PlatformDiscoveryResponse,
  PlatformFeeScheduleResponse,
  PlatformExecutionStatusResponse,
  PlatformMarketStatusResponse,
  PlatformMarket,
  PlatformMarkResponse,
  PlatformServiceStatusResponse,
  PlatformMarketsResponse,
  PlatformOrderChallengeInput,
  PlatformOrderVerificationContext,
  PlatformOrderChallengeResponse,
  PlatformOrderExecuteInput,
  PlatformOrderExecuteOperation,
  PlatformOrderPrepareInput,
  PlatformOrderPrepareResponse,
  PlatformOrderStatusInput,
  PlatformOrderStatusResponse,
  PlatformOrderSubmitInput,
  PlatformOrderSubmitResponse,
  PlatformPortfolioHistoryRange,
  PlatformPortfolioHistoryResponse,
  PlatformPortfolioResponse,
  PlatformReferralsResponse,
  PlatformReferralClaimInput,
  PlatformReferralClaimResponse,
  PlatformReferralLinkInput,
  PlatformReferralLinkResponse,
  PlatformRewardsResponse,
  PlatformTradesResponse,
  PlatformTwapChallengeInput,
  PlatformTwapVerificationContext,
  PlatformTwapChallengeResponse,
  PlatformTwapExecuteInput,
  PlatformTwapExecuteOperation,
  PlatformTwapPrepareInput,
  PlatformTwapPrepareResponse,
  PlatformTwapSubmitInput,
  PlatformTwapSubmitResponse,
  PlatformTwapsResponse,
  PlatformVaultStatusInput,
  PlatformVaultStatusResponse,
  PlatformVaultPausePrepareInput,
  PlatformVaultPausePrepareResponse,
  PlatformVaultDelegatePrepareInput,
  PlatformVaultDelegatePrepareResponse,
  PlatformVaultPolicyPrepareInput,
  PlatformVaultPolicyPrepareResponse,
  PlatformVaultDepositPrepareInput,
  PlatformVaultDepositPrepareResponse,
  PlatformVaultWithdrawPrepareInput,
  PlatformVaultSubmitInput,
  PlatformVaultSubmitResponse,
  PlatformVaultWithdrawPrepareResponse,
  PlatformVaultSetupPrepareInput,
  PlatformVaultSetupPrepareResponse,
} from "./platform.js";
import { DEFAULT_API_BASE, type StrataSessionSigner } from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CAPABILITY_CACHE_MS = 5_000;
const MAX_PAGE_SIZE = 200;

export interface StrataPlatformClientOptions {
  readonly apiBase?: string;
  readonly timeoutMs?: number;
  readonly capabilityCacheMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export interface PlatformDiscoveryModule {
  /** Fetch the operations currently available to this client. */
  read(): Promise<PlatformDiscoveryResponse>;
  /** Fetch the complete entity, operation, and workflow graph with live gates. */
  graph(): Promise<PlatformActionGraphResponse>;
  /** Read product-level readiness and the number of live mapped operations. */
  status(): Promise<PlatformServiceStatusResponse>;
}

export interface PlatformAssetsModule {
  list(request?: PageRequest): Promise<PlatformAssetsResponse>;
  /** Resolve an opaque asset ID or an unambiguous symbol. */
  resolve(asset: string): Promise<PlatformAsset>;
}

export interface PlatformMarketsModule {
  list(request?: PageRequest): Promise<PlatformMarketsResponse>;
  /** Resolve an opaque market ID or a case-insensitive label such as SOL/USDC. */
  resolve(market: string): Promise<PlatformMarket>;
}

export interface PlatformQuotesModule {
  /** Request short-lived exact-input customer economics between catalog assets. */
  swap(request: PlatformSwapQuoteInput): Promise<PlatformSwapQuoteResponse>;
}

export interface PlatformBookRequest {
  readonly depth?: number;
}

export interface PlatformTradesRequest {
  readonly limit?: number;
}

export interface PlatformCandlesRequest {
  readonly fromMs: number;
  readonly toMs: number;
  readonly resolutionSeconds?: number;
}

export interface PlatformMarketDataModule {
  candles(marketId: string, request: PlatformCandlesRequest): Promise<PlatformCandlesResponse>;
  mark(marketId: string): Promise<PlatformMarkResponse>;
}

export interface PlatformExecutionsModule {
  /** Recover prepared state or a restart-durable confirmed receipt. */
  status(marketId: string, executionId: string): Promise<PlatformExecutionStatusResponse>;
  /** Stream sequenced prepared/confirmed/expired state for watched executions in one market. */
  subscribe(
    marketId: string,
    executionIds: readonly string[],
    handlers: PlatformExecutionHandlers,
    options?: PlatformExecutionSubscriptionOptions,
  ): Promise<PlatformExecutionSubscription>;
}

export interface PlatformAlgosModule {
  challenge(
    marketId: string,
    request: PlatformTwapChallengeInput,
  ): Promise<PlatformTwapChallengeResponse>;
  prepare(
    marketId: string,
    request: PlatformTwapPrepareInput,
  ): Promise<PlatformTwapPrepareResponse>;
  submit(
    marketId: string,
    request: PlatformTwapSubmitInput,
  ): Promise<PlatformTwapSubmitResponse>;
  /** Complete an externally authorized place or cancel flow. */
  execute(marketId: string, request: PlatformTwapExecuteInput): Promise<PlatformTwapSubmitResponse>;
  /** Read sanitized public progress for wallet-owned and vault-owned TWAPs. */
  twaps(marketId: string, walletAddress: string): Promise<PlatformTwapsResponse>;
  /** Stream sequenced TWAP progress for a wallet across discoverable markets. */
  subscribe(
    walletAddress: string,
    handlers: PlatformTwapHandlers,
    options?: PlatformTwapSubscribeOptions,
  ): Promise<PlatformTwapSubscription>;
}

export interface PlatformTwapSubscribeOptions extends PlatformTwapSubscriptionOptions {
  /** Omit to stream every currently discoverable Strata market. */
  readonly marketIds?: readonly string[];
}

export interface PlatformBooksModule {
  snapshot(marketId: string, request?: PlatformBookRequest): Promise<PlatformBookSnapshotResponse>;
  bestBidAsk(marketId: string): Promise<PlatformBestBidAskResponse>;
  fees(marketId: string): Promise<PlatformFeeScheduleResponse>;
  status(marketId: string): Promise<PlatformMarketStatusResponse>;
  trades(marketId: string, request?: PlatformTradesRequest): Promise<PlatformTradesResponse>;
  subscribe(
    marketId: string,
    handlers: PlatformMarketDataHandlers,
    options?: PlatformMarketDataSubscriptionOptions,
  ): Promise<PlatformMarketDataSubscription>;
}

export interface PlatformAccountRequest {
  /** Maximum recent fills returned for each market. */
  readonly fillLimit?: number;
  /** Omit to read every currently discoverable Strata market. */
  readonly marketIds?: readonly string[];
}

export interface PlatformAccountMarketRequest {
  readonly fillLimit?: number;
}

export interface PlatformAccountSubscribeOptions extends PlatformAccountSubscriptionOptions {
  /** Omit to subscribe to every currently discoverable Strata market. */
  readonly marketIds?: readonly string[];
}

export interface PlatformAccountModule {
  /** Read one market after proving control of the wallet with an external signer. */
  market(
    marketId: string,
    signer: PlatformAccountSigner,
    request?: PlatformAccountMarketRequest,
  ): Promise<PlatformAccountSnapshotResponse>;
  /** Read the wallet's orders and fills across discoverable markets. */
  snapshot(
    signer: PlatformAccountSigner,
    request?: PlatformAccountRequest,
  ): Promise<PlatformAccountSnapshot>;
  /**
   * The whole account in one public read, by wallet address: balances,
   * positions, open orders, and recent fills across every live market. No
   * signature, no session key, no market selection.
   */
  read(walletAddress: string): Promise<PlatformPortfolioResponse>;
  /** Alias of `read`. */
  portfolio(walletAddress: string): Promise<PlatformPortfolioResponse>;
  /** Read genuine stored account-equity history without synthesizing earlier values. */
  portfolioHistory(
    walletAddress: string,
    range?: PlatformPortfolioHistoryRange,
  ): Promise<PlatformPortfolioHistoryResponse>;
  /** Stream signed private order and fill state across discoverable markets. */
  subscribe(
    signer: PlatformAccountSigner,
    handlers: PlatformAccountHandlers,
    options?: PlatformAccountSubscribeOptions,
  ): Promise<PlatformAccountSubscription>;
}

export interface PlatformMakerReputationAuthorizedInput {
  readonly marketId: string;
  readonly walletAddress: string;
  readonly authorizationTimeMs: number;
  readonly authorizationSignature: string;
}

export type PlatformMakerStatusAuthorizedInput = PlatformMakerReputationAuthorizedInput;

export interface PlatformMakerStrandModule {
  /** Build one exact unsigned maker transaction for external verification and signing. */
  prepare(
    marketId: string,
    request: PlatformMakerStrandPrepareInput,
  ): Promise<PlatformMakerControlPrepareResponse>;
  /** Submit the same maker-signed transaction idempotently. */
  submit(
    marketId: string,
    request: PlatformMakerControlSubmitInput,
  ): Promise<PlatformMakerControlSubmitResponse>;
}

export interface PlatformMakerCurrentModule {
  /** Current upsert prices its bands from the market's live Strata mark. */
  prepare(
    marketId: string,
    request: PlatformMakerCurrentPrepareInput,
  ): Promise<PlatformMakerControlPrepareResponse>;
  submit(
    marketId: string,
    request: PlatformMakerControlSubmitInput,
  ): Promise<PlatformMakerControlSubmitResponse>;
}

export interface PlatformMakerIntentModule {
  /** Prepare one sponsored Vault-session update of an existing IntentBook seat. */
  prepare(
    marketId: string,
    request: PlatformMakerIntentPrepareInput,
  ): Promise<PlatformMakerIntentPrepareResponse>;
  /** Submit the exact session-signed packet; exact retries return the same signature. */
  submit(
    marketId: string,
    request: PlatformMakerIntentSubmitInput,
  ): Promise<PlatformMakerIntentSubmitResponse>;
  /** Prepare, verify, session-sign, and submit in one call. */
  execute(
    marketId: string,
    request: PlatformMakerIntentExecuteInput,
  ): Promise<PlatformMakerIntentSubmitResponse>;
}

export interface PlatformMarketMakingModule {
  readonly intent: PlatformMakerIntentModule;
  readonly strand: PlatformMakerStrandModule;
  readonly current: PlatformMakerCurrentModule;
  /** Resolve human inputs and prepare one exact, externally signed maker start. */
  prepareStart(request: PlatformMakerQuickstartPrepareInput): Promise<PlatformMakerQuickstartPrepared>;
  /** Prepare, verify, sign, submit, and wait until the maker is visible on chain. */
  start(request: PlatformMakerStartInput): Promise<PlatformMakerQuickstartResult>;
  /** Prepare a product cancellation using a label or opaque market ID. */
  prepareStop(request: PlatformMakerStopPrepareInput): Promise<PlatformMakerStopPrepared>;
  /** Submit an externally signed quickstart preparation and wait for chain-derived state. */
  submitPrepared(
    request: PlatformMakerSubmitPreparedInput,
  ): Promise<PlatformMakerQuickstartResult | PlatformMakerStopResult>;
  /** Cancel and wait until the product is absent from chain-derived maker state. */
  stop(request: PlatformMakerStopInput): Promise<PlatformMakerStopResult>;
  /** Wait through a brief restart until a market is active with a fresh Strata mark. */
  waitUntilReady(market: string, timeoutMs?: number): Promise<PlatformMarket>;
  /**
   * A maker's products, exposure, health, and kill state in one market — public
   * by wallet address, no signature. A signer is accepted for compatibility (its
   * public key names the maker).
   */
  status(marketId: string, maker: PlatformMakerIdentity): Promise<PlatformMakerStatusResponse>;
  /** Stream the maker's fills and product/exposure changes for one market (public by wallet). */
  subscribe(
    marketId: string,
    maker: PlatformMakerIdentity,
    handlers: PlatformMakerHandlers,
    options?: PlatformMakerSubscriptionOptions,
  ): Promise<PlatformMakerSubscription>;
  /** A maker's reliability record in one market — public by wallet address. */
  reputation(
    marketId: string,
    maker: PlatformMakerIdentity,
  ): Promise<PlatformMakerReputationResponse>;
  /** @deprecated Reads are public; kept for older signer-less adapters. */
  statusAuthorizationPayload(
    marketId: string,
    walletAddress: string,
    authorizationTimeMs: number,
  ): Uint8Array;
  /** @deprecated Reads are public; a signed request is still accepted. */
  statusAuthorized(
    request: PlatformMakerStatusAuthorizedInput,
  ): Promise<PlatformMakerStatusResponse>;
  /** @deprecated Reads are public; kept for older signer-less adapters. */
  reputationAuthorizationPayload(
    marketId: string,
    walletAddress: string,
    authorizationTimeMs: number,
  ): Uint8Array;
  /** @deprecated Reads are public; a signed request is still accepted. */
  reputationAuthorized(
    request: PlatformMakerReputationAuthorizedInput,
  ): Promise<PlatformMakerReputationResponse>;
}

export interface PlatformVaultModule {
  /** Read sealed owner state and, optionally, one external session. */
  status(request: PlatformVaultStatusInput): Promise<PlatformVaultStatusResponse>;
  /** Prepare an owner-verified pause or resume transaction for external signing. */
  preparePause(request: PlatformVaultPausePrepareInput): Promise<PlatformVaultPausePrepareResponse>;
  /** Prepare protected onboarding or session replacement for external owner signing. */
  prepareSetup(request: PlatformVaultSetupPrepareInput): Promise<PlatformVaultSetupPrepareResponse>;
  /** Prepare destructive external-session revocation for external owner signing. */
  prepareDelegate(
    request: PlatformVaultDelegatePrepareInput,
  ): Promise<PlatformVaultDelegatePrepareResponse>;
  /** Prepare a blocked or restricted withdrawal-access policy for owner signing. */
  preparePolicy(request: PlatformVaultPolicyPrepareInput): Promise<PlatformVaultPolicyPrepareResponse>;
  /** Prepare an exact owner-funded deposit for external owner signing. */
  prepareDeposit(
    request: PlatformVaultDepositPrepareInput,
  ): Promise<PlatformVaultDepositPrepareResponse>;
  /** Prepare an exact destination-bound withdrawal for external owner signing. */
  prepareWithdrawal(
    request: PlatformVaultWithdrawPrepareInput,
  ): Promise<PlatformVaultWithdrawPrepareResponse>;
  /**
   * Submit an owner-signed prepared Vault transaction. Strata verifies it is
   * exactly the prepared transaction, pays the fee when the preparation was
   * sponsored, and broadcasts it. Idempotent per `idempotencyKey`.
   */
  submit(request: PlatformVaultSubmitInput): Promise<PlatformVaultSubmitResponse>;
  /** Durable outcome of a submission (`submitted` → `confirmed` | `failed`). */
  submission(preparationId: string): Promise<PlatformVaultSubmitResponse>;
}

export interface PlatformRewardsRequest {
  readonly walletAddress?: string;
  readonly limit?: number;
}

export interface PlatformRewardsModule {
  read(request?: PlatformRewardsRequest): Promise<PlatformRewardsResponse>;
}

export interface PlatformReferralsModule {
  /** Exact bytes the referred wallet signs outside Strata. */
  linkAuthorizationPayload(referralCode: string): Uint8Array;
  /** Exact bytes the claiming wallet signs outside Strata. */
  claimAuthorizationPayload(payoutWalletAddress: string): Uint8Array;
  read(walletAddress: string): Promise<PlatformReferralsResponse>;
  link(request: PlatformReferralLinkInput): Promise<PlatformReferralLinkResponse>;
  claim(request: PlatformReferralClaimInput): Promise<PlatformReferralClaimResponse>;
}

export interface PlatformBugsModule {
  /** Exact bytes the owner wallet signs outside Strata. */
  authorizationPayload(message: string): Uint8Array;
  read(walletAddress: string): Promise<PlatformBugsResponse>;
  submit(request: PlatformBugSubmitInput): Promise<PlatformBugSubmitResponse>;
}

export interface PlatformOrdersModule {
  challenge(
    marketId: string,
    request: PlatformOrderChallengeInput,
  ): Promise<PlatformOrderChallengeResponse>;
  prepare(
    marketId: string,
    request: PlatformOrderPrepareInput,
  ): Promise<PlatformOrderPrepareResponse>;
  submit(
    marketId: string,
    request: PlatformOrderSubmitInput,
  ): Promise<PlatformOrderSubmitResponse>;
  status(
    marketId: string,
    request: PlatformOrderStatusInput,
  ): Promise<PlatformOrderStatusResponse>;
  /** Complete the challenge → external signatures → idempotent submit sequence. */
  execute(
    marketId: string,
    request: PlatformOrderExecuteInput,
  ): Promise<PlatformOrderSubmitResponse>;
  /** Open the authenticated low-latency order command channel for one market. */
  connect(
    marketId: string,
    ownerWallet: string,
    signer: StrataSessionSigner,
    handlers?: PlatformOrderCommandHandlers,
    options?: PlatformOrderCommandOptions,
  ): Promise<PlatformOrderCommandConnection>;
}

/**
 * Modular SDK 2.0 client. Only currently supported public modules are exposed.
 */
export class StrataPlatformClient {
  readonly apiBase: string;
  readonly timeoutMs: number;
  readonly capabilityCacheMs: number;
  readonly fetch: typeof globalThis.fetch;
  readonly discovery: PlatformDiscoveryModule;
  readonly assets: PlatformAssetsModule;
  readonly markets: PlatformMarketsModule;
  readonly quotes: PlatformQuotesModule;
  readonly books: PlatformBooksModule;
  readonly marketData: PlatformMarketDataModule;
  readonly executions: PlatformExecutionsModule;
  readonly algos: PlatformAlgosModule;
  readonly account: PlatformAccountModule;
  readonly marketMaking: PlatformMarketMakingModule;
  readonly vault: PlatformVaultModule;
  readonly orders: PlatformOrdersModule;
  readonly rewards: PlatformRewardsModule;
  readonly referrals: PlatformReferralsModule;
  readonly bugs: PlatformBugsModule;
  private capabilityCache?: {
    readonly value: PlatformDiscoveryResponse;
    readonly expiresAtMs: number;
  };
  private capabilityRequest: Promise<PlatformDiscoveryResponse> | undefined;

  constructor(options: StrataPlatformClientOptions = {}) {
    const candidate = options.apiBase?.trim() || DEFAULT_API_BASE;
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new TypeError("apiBase must use http or https");
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.search = "";
    parsed.hash = "";
    this.apiBase = parsed.toString().replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new TypeError("timeoutMs must be a positive safe integer");
    }
    this.capabilityCacheMs = options.capabilityCacheMs ?? DEFAULT_CAPABILITY_CACHE_MS;
    if (!Number.isSafeInteger(this.capabilityCacheMs) || this.capabilityCacheMs < 0) {
      throw new TypeError("capabilityCacheMs must be a non-negative safe integer");
    }
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new TypeError("a Fetch-compatible implementation is required");
    }
    this.fetch = fetchImpl;
    this.discovery = {
      read: () => this.readDiscovery(true),
      graph: () => this.readActionGraph(),
      status: () => this.readPlatformStatus(),
    };
    this.assets = {
      list: (request) => this.listAssets(request),
      resolve: (asset) => this.resolveAsset(asset),
    };
    this.markets = {
      list: (request) => this.listMarkets(request),
      resolve: (market) => this.resolveMarket(market),
    };
    this.quotes = { swap: (request) => this.swapQuote(request) };
    this.books = {
      snapshot: (marketId, request) => this.bookSnapshot(marketId, request),
      bestBidAsk: (marketId) => this.bestBidAsk(marketId),
      fees: (marketId) => this.feeSchedule(marketId),
      status: (marketId) => this.marketStatus(marketId),
      trades: (marketId, request) => this.trades(marketId, request),
      subscribe: (marketId, handlers, streamOptions) =>
        this.subscribeBook(marketId, handlers, streamOptions),
    };
    this.marketData = {
      candles: (marketId, request) => this.candles(marketId, request),
      mark: (marketId) => this.mark(marketId),
    };
    this.executions = {
      status: (marketId, executionId) => this.executionStatus(marketId, executionId),
      subscribe: (marketId, executionIds, handlers, streamOptions) =>
        this.subscribeExecutions(marketId, executionIds, handlers, streamOptions),
    };
    this.algos = {
      challenge: (marketId, request) => this.twapChallenge(marketId, request),
      prepare: (marketId, request) => this.twapPrepare(marketId, request),
      submit: (marketId, request) => this.twapSubmit(marketId, request),
      execute: (marketId, request) => this.executeTwap(marketId, request),
      twaps: (marketId, walletAddress) => this.twaps(marketId, walletAddress),
      subscribe: (walletAddress, handlers, streamOptions) =>
        this.subscribeTwaps(walletAddress, handlers, streamOptions),
    };
    this.account = {
      market: (marketId, signer, request) => this.accountMarket(marketId, signer, request),
      snapshot: (signer, request) => this.accountSnapshot(signer, request),
      read: (walletAddress) => this.portfolio(walletAddress),
      portfolio: (walletAddress) => this.portfolio(walletAddress),
      portfolioHistory: (walletAddress, range) => this.portfolioHistory(walletAddress, range),
      subscribe: (signer, handlers, streamOptions) =>
        this.subscribeAccount(signer, handlers, streamOptions),
    };
    this.marketMaking = {
      intent: {
        prepare: (marketId, request) => this.makerIntentPrepare(marketId, request),
        submit: (marketId, request) => this.makerIntentSubmit(marketId, request),
        execute: (marketId, request) => this.makerIntentExecute(marketId, request),
      },
      strand: {
        prepare: (marketId, request) => this.makerStrandPrepare(marketId, request),
        submit: (marketId, request) => this.makerControlSubmit(
          marketId,
          "strands",
          "strand",
          request,
        ),
      },
      current: {
        prepare: (marketId, request) => this.makerCurrentPrepare(marketId, request),
        submit: (marketId, request) => this.makerControlSubmit(
          marketId,
          "currents",
          "current",
          request,
        ),
      },
      prepareStart: (request) => this.makerPrepareStart(request),
      start: (request) => this.makerStart(request),
      prepareStop: (request) => this.makerPrepareStop(request),
      submitPrepared: (request) => this.makerSubmitPrepared(request),
      stop: (request) => this.makerStop(request),
      waitUntilReady: (market, timeoutMs) => this.waitForMakerMarket(market, timeoutMs),
      statusAuthorizationPayload: (marketId, walletAddress, authorizationTimeMs) =>
        makerStatusAuthMessage(marketId, walletAddress, authorizationTimeMs),
      status: (marketId, signer) => this.makerStatus(marketId, signer),
      statusAuthorized: (request) => this.makerStatusAuthorized(request),
      subscribe: (marketId, signer, handlers, streamOptions) =>
        this.subscribeMaker(marketId, signer, handlers, streamOptions),
      reputationAuthorizationPayload: (marketId, walletAddress, authorizationTimeMs) =>
        makerReputationAuthMessage(marketId, walletAddress, authorizationTimeMs),
      reputation: (marketId, signer) => this.makerReputation(marketId, signer),
      reputationAuthorized: (request) => this.makerReputationAuthorized(request),
    };
    this.vault = {
      status: (request) => this.vaultStatus(request),
      preparePause: (request) => this.vaultPreparePause(request),
      prepareSetup: (request) => this.vaultPrepareSetup(request),
      prepareDelegate: (request) => this.vaultPrepareDelegate(request),
      preparePolicy: (request) => this.vaultPreparePolicy(request),
      prepareDeposit: (request) => this.vaultPrepareDeposit(request),
      prepareWithdrawal: (request) => this.vaultPrepareWithdrawal(request),
      submit: (request) => this.vaultSubmit(request),
      submission: (preparationId) => this.vaultSubmission(preparationId),
    };
    this.rewards = { read: (request) => this.rewardsRead(request) };
    this.referrals = {
      linkAuthorizationPayload: (referralCode) => referralLinkAuthorizationPayload(referralCode),
      claimAuthorizationPayload: (payoutWalletAddress) =>
        referralClaimAuthorizationPayload(payoutWalletAddress),
      read: (walletAddress) => this.referralsRead(walletAddress),
      link: (request) => this.referralLink(request),
      claim: (request) => this.referralClaim(request),
    };
    this.bugs = {
      authorizationPayload: (message) => bugAuthorizationPayload(message),
      read: (walletAddress) => this.bugsRead(walletAddress),
      submit: (request) => this.bugSubmit(request),
    };
    this.orders = {
      challenge: (marketId, request) => this.orderChallenge(marketId, request),
      prepare: (marketId, request) => this.orderPrepare(marketId, request),
      submit: (marketId, request) => this.orderSubmit(marketId, request),
      status: (marketId, request) => this.orderStatus(marketId, request),
      execute: (marketId, request) => this.executeOrder(marketId, request),
      connect: (marketId, ownerWallet, signer, handlers, streamOptions) =>
        this.connectOrders(marketId, ownerWallet, signer, handlers, streamOptions),
    };
  }

  private async readDiscovery(force: boolean): Promise<PlatformDiscoveryResponse> {
    const now = Date.now();
    if (!force && this.capabilityCache && this.capabilityCache.expiresAtMs > now) {
      return this.capabilityCache.value;
    }
    if (!force && this.capabilityRequest) return this.capabilityRequest;
    const request = this.get("/v2/capabilities").then((response) => {
      const value = platformDiscoveryResponse(response);
      this.capabilityCache = {
        value,
        expiresAtMs: Date.now() + this.capabilityCacheMs,
      };
      return value;
    });
    if (force) return request;
    this.capabilityRequest = request;
    try {
      return await request;
    } finally {
      if (this.capabilityRequest === request) this.capabilityRequest = undefined;
    }
  }

  private async readActionGraph(): Promise<PlatformActionGraphResponse> {
    return platformActionGraphResponse(await this.get("/v2/action-graph"));
  }

  private async readPlatformStatus(): Promise<PlatformServiceStatusResponse> {
    await this.requireReadCapability("platform.status.read");
    return platformServiceStatusResponse(await this.get("/v2/status"));
  }

  private async listAssets(request: PageRequest = {}): Promise<PlatformAssetsResponse> {
    await this.requireReadCapability("assets.read");
    return platformAssetsResponse(await this.get(`/v2/assets${pageQuery(request)}`));
  }

  private async listMarkets(request: PageRequest = {}): Promise<PlatformMarketsResponse> {
    await this.requireReadCapability("markets.read");
    return platformMarketsResponse(await this.get(`/v2/markets${pageQuery(request)}`));
  }

  private async allAssets(): Promise<readonly PlatformAsset[]> {
    const assets: PlatformAsset[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.listAssets({ limit: MAX_PAGE_SIZE, ...(cursor ? { cursor } : {}) });
      assets.push(...page.assets);
      cursor = page.page.has_more ? page.page.next_cursor ?? undefined : undefined;
      if (page.page.has_more && cursor === undefined) {
        throw new StrataContractError("asset discovery pagination is incomplete");
      }
    } while (cursor !== undefined);
    return assets;
  }

  private async allMarkets(): Promise<readonly PlatformMarket[]> {
    const markets: PlatformMarket[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.listMarkets({ limit: MAX_PAGE_SIZE, ...(cursor ? { cursor } : {}) });
      markets.push(...page.markets);
      cursor = page.page.has_more ? page.page.next_cursor ?? undefined : undefined;
      if (page.page.has_more && cursor === undefined) {
        throw new StrataContractError("market discovery pagination is incomplete");
      }
    } while (cursor !== undefined);
    return markets;
  }

  private async resolveAsset(reference: string): Promise<PlatformAsset> {
    const requested = reference.trim();
    if (!requested) throw new TypeError("asset must be an asset ID or symbol");
    const matches = (await this.allAssets()).filter((asset) =>
      asset.asset_id === requested || asset.symbol.toLowerCase() === requested.toLowerCase()
    );
    if (matches.length !== 1) {
      throw new StrataContractError(
        matches.length === 0 ? `asset is not available: ${reference}` : `asset is ambiguous: ${reference}`,
      );
    }
    return matches[0]!;
  }

  private async resolveMarket(reference: string): Promise<PlatformMarket> {
    const requested = reference.trim();
    if (!requested) throw new TypeError("market must be a market ID or label");
    const matches = (await this.allMarkets()).filter((market) =>
      market.market_id === requested || market.label.toLowerCase() === requested.toLowerCase()
    );
    if (matches.length !== 1) {
      throw new StrataContractError(
        matches.length === 0
          ? `market is not available: ${reference}`
          : `market label is ambiguous; use its market ID: ${reference}`,
      );
    }
    return matches[0]!;
  }

  private async swapQuote(request: PlatformSwapQuoteInput): Promise<PlatformSwapQuoteResponse> {
    await this.requireReadCapability("quotes.swap.read", "http");
    const inputAssetId = checkedAssetId(request.inputAssetId, "inputAssetId");
    const outputAssetId = checkedAssetId(request.outputAssetId, "outputAssetId");
    if (inputAssetId === outputAssetId) {
      throw new TypeError("inputAssetId and outputAssetId must differ");
    }
    const amountInAtoms = checkedAtomic(request.amountInAtoms, "amountInAtoms", false);
    const maximumToleranceBps = request.maximumToleranceBps ?? 0;
    checkedInteger(maximumToleranceBps, "maximumToleranceBps", 0, 1_000);
    const response = platformSwapQuoteResponse(await this.post("/v2/quotes", {
      input_asset_id: inputAssetId,
      output_asset_id: outputAssetId,
      amount_in_atoms: amountInAtoms,
      maximum_tolerance_bps: maximumToleranceBps,
    }));
    if (
      response.input_asset_id !== inputAssetId
      || response.output_asset_id !== outputAssetId
      || response.amount_in_atoms !== amountInAtoms
      || response.maximum_tolerance_bps !== maximumToleranceBps
    ) {
      throw new StrataContractError("swap quote bindings do not match request");
    }
    if (BigInt(response.amount_in_consumed_atoms) > BigInt(amountInAtoms)) {
      throw new StrataContractError("swap quote consumes more than the requested input");
    }
    if (BigInt(response.minimum_output_atoms) > BigInt(response.amount_out_atoms)) {
      throw new StrataContractError("swap quote minimum exceeds expected output");
    }
    return response;
  }

  private async bookSnapshot(
    marketId: string,
    request: PlatformBookRequest = {},
  ): Promise<PlatformBookSnapshotResponse> {
    await this.requireReadCapability("market_data.book.snapshot", "http");
    const id = checkedMarketId(marketId);
    const query = depthQuery(request);
    const response = platformBookSnapshotResponse(
      await this.get(`/v2/markets/${id}/book${query}`),
    );
    assertMarket(response.market_id, id);
    return response;
  }

  private async feeSchedule(marketId: string): Promise<PlatformFeeScheduleResponse> {
    await this.requireReadCapability("fees.read", "http");
    const id = checkedMarketId(marketId);
    const response = platformFeeScheduleResponse(await this.get(`/v2/markets/${id}/fees`));
    assertMarket(response.market_id, id);
    return response;
  }

  private async bestBidAsk(marketId: string): Promise<PlatformBestBidAskResponse> {
    await this.requireReadCapability("books.read", "http");
    const id = checkedMarketId(marketId);
    const response = platformBestBidAskResponse(await this.get(`/v2/markets/${id}/bbo`));
    assertMarket(response.market_id, id);
    return response;
  }

  private async marketStatus(marketId: string): Promise<PlatformMarketStatusResponse> {
    await this.requireReadCapability("markets.status.read", "http");
    const id = checkedMarketId(marketId);
    const response = platformMarketStatusResponse(await this.get(`/v2/markets/${id}/status`));
    assertMarket(response.market_id, id);
    return response;
  }

  private async trades(
    marketId: string,
    request: PlatformTradesRequest = {},
  ): Promise<PlatformTradesResponse> {
    await this.requireReadCapability("market_data.trades.read", "http");
    const id = checkedMarketId(marketId);
    const query = tradesQuery(request);
    const response = platformTradesResponse(
      await this.get(`/v2/markets/${id}/trades${query}`),
    );
    assertMarket(response.market_id, id);
    return response;
  }

  private async candles(
    marketId: string,
    request: PlatformCandlesRequest,
  ): Promise<PlatformCandlesResponse> {
    await this.requireReadCapability("market_data.candles.read", "http");
    const id = checkedMarketId(marketId);
    if (!Number.isSafeInteger(request.fromMs) || !Number.isSafeInteger(request.toMs)
        || request.fromMs < 0 || request.toMs <= request.fromMs) {
      throw new TypeError("candle range must use increasing non-negative millisecond timestamps");
    }
    const resolution = request.resolutionSeconds ?? 300;
    if (!Number.isSafeInteger(resolution) || resolution < 60
        || resolution > 86_400 || resolution % 60 !== 0) {
      throw new TypeError("candle resolution must be a whole number of minutes up to one day");
    }
    const query = new URLSearchParams({
      from_ms: String(request.fromMs),
      to_ms: String(request.toMs),
      resolution_seconds: String(resolution),
    });
    const response = platformCandlesResponse(
      await this.get(`/v2/markets/${id}/candles?${query.toString()}`),
    );
    assertMarket(response.market_id, id);
    return response;
  }

  private async mark(marketId: string): Promise<PlatformMarkResponse> {
    await this.requireReadCapability("market_data.marks.read", "http");
    const id = checkedMarketId(marketId);
    const response = platformMarkResponse(await this.get(`/v2/markets/${id}/marks`));
    assertMarket(response.market_id, id);
    return response;
  }

  private async subscribeExecutions(
    marketId: string,
    executionIds: readonly string[],
    handlers: PlatformExecutionHandlers,
    options: PlatformExecutionSubscriptionOptions = {},
  ): Promise<PlatformExecutionSubscription> {
    await this.requireReadCapability("execution.stream", "websocket");
    return subscribePlatformExecutions(
      this.apiBase,
      checkedMarketId(marketId),
      executionIds,
      handlers,
      options,
    );
  }

  private async executionStatus(
    marketId: string,
    executionId: string,
  ): Promise<PlatformExecutionStatusResponse> {
    await this.requireReadCapability("execution.status.read", "http");
    const id = checkedMarketId(marketId);
    const execution = executionId.trim();
    if (!/^se_[0-9a-f]{32}$/.test(execution)) {
      throw new TypeError("executionId must be an opaque Strata execution handle");
    }
    const response = platformExecutionStatusResponse(
      await this.get(`/v2/markets/${id}/executions/${execution}`),
    );
    assertMarket(response.market_id, id);
    if (response.execution_id !== execution) {
      throw new StrataContractError("response execution does not match request");
    }
    return response;
  }

  private async twapChallenge(
    marketId: string,
    request: PlatformTwapChallengeInput,
  ): Promise<PlatformTwapChallengeResponse> {
    await this.requireCapability(
      request.action === "place" ? "algos.twap.place" : "algos.twap.cancel",
      request.action === "place" ? "submit" : "destructive",
    );
    const id = checkedMarketId(marketId);
    const body = twapOperationWire(request);
    const response = platformTwapChallengeResponse(
      await this.post(`/v2/markets/${id}/twaps/challenge`, body),
    );
    assertMarket(response.market_id, id);
    if (response.action !== request.action) {
      throw new StrataContractError("TWAP challenge action does not match request");
    }
    return response;
  }

  private async twapPrepare(
    marketId: string,
    request: PlatformTwapPrepareInput,
  ): Promise<PlatformTwapPrepareResponse> {
    const id = checkedMarketId(marketId);
    let body: Record<string, unknown>;
    if ("operation" in request) {
      // Direct: bind and build in one step; the transaction signature is the
      // authorization.
      await this.requireCapability(
        request.operation.action === "place" ? "algos.twap.place" : "algos.twap.cancel",
        request.operation.action === "place" ? "submit" : "destructive",
      );
      body = twapOperationWire(request.operation);
    } else {
      body = {
        challenge_id: checkedHandle(request.challengeId, "challengeId", "twc_"),
        authorization_signature: checkedBase58Signature(
          request.authorizationSignature,
          "authorizationSignature",
        ),
      };
    }
    const response = platformTwapPrepareResponse(
      await this.post(`/v2/markets/${id}/twaps/prepare`, body),
    );
    assertMarket(response.market_id, id);
    if ("operation" in request && response.action !== request.operation.action) {
      throw new StrataContractError("prepared TWAP action does not match request");
    }
    return response;
  }

  private async twapSubmit(
    marketId: string,
    request: PlatformTwapSubmitInput,
  ): Promise<PlatformTwapSubmitResponse> {
    const id = checkedMarketId(marketId);
    const twapControlId = checkedHandle(
      request.twapControlId,
      "twapControlId",
      "twctl_",
    );
    const signedTransactionBase64 = request.signedTransactionBase64.trim();
    decodeBase64(signedTransactionBase64);
    const response = platformTwapSubmitResponse(
      await this.post(`/v2/markets/${id}/twaps/submit`, {
        twap_control_id: twapControlId,
        signed_transaction_base64: signedTransactionBase64,
        idempotency_key: normalizeIdempotencyKey(request.idempotencyKey),
      }),
    );
    assertMarket(response.market_id, id);
    if (response.twap_control_id !== twapControlId) {
      throw new StrataContractError("TWAP receipt does not match submitted control ID");
    }
    return response;
  }

  private async executeTwap(
    marketId: string,
    request: PlatformTwapExecuteInput,
  ): Promise<PlatformTwapSubmitResponse> {
    if (request.verifyTransaction !== undefined && typeof request.verifyTransaction !== "function") {
      throw new TypeError("verifyTransaction must be a function when supplied");
    }
    const signerPublicKey = canonicalPublicKey(request.signer.publicKey, "signer.publicKey");
    if (typeof request.signer.signTransaction !== "function") {
      throw new TypeError("signer must provide signTransaction");
    }
    const id = checkedMarketId(marketId);
    const operation = {
      ...request.operation,
      sessionPublicKey: signerPublicKey,
    } as PlatformTwapChallengeInput;
    // One signature: the action is bound and built in one step and the
    // session signs only the resulting transaction.
    const prepared = await this.twapPrepare(id, { operation });
    if (
      operation.action === "cancel"
        ? prepared.twap_id !== checkedTwapId(operation.twapId)
        : !prepared.twap_id.startsWith("twap_")
    ) {
      throw new StrataContractError("prepared TWAP control does not match the request");
    }
    const ownerWallet = canonicalPublicKey(request.operation.ownerWallet, "ownerWallet");
    const verification: PlatformTwapVerificationContext = {
      operation,
      marketId: id,
      prepared,
      ownerWallet,
      sessionPublicKey: signerPublicKey,
    };
    if (request.verifyTransaction) {
      await request.verifyTransaction(verification);
    } else {
      verifyTwapTransaction(verification);
    }
    const signedTransactionBase64 = await request.signer.signTransaction(
      prepared.transaction_base64,
    );
    decodeBase64(signedTransactionBase64);
    verifySignedTransactionMessage(prepared.transaction_base64, signedTransactionBase64);
    return this.twapSubmit(marketId, {
      twapControlId: prepared.twap_control_id,
      signedTransactionBase64,
      idempotencyKey: request.idempotencyKey ?? prepared.twap_control_id,
    });
  }

  private async subscribeTwaps(
    walletAddress: string,
    handlers: PlatformTwapHandlers,
    options: PlatformTwapSubscribeOptions = {},
  ): Promise<PlatformTwapSubscription> {
    await this.requireReadCapability("algos.twap.stream", "websocket");
    const wallet = canonicalPublicKey(walletAddress, "walletAddress");
    const marketIds = await this.accountMarketIds(options.marketIds);
    const { marketIds: _marketIds, ...streamOptions } = options;
    return subscribePlatformTwaps(this.apiBase, marketIds, wallet, handlers, streamOptions);
  }

  private async twaps(marketId: string, walletAddress: string): Promise<PlatformTwapsResponse> {
    await this.requireReadCapability("algos.twap.read", "http");
    const id = checkedMarketId(marketId);
    const wallet = canonicalPublicKey(walletAddress, "walletAddress");
    const response = platformTwapsResponse(
      await this.get(`/v2/markets/${id}/account/${wallet}/twaps`),
    );
    assertMarket(response.market_id, id);
    if (response.wallet_address !== wallet) {
      throw new StrataContractError("response wallet does not match request");
    }
    return response;
  }

  private async portfolio(walletAddress: string): Promise<PlatformPortfolioResponse> {
    await this.requireReadCapability("portfolio.read", "http");
    const wallet = canonicalPublicKey(walletAddress, "walletAddress");
    const response = platformPortfolioResponse(
      await this.get(`/v2/account/${wallet}/portfolio`),
    );
    if (response.wallet_address !== wallet) {
      throw new StrataContractError("portfolio identity does not match request");
    }
    return response;
  }

  private async portfolioHistory(
    walletAddress: string,
    range: PlatformPortfolioHistoryRange = "24h",
  ): Promise<PlatformPortfolioHistoryResponse> {
    await this.requireReadCapability("portfolio.history.read", "http");
    const wallet = canonicalPublicKey(walletAddress, "walletAddress");
    if (range !== "24h" && range !== "7d" && range !== "30d") {
      throw new TypeError("portfolio history range must be 24h, 7d, or 30d");
    }
    const response = platformPortfolioHistoryResponse(
      await this.get(`/v2/account/${wallet}/portfolio/history?range=${range}`),
    );
    if (response.wallet_address !== wallet || response.range !== range) {
      throw new StrataContractError("portfolio history identity does not match request");
    }
    return response;
  }

  private async vaultStatus(
    request: PlatformVaultStatusInput,
  ): Promise<PlatformVaultStatusResponse> {
    await this.requireReadCapability("vault.status.read", "http");
    const wallet = canonicalPublicKey(request.walletAddress, "walletAddress");
    const query = new URLSearchParams({ wallet_address: wallet });
    const session = request.sessionPublicKey === undefined
      ? undefined
      : canonicalPublicKey(request.sessionPublicKey, "sessionPublicKey");
    if (session !== undefined) query.set("session_public_key", session);
    const response = platformVaultStatusResponse(
      await this.get(`/v2/vault/status?${query.toString()}`),
    );
    if (
      response.wallet_address !== wallet
      || (session === undefined && response.session !== null)
      || (session !== undefined && response.session?.session_public_key !== session)
    ) {
      throw new StrataContractError("vault status identity does not match request");
    }
    return response;
  }

  private async vaultPreparePause(
    request: PlatformVaultPausePrepareInput,
  ): Promise<PlatformVaultPausePrepareResponse> {
    await this.requireCapability("vault.pause", "destructive", "http");
    const wallet = canonicalPublicKey(request.walletAddress, "walletAddress");
    if (typeof request.paused !== "boolean") throw new TypeError("paused must be boolean");
    const response = platformVaultPausePrepareResponse(
      await this.post("/v2/vault/pause/prepare", {
        wallet_address: wallet,
        paused: request.paused,
      }),
    );
    if (response.wallet_address !== wallet || response.paused !== request.paused) {
      throw new StrataContractError("vault pause preparation does not match request");
    }
    return response;
  }

  private async vaultPrepareSetup(
    request: PlatformVaultSetupPrepareInput,
  ): Promise<PlatformVaultSetupPrepareResponse> {
    await this.requireCapability("vault.setup", "submit", "http");
    const wallet = canonicalPublicKey(request.walletAddress, "walletAddress");
    const session = canonicalPublicKey(request.sessionPublicKey, "sessionPublicKey");
    if (wallet === session) throw new TypeError("sessionPublicKey must differ from walletAddress");
    const replacement = request.replaceSessionPublicKey == null
      ? null
      : canonicalPublicKey(request.replaceSessionPublicKey, "replaceSessionPublicKey");
    if (replacement === wallet || replacement === session) {
      throw new TypeError("replaceSessionPublicKey must differ from the wallet and new session");
    }
    const market = request.marketId == null ? null : checkedMarketId(request.marketId);
    const expiresAtMs = request.expiresAtMs ?? null;
    if (
      expiresAtMs !== null
      && (!Number.isSafeInteger(expiresAtMs)
        || expiresAtMs % 1_000 !== 0
        || expiresAtMs <= Date.now() + 60_000)
    ) throw new TypeError("expiresAtMs must be whole seconds at least 60 seconds in the future");
    const minimumIntervalSeconds = checkedInteger(
      request.minimumIntervalSeconds ?? PLATFORM_SESSION_DEFAULT_MINIMUM_INTERVAL_SECONDS,
      "minimumIntervalSeconds",
      0,
      86_400,
    );
    const maximumToleranceBps = checkedInteger(
      request.maximumToleranceBps ?? PLATFORM_SESSION_DEFAULT_MAXIMUM_TOLERANCE_BPS,
      "maximumToleranceBps",
      1,
      1_000,
    );
    const requestedLimits = request.spendingLimits ?? [];
    if (requestedLimits.length > PLATFORM_SESSION_MAX_SPENDING_LIMITS) {
      throw new TypeError("spendingLimits carries at most four assets");
    }
    const spendingLimits = requestedLimits.map((limit, index) => ({
      asset_id: checkedAssetId(limit.assetId, `spendingLimits[${index}].assetId`),
      maximum_per_execution_atoms: limit.maximumPerExecutionAtoms == null
        ? null
        : checkedAtomic(
          limit.maximumPerExecutionAtoms,
          `spendingLimits[${index}].maximumPerExecutionAtoms`,
          false,
        ),
    }));
    if (new Set(spendingLimits.map((limit) => limit.asset_id)).size !== spendingLimits.length) {
      throw new TypeError("spendingLimits asset IDs must be unique");
    }
    const response = platformVaultSetupPrepareResponse(
      await this.post("/v2/vault/setup/prepare", {
        wallet_address: wallet,
        session_public_key: session,
        replace_session_public_key: replacement,
        market_id: market,
        expires_at_ms: expiresAtMs,
        minimum_interval_seconds: minimumIntervalSeconds,
        maximum_tolerance_bps: maximumToleranceBps,
        spending_limits: spendingLimits,
      }),
    );
    if (
      response.wallet_address !== wallet
      || response.session_public_key !== session
      || response.replace_session_public_key !== replacement
      || response.market_id !== market
      || response.expires_at_ms !== expiresAtMs
      || response.minimum_interval_seconds !== minimumIntervalSeconds
      || response.maximum_tolerance_bps !== maximumToleranceBps
      || JSON.stringify(response.spending_limits) !== JSON.stringify(spendingLimits)
    ) {
      throw new StrataContractError("vault setup preparation does not match request");
    }
    return response;
  }

  private async vaultPrepareDelegate(
    request: PlatformVaultDelegatePrepareInput,
  ): Promise<PlatformVaultDelegatePrepareResponse> {
    await this.requireCapability("vault.delegate.manage", "destructive", "http");
    const wallet = canonicalPublicKey(request.walletAddress, "walletAddress");
    const session = canonicalPublicKey(request.sessionPublicKey, "sessionPublicKey");
    if (wallet === session) throw new TypeError("sessionPublicKey must differ from walletAddress");
    if (request.action !== "revoke") throw new TypeError("vault delegate action must be revoke");
    const response = platformVaultDelegatePrepareResponse(
      await this.post("/v2/vault/delegates/prepare", {
        wallet_address: wallet,
        session_public_key: session,
        action: request.action,
      }),
    );
    if (
      response.wallet_address !== wallet
      || response.session_public_key !== session
      || response.action !== request.action
    ) {
      throw new StrataContractError("vault delegate preparation does not match request");
    }
    return response;
  }

  private async vaultPreparePolicy(
    request: PlatformVaultPolicyPrepareInput,
  ): Promise<PlatformVaultPolicyPrepareResponse> {
    await this.requireCapability("vault.policy.manage", "destructive", "http");
    const wallet = canonicalPublicKey(request.walletAddress, "walletAddress");
    const mode = request.withdrawalAccess.mode;
    if (mode !== "blocked" && mode !== "restricted") {
      throw new TypeError("withdrawal access mode must be blocked or restricted");
    }
    const allowed = request.withdrawalAccess.allowedWalletAddresses.map((address, index) =>
      canonicalPublicKey(address, `allowedWalletAddresses[${index}]`));
    if (
      allowed.length > 8
      || new Set(allowed).size !== allowed.length
      || (mode === "blocked" && allowed.length !== 0)
      || (mode === "restricted" && allowed.length === 0)
    ) throw new TypeError("withdrawal access policy is inconsistent");
    const withdrawalAccess = {
      mode,
      allowed_wallet_addresses: allowed,
    };
    const response = platformVaultPolicyPrepareResponse(
      await this.post("/v2/vault/policies/prepare", {
        wallet_address: wallet,
        withdrawal_access: withdrawalAccess,
      }),
    );
    if (
      response.wallet_address !== wallet
      || JSON.stringify(response.withdrawal_access) !== JSON.stringify(withdrawalAccess)
    ) throw new StrataContractError("vault policy preparation does not match request");
    return response;
  }

  private async vaultPrepareDeposit(
    request: PlatformVaultDepositPrepareInput,
  ): Promise<PlatformVaultDepositPrepareResponse> {
    await this.requireCapability("vault.deposit", "submit", "http");
    const wallet = canonicalPublicKey(request.walletAddress, "walletAddress");
    const market = checkedMarketId(request.marketId);
    const asset = checkedAssetId(request.assetId, "assetId");
    const amount = checkedAtomic(request.amountAtoms, "amountAtoms", false);
    const session = request.sessionPublicKey == null
      ? null
      : canonicalPublicKey(request.sessionPublicKey, "sessionPublicKey");
    if (session !== null && session === wallet) {
      throw new TypeError("sessionPublicKey must differ from walletAddress");
    }
    const response = platformVaultDepositPrepareResponse(
      await this.post("/v2/vault/deposits/prepare", {
        wallet_address: wallet,
        market_id: market,
        asset_id: asset,
        amount_atoms: amount,
        session_public_key: session,
      }),
    );
    if (
      response.wallet_address !== wallet
      || response.market_id !== market
      || response.asset_id !== asset
      || response.amount_atoms !== amount
      || response.session_public_key !== session
    ) throw new StrataContractError("vault deposit preparation does not match request");
    return response;
  }

  private async vaultPrepareWithdrawal(
    request: PlatformVaultWithdrawPrepareInput,
  ): Promise<PlatformVaultWithdrawPrepareResponse> {
    await this.requireCapability("vault.withdraw", "destructive", "http");
    const wallet = canonicalPublicKey(request.walletAddress, "walletAddress");
    const market = checkedMarketId(request.marketId);
    const asset = checkedAssetId(request.assetId, "assetId");
    const destination = canonicalPublicKey(
      request.destinationWalletAddress,
      "destinationWalletAddress",
    );
    const amount = checkedAtomic(request.amountAtoms, "amountAtoms", false);
    const response = platformVaultWithdrawPrepareResponse(
      await this.post("/v2/vault/withdrawals/prepare", {
        wallet_address: wallet,
        market_id: market,
        asset_id: asset,
        destination_wallet_address: destination,
        amount_atoms: amount,
      }),
    );
    if (
      response.wallet_address !== wallet
      || response.market_id !== market
      || response.asset_id !== asset
      || response.destination_wallet_address !== destination
      || response.amount_atoms !== amount
    ) throw new StrataContractError("vault withdrawal preparation does not match request");
    return response;
  }

  private async vaultSubmit(
    request: PlatformVaultSubmitInput,
  ): Promise<PlatformVaultSubmitResponse> {
    await this.requireCapability("vault.relay", "submit");
    const preparationId = checkedHandle(request.preparationId, "preparationId", "vp_");
    const signedTransactionBase64 = request.signedTransactionBase64.trim();
    decodeBase64(signedTransactionBase64);
    const response = platformVaultSubmitResponse(
      await this.post("/v2/vault/submit", {
        preparation_id: preparationId,
        signed_transaction_base64: signedTransactionBase64,
        idempotency_key: normalizeIdempotencyKey(request.idempotencyKey),
      }),
    );
    if (response.preparation_id !== preparationId) {
      throw new StrataContractError("vault submission does not match the preparation");
    }
    return response;
  }

  private async vaultSubmission(preparationId: string): Promise<PlatformVaultSubmitResponse> {
    await this.requireCapability("vault.relay", "submit");
    const id = checkedHandle(preparationId, "preparationId", "vp_");
    const response = platformVaultSubmitResponse(await this.get(`/v2/vault/submissions/${id}`));
    if (response.preparation_id !== id) {
      throw new StrataContractError("vault submission does not match the preparation");
    }
    return response;
  }

  private async rewardsRead(
    request: PlatformRewardsRequest = {},
  ): Promise<PlatformRewardsResponse> {
    await this.requireReadCapability("rewards.read", "http");
    const query = new URLSearchParams();
    const wallet = request.walletAddress === undefined
      ? undefined
      : canonicalPublicKey(request.walletAddress, "walletAddress");
    if (wallet !== undefined) query.set("wallet_address", wallet);
    if (request.limit !== undefined) {
      if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 100) {
        throw new TypeError("reward standings limit must be an integer between 1 and 100");
      }
      query.set("limit", String(request.limit));
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    const response = platformRewardsResponse(await this.get(`/v2/rewards${suffix}`));
    if (wallet !== undefined && response.owner?.wallet_address !== wallet) {
      throw new StrataContractError("reward owner does not match request");
    }
    if (wallet === undefined && response.owner !== null) {
      throw new StrataContractError("unrequested private reward owner was returned");
    }
    return response;
  }

  private async referralsRead(walletAddress: string): Promise<PlatformReferralsResponse> {
    await this.requireReadCapability("referrals.read", "http");
    const wallet = canonicalPublicKey(walletAddress, "walletAddress");
    const response = platformReferralsResponse(await this.get(`/v2/referrals/${wallet}`));
    if (response.wallet_address !== wallet) {
      throw new StrataContractError("referral owner does not match request");
    }
    return response;
  }

  private async referralLink(
    request: PlatformReferralLinkInput,
  ): Promise<PlatformReferralLinkResponse> {
    await this.requireCapability("referrals.link", "submit", "http");
    const wallet = canonicalPublicKey(request.walletAddress, "walletAddress");
    const referralCode = checkedReferralCode(request.referralCode);
    const response = platformReferralLinkResponse(await this.post("/v2/referrals/link", {
      wallet_address: wallet,
      referral_code: referralCode,
      authorization_signature: checkedHexSignature(
        request.authorizationSignature,
        "authorizationSignature",
      ),
    }));
    if (response.wallet_address !== wallet || response.referral_code !== referralCode) {
      throw new StrataContractError("referral link does not match request");
    }
    return response;
  }

  private async referralClaim(
    request: PlatformReferralClaimInput,
  ): Promise<PlatformReferralClaimResponse> {
    await this.requireCapability("referrals.claim", "submit", "http");
    const wallet = canonicalPublicKey(request.walletAddress, "walletAddress");
    const payout = request.payoutWalletAddress === undefined
      ? wallet
      : canonicalPublicKey(request.payoutWalletAddress, "payoutWalletAddress");
    const response = platformReferralClaimResponse(await this.post("/v2/referrals/claim", {
      wallet_address: wallet,
      payout_wallet_address: payout,
      authorization_signature: checkedHexSignature(
        request.authorizationSignature,
        "authorizationSignature",
      ),
    }));
    if (response.wallet_address !== wallet || response.payout_wallet_address !== payout) {
      throw new StrataContractError("referral claim does not match request");
    }
    return response;
  }

  private async bugsRead(walletAddress: string): Promise<PlatformBugsResponse> {
    await this.requireReadCapability("bugs.read", "http");
    const wallet = canonicalPublicKey(walletAddress, "walletAddress");
    const response = platformBugsResponse(await this.get(`/v2/bugs/${wallet}`));
    if (response.wallet_address !== wallet) {
      throw new StrataContractError("bug report owner does not match request");
    }
    return response;
  }

  private async bugSubmit(request: PlatformBugSubmitInput): Promise<PlatformBugSubmitResponse> {
    await this.requireCapability("bugs.submit", "submit", "http");
    const owner = canonicalPublicKey(request.ownerWallet, "ownerWallet");
    const message = checkedBugMessage(request.message);
    const authorizationSignature = checkedHexSignature(
      request.authorizationSignature,
      "authorizationSignature",
    );
    return platformBugSubmitResponse(await this.post("/v2/bugs", {
      owner_wallet: owner,
      message,
      authorization_signature: authorizationSignature,
    }));
  }

  private async subscribeBook(
    marketId: string,
    handlers: PlatformMarketDataHandlers,
    options: PlatformMarketDataSubscriptionOptions = {},
  ): Promise<PlatformMarketDataSubscription> {
    await Promise.all([
      this.requireReadCapability("market_data.book.stream", "websocket"),
      this.requireReadCapability("market_data.bbo.stream", "websocket"),
      this.requireReadCapability("market_data.trades.stream", "websocket"),
      this.requireReadCapability("market_data.marks.read", "websocket"),
    ]);
    return subscribePlatformMarketData(this.apiBase, checkedMarketId(marketId), handlers, options);
  }

  private async accountMarket(
    marketId: string,
    signer: PlatformAccountSigner,
    request: PlatformAccountMarketRequest = {},
  ): Promise<PlatformAccountSnapshotResponse> {
    const discovery = await this.requireReadCapability("account.read", "http");
    const id = checkedMarketId(marketId);
    const authorizedSigner = checkedAccountSigner(signer);
    const fillLimit = checkedFillLimit(request.fillLimit);
    // Bind authorization to Strata's clock so a skewed agent host still signs
    // inside the server's short read window.
    const timestampMs = discovery.server_time_ms;
    const signature = await authorizedSigner.signMessage(
      accountHttpAuthMessage(id, authorizedSigner.publicKey, timestampMs, fillLimit),
    );
    if (!(signature instanceof Uint8Array) || signature.length !== 64) {
      throw new TypeError("account signer must return a 64-byte Ed25519 signature");
    }
    const response = platformAccountSnapshotResponse(await this.get(
      `/v2/markets/${id}/account/${authorizedSigner.publicKey}${fillLimitQuery(request.fillLimit)}`,
      {
        "X-Strata-Auth-Time": String(timestampMs),
        "X-Strata-Auth-Signature": bytesToHex(signature),
      },
    ));
    assertMarket(response.market_id, id);
    if (response.wallet_address !== authorizedSigner.publicKey) {
      throw new StrataContractError("response wallet does not match signed request");
    }
    return response;
  }

  private async accountSnapshot(
    signer: PlatformAccountSigner,
    request: PlatformAccountRequest = {},
  ): Promise<PlatformAccountSnapshot> {
    const authorizedSigner = checkedAccountSigner(signer);
    const marketIds = await this.accountMarketIds(request.marketIds);
    const markets: PlatformAccountSnapshotResponse[] = [];
    // Sign sequentially so interactive external signers are never prompted concurrently.
    for (const marketId of marketIds) {
      markets.push(await this.accountMarket(marketId, authorizedSigner, request));
    }
    return {
      wallet_address: authorizedSigner.publicKey,
      server_time_ms: markets.reduce(
        (latest, market) => Math.max(latest, market.server_time_ms),
        0,
      ),
      markets,
    };
  }

  private async makerStrandPrepare(
    marketId: string,
    request: PlatformMakerStrandPrepareInput,
  ): Promise<PlatformMakerControlPrepareResponse> {
    await this.requireCapability("mm.strand.manage", "submit");
    const id = checkedMarketId(marketId);
    const wire = makerStrandPrepareWire(request);
    const response = platformMakerControlPrepareResponse(
      await this.post(`/v2/markets/${id}/makers/strands/prepare?transaction_version=0`, wire.body),
    );
    assertMakerControlPrepare(response, id, wire.makerWallet, "strand", wire.action);
    return response;
  }

  private async makerIntentPrepare(
    marketId: string,
    request: PlatformMakerIntentPrepareInput,
  ): Promise<PlatformMakerIntentPrepareResponse> {
    await this.requireCapability("mm.intent.manage", "submit");
    const id = checkedMarketId(marketId);
    const ownerWallet = canonicalPublicKey(request.ownerWallet, "ownerWallet");
    const sessionPublicKey = canonicalPublicKey(request.sessionPublicKey, "sessionPublicKey");
    const body = request.action === "post"
      ? (() => {
          const minPriceAtoms = checkedAtomic(request.minPriceAtoms, "minPriceAtoms", false);
          const maxPriceAtoms = checkedAtomic(request.maxPriceAtoms, "maxPriceAtoms", false);
          if (BigInt(minPriceAtoms) > BigInt(maxPriceAtoms)) {
            throw new TypeError("minPriceAtoms cannot exceed maxPriceAtoms");
          }
          return {
            action: "post",
            market_id: id,
            owner_wallet: ownerWallet,
            session_public_key: sessionPublicKey,
            side: request.side,
            min_price_atoms: minPriceAtoms,
            max_price_atoms: maxPriceAtoms,
            max_fill_size_atoms: checkedAtomic(
              request.maxFillSizeAtoms,
              "maxFillSizeAtoms",
              false,
            ),
          };
        })()
      : {
          action: "revoke",
          market_id: id,
          owner_wallet: ownerWallet,
          session_public_key: sessionPublicKey,
        };
    const response = platformMakerIntentPrepareResponse(
      await this.post(`/v2/markets/${id}/makers/intents/prepare`, body),
    );
    if (
      response.market_id !== id
      || response.owner_wallet !== ownerWallet
      || response.session_public_key !== sessionPublicKey
      || response.action !== request.action
    ) {
      throw new StrataContractError("maker-intent preparation does not match the request");
    }
    return response;
  }

  private async makerIntentSubmit(
    marketId: string,
    request: PlatformMakerIntentSubmitInput,
  ): Promise<PlatformMakerIntentSubmitResponse> {
    await this.requireCapability("mm.intent.manage", "submit");
    const id = checkedMarketId(marketId);
    const signedTransactionBase64 = request.signedTransactionBase64.trim();
    decodeBase64(signedTransactionBase64);
    return platformMakerIntentSubmitResponse(
      await this.post(`/v2/markets/${id}/makers/intents/submit`, {
        signed_transaction_base64: signedTransactionBase64,
      }),
    );
  }

  private async makerIntentExecute(
    marketId: string,
    request: PlatformMakerIntentExecuteInput,
  ): Promise<PlatformMakerIntentSubmitResponse> {
    const id = checkedMarketId(marketId);
    const ownerWallet = canonicalPublicKey(request.operation.ownerWallet, "ownerWallet");
    const sessionPublicKey = canonicalPublicKey(request.signer.publicKey, "signer.publicKey");
    if (typeof request.signer.signTransaction !== "function") {
      throw new TypeError("signer must provide signTransaction");
    }
    const operation: PlatformMakerIntentPrepareInput = {
      ...request.operation,
      ownerWallet,
      sessionPublicKey,
    };
    const prepared = await this.makerIntentPrepare(id, operation);
    const context = { marketId: id, operation, prepared, ownerWallet, sessionPublicKey };
    if (request.verifyTransaction) await request.verifyTransaction(context);
    else await verifyIntentTransaction(context);
    const signedTransactionBase64 = await request.signer.signTransaction(
      prepared.transaction_base64,
    );
    verifySignedTransactionMessage(prepared.transaction_base64, signedTransactionBase64);
    return this.makerIntentSubmit(id, { signedTransactionBase64 });
  }

  private async waitForMakerMarket(reference: string, timeoutMs = 30_000): Promise<PlatformMarket> {
    checkedInteger(timeoutMs, "timeoutMs", 1, 300_000);
    const market = await this.resolveMarket(reference);
    const deadline = Date.now() + timeoutMs;
    let lastProblem = "market is not active";
    do {
      try {
        const [status, mark] = await Promise.all([
          this.marketStatus(market.market_id),
          this.mark(market.market_id),
        ]);
        if (status.status === "active" && !mark.stale && mark.price_atoms_per_base_unit !== null) {
          return market;
        }
        lastProblem = status.status !== "active"
          ? `market is ${status.status}`
          : "Strata mark is not fresh";
      } catch (error) {
        if (!(error instanceof StrataApiError) || !error.retryable) throw error;
        lastProblem = error.message;
      }
      await delay(Math.min(500, Math.max(0, deadline - Date.now())));
    } while (Date.now() < deadline);
    throw new StrataContractError(`market did not become ready within ${timeoutMs}ms: ${lastProblem}`);
  }

  private async makerPrepareStart(
    request: PlatformMakerQuickstartPrepareInput,
  ): Promise<PlatformMakerQuickstartPrepared> {
    const makerWallet = canonicalPublicKey(request.makerWallet, "makerWallet");
    const product = checkedMakerProduct(request.product);
    const market = await this.waitForMakerMarket(request.market);
    const [assets, marketStatus, mark, makerStatus] = await Promise.all([
      this.allAssets(),
      this.marketStatus(market.market_id),
      this.mark(market.market_id),
      this.makerStatus(market.market_id, makerWallet),
    ]);
    const baseAsset = assets.find((asset) => asset.asset_id === market.base_asset_id);
    if (!baseAsset) throw new StrataContractError("market base asset is missing from discovery");
    if (mark.stale || mark.price_atoms_per_base_unit === null) {
      throw new StrataContractError("the market does not have a fresh Strata mark");
    }
    const operation = makerQuickstartOperation({
      request,
      makerWallet,
      product,
      baseAsset,
      marketLabel: market.label,
      currentSlot: BigInt(makerStatus.current_slot),
      markPriceAtoms: BigInt(mark.price_atoms_per_base_unit),
      tickSizeAtoms: BigInt(marketStatus.tick_size_atoms),
    });
    const prepared = product === "strand"
      ? await this.makerStrandPrepare(market.market_id, operation as PlatformMakerStrandPrepareInput)
      : await this.makerCurrentPrepare(market.market_id, operation as PlatformMakerCurrentPrepareInput);
    const result = { market, base_asset: baseAsset, product, operation, prepared };
    await verifyMakerTransaction({ marketId: market.market_id, makerWallet, operation, prepared });
    return result;
  }

  private async makerStart(request: PlatformMakerStartInput): Promise<PlatformMakerQuickstartResult> {
    const signer = checkedMakerTransactionSigner(request.signer);
    const prepared = await this.makerPrepareStart({
      ...request,
      makerWallet: signer.publicKey,
    });
    await verifyMakerTransaction({
      marketId: prepared.market.market_id,
      makerWallet: signer.publicKey,
      operation: prepared.operation,
      prepared: prepared.prepared,
    });
    const signedTransactionBase64 = await signer.signTransaction(
      prepared.prepared.transaction_base64,
    );
    return this.makerSubmitPrepared({
      prepared,
      signedTransactionBase64,
      ...(request.confirmationTimeoutMs === undefined
        ? {}
        : { confirmationTimeoutMs: request.confirmationTimeoutMs }),
      ...(request.confirmationPollMs === undefined
        ? {}
        : { confirmationPollMs: request.confirmationPollMs }),
    }) as Promise<PlatformMakerQuickstartResult>;
  }

  private async makerSubmitPrepared(
    request: PlatformMakerSubmitPreparedInput,
  ): Promise<PlatformMakerQuickstartResult | PlatformMakerStopResult> {
    const { prepared } = request;
    const makerWallet = prepared.prepared.maker_wallet;
    await verifyMakerTransaction({
      marketId: prepared.market.market_id,
      makerWallet,
      operation: prepared.operation,
      prepared: prepared.prepared,
    });
    const signedTransactionBase64 = request.signedTransactionBase64.trim();
    verifySignedTransactionMessage(
      prepared.prepared.transaction_base64,
      signedTransactionBase64,
    );
    const confirmationTimeoutMs = checkedOptionalTimeout(
      request.confirmationTimeoutMs,
      "confirmationTimeoutMs",
      45_000,
    );
    const confirmationPollMs = checkedOptionalTimeout(
      request.confirmationPollMs,
      "confirmationPollMs",
      500,
      100,
      5_000,
    );
    const input = {
      makerControlId: prepared.prepared.maker_control_id,
      signedTransactionBase64,
      idempotencyKey: request.idempotencyKey ?? prepared.prepared.maker_control_id,
    };
    const receipt = prepared.product === "strand"
      ? await this.makerControlSubmit(prepared.market.market_id, "strands", "strand", input)
      : await this.makerControlSubmit(prepared.market.market_id, "currents", "current", input);
    const isStart = prepared.operation.action !== "cancel";
    const makerStatus = await this.waitForMakerProduct(
      prepared.market.market_id,
      makerWallet,
      prepared.product,
      prepared.operation,
      isStart,
      confirmationTimeoutMs,
      confirmationPollMs,
      receipt.signature,
    );
    if (isStart && "base_asset" in prepared) {
      return { ...prepared, receipt, status: "confirmed", maker_status: makerStatus };
    }
    return {
      ...prepared,
      receipt,
      status: "confirmed",
      maker_status: makerStatus,
      already_stopped: false,
    };
  }

  private async makerPrepareStop(
    request: PlatformMakerStopPrepareInput,
  ): Promise<PlatformMakerStopPrepared> {
    const makerWallet = canonicalPublicKey(request.makerWallet, "makerWallet");
    const product = checkedMakerProduct(request.product);
    const market = await this.resolveMarket(request.market);
    const operation = { action: "cancel", makerWallet } as const;
    const prepared = product === "strand"
      ? await this.makerStrandPrepare(market.market_id, operation)
      : await this.makerCurrentPrepare(market.market_id, operation);
    await verifyMakerTransaction({ marketId: market.market_id, makerWallet, operation, prepared });
    return { market, product, operation, prepared };
  }

  private async makerStop(request: PlatformMakerStopInput): Promise<PlatformMakerStopResult> {
    const signer = checkedMakerTransactionSigner(request.signer);
    const product = checkedMakerProduct(request.product);
    const market = await this.resolveMarket(request.market);
    const operation = { action: "cancel", makerWallet: signer.publicKey } as const;
    const before = await this.makerStatus(market.market_id, signer.publicKey);
    if (!makerProductPresent(before, product)) {
      return {
        market,
        product,
        operation,
        prepared: null,
        receipt: null,
        status: "confirmed",
        maker_status: before,
        already_stopped: true,
      };
    }
    const stop = await this.makerPrepareStop({
      market: market.market_id,
      product,
      makerWallet: signer.publicKey,
    });
    await verifyMakerTransaction({
      marketId: market.market_id,
      makerWallet: signer.publicKey,
      operation,
      prepared: stop.prepared,
    });
    const signedTransactionBase64 = await signer.signTransaction(stop.prepared.transaction_base64);
    return this.makerSubmitPrepared({
      prepared: stop,
      signedTransactionBase64,
      ...(request.confirmationTimeoutMs === undefined
        ? {}
        : { confirmationTimeoutMs: request.confirmationTimeoutMs }),
      ...(request.confirmationPollMs === undefined
        ? {}
        : { confirmationPollMs: request.confirmationPollMs }),
    }) as Promise<PlatformMakerStopResult>;
  }

  private async waitForMakerProduct(
    marketId: string,
    makerWallet: string,
    product: PlatformMakerQuickstartProduct,
    operation: PlatformMakerStrandPrepareInput | PlatformMakerCurrentPrepareInput,
    present: boolean,
    timeoutMs: number,
    pollMs: number,
    signature: string,
  ): Promise<PlatformMakerStatusResponse> {
    const deadline = Date.now() + timeoutMs;
    do {
      try {
        const status = await this.makerStatus(marketId, makerWallet);
        const observed = present
          ? makerProductMatches(status, product, operation)
          : !makerProductPresent(status, product);
        if (observed) return status;
      } catch (error) {
        if (!(error instanceof StrataApiError) || !error.retryable) throw error;
      }
      await delay(Math.min(pollMs, Math.max(0, deadline - Date.now())));
    } while (Date.now() < deadline);
    throw new StrataContractError(
      `maker transaction ${signature} was submitted but not observed within ${timeoutMs}ms`,
    );
  }

  private async makerCurrentPrepare(
    marketId: string,
    request: PlatformMakerCurrentPrepareInput,
  ): Promise<PlatformMakerControlPrepareResponse> {
    await this.requireCapability("mm.current.manage", "submit");
    const id = checkedMarketId(marketId);
    const wire = makerCurrentPrepareWire(request);
    const response = platformMakerControlPrepareResponse(
      await this.post(`/v2/markets/${id}/makers/currents/prepare?transaction_version=0`, wire.body),
    );
    assertMakerControlPrepare(response, id, wire.makerWallet, "current", wire.action);
    return response;
  }

  private async makerControlSubmit(
    marketId: string,
    productPath: "strands" | "currents",
    product: PlatformMakerControlProduct,
    request: PlatformMakerControlSubmitInput,
  ): Promise<PlatformMakerControlSubmitResponse> {
    await this.requireCapability(`mm.${product}.manage`, "submit");
    const id = checkedMarketId(marketId);
    const controlId = checkedHandle(request.makerControlId, "makerControlId", "mc_");
    const signedTransactionBase64 = request.signedTransactionBase64.trim();
    decodeBase64(signedTransactionBase64);
    const response = platformMakerControlSubmitResponse(
      await this.post(`/v2/markets/${id}/makers/${productPath}/submit`, {
        maker_control_id: controlId,
        signed_transaction_base64: signedTransactionBase64,
        idempotency_key: normalizeIdempotencyKey(request.idempotencyKey),
      }),
    );
    assertMarket(response.market_id, id);
    if (response.maker_control_id !== controlId || response.product !== product) {
      throw new StrataContractError("maker-control receipt does not match the submission");
    }
    return response;
  }

  private async makerStatus(
    marketId: string,
    maker: PlatformMakerIdentity,
  ): Promise<PlatformMakerStatusResponse> {
    await this.requireReadCapability("mm.status.read", "http");
    const id = checkedMarketId(marketId);
    // Public by wallet address: no signature is sent.
    return this.readMakerStatus(id, makerWalletAddress(maker));
  }

  private async makerStatusAuthorized(
    request: PlatformMakerStatusAuthorizedInput,
  ): Promise<PlatformMakerStatusResponse> {
    await this.requireReadCapability("mm.status.read", "http");
    const id = checkedMarketId(request.marketId);
    const wallet = canonicalPublicKey(request.walletAddress, "walletAddress");
    if (!Number.isSafeInteger(request.authorizationTimeMs) || request.authorizationTimeMs < 0) {
      throw new TypeError("authorizationTimeMs must be a non-negative safe integer");
    }
    return this.readMakerStatus(
      id,
      wallet,
      request.authorizationTimeMs,
      checkedHexSignature(request.authorizationSignature, "authorizationSignature"),
    );
  }

  private async readMakerStatus(
    marketId: string,
    walletAddress: string,
    authorizationTimeMs?: number,
    authorizationSignature?: string,
  ): Promise<PlatformMakerStatusResponse> {
    const response = platformMakerStatusResponse(await this.get(
      `/v2/markets/${marketId}/makers/${walletAddress}`,
      authorizationSignature === undefined
        ? {}
        : {
          "X-Strata-Auth-Time": String(authorizationTimeMs),
          "X-Strata-Auth-Signature": authorizationSignature,
        },
    ));
    assertMarket(response.market_id, marketId);
    if (response.wallet_address !== walletAddress) {
      throw new StrataContractError("maker status wallet does not match signed request");
    }
    return response;
  }

  private async makerReputation(
    marketId: string,
    maker: PlatformMakerIdentity,
  ): Promise<PlatformMakerReputationResponse> {
    await this.requireReadCapability("mm.reputation.read", "http");
    const id = checkedMarketId(marketId);
    // Public by wallet address: no signature is sent.
    return this.readMakerReputation(id, makerWalletAddress(maker));
  }

  private async makerReputationAuthorized(
    request: PlatformMakerReputationAuthorizedInput,
  ): Promise<PlatformMakerReputationResponse> {
    await this.requireReadCapability("mm.reputation.read", "http");
    const id = checkedMarketId(request.marketId);
    const wallet = canonicalPublicKey(request.walletAddress, "walletAddress");
    if (!Number.isSafeInteger(request.authorizationTimeMs) || request.authorizationTimeMs < 0) {
      throw new TypeError("authorizationTimeMs must be a non-negative safe integer");
    }
    return this.readMakerReputation(
      id,
      wallet,
      request.authorizationTimeMs,
      checkedHexSignature(request.authorizationSignature, "authorizationSignature"),
    );
  }

  private async readMakerReputation(
    marketId: string,
    walletAddress: string,
    authorizationTimeMs?: number,
    authorizationSignature?: string,
  ): Promise<PlatformMakerReputationResponse> {
    const response = platformMakerReputationResponse(await this.get(
      `/v2/markets/${marketId}/makers/${walletAddress}/reputation`,
      authorizationSignature === undefined
        ? {}
        : {
          "X-Strata-Auth-Time": String(authorizationTimeMs),
          "X-Strata-Auth-Signature": authorizationSignature,
        },
    ));
    assertMarket(response.market_id, marketId);
    if (response.wallet_address !== walletAddress) {
      throw new StrataContractError("maker reputation wallet does not match signed request");
    }
    return response;
  }

  private async subscribeMaker(
    marketId: string,
    maker: PlatformMakerIdentity,
    handlers: PlatformMakerHandlers,
    options: PlatformMakerSubscriptionOptions = {},
  ): Promise<PlatformMakerSubscription> {
    await this.requireReadCapability("mm.fills.stream", "websocket");
    const id = checkedMarketId(marketId);
    return subscribePlatformMaker(this.apiBase, id, maker, handlers, options);
  }

  private async subscribeAccount(
    signer: PlatformAccountSigner,
    handlers: PlatformAccountHandlers,
    options: PlatformAccountSubscribeOptions = {},
  ): Promise<PlatformAccountSubscription> {
    await this.requireReadCapability("account.stream", "websocket");
    const authorizedSigner = checkedAccountSigner(signer);
    const marketIds = await this.accountMarketIds(options.marketIds);
    const { marketIds: _marketIds, ...streamOptions } = options;
    return subscribePlatformAccount(
      this.apiBase,
      marketIds,
      authorizedSigner,
      handlers,
      streamOptions,
    );
  }

  private async orderChallenge(
    marketId: string,
    request: PlatformOrderChallengeInput,
  ): Promise<PlatformOrderChallengeResponse> {
    await this.requireCapability("orders.prepare", "prepare");
    const id = checkedMarketId(marketId);
    const body = orderOperationWire(request);
    const response = platformOrderChallengeResponse(
      await this.post(`/v2/markets/${id}/orders/challenge`, body),
    );
    assertMarket(response.market_id, id);
    if (response.action !== request.action) {
      throw new StrataContractError("order challenge action does not match request");
    }
    return response;
  }

  private async orderPrepare(
    marketId: string,
    request: PlatformOrderPrepareInput,
  ): Promise<PlatformOrderPrepareResponse> {
    await this.requireCapability("orders.prepare", "prepare");
    const id = checkedMarketId(marketId);
    // Direct: the operation itself is bound and built in one step; the
    // session's signature over the returned transaction is the authorization.
    const body = "operation" in request
      ? orderOperationWire(request.operation)
      : {
        challenge_id: checkedHandle(request.challengeId, "challengeId", "oc_"),
        authorization_signature: checkedBase58Signature(
          request.authorizationSignature,
          "authorizationSignature",
        ),
      };
    const response = platformOrderPrepareResponse(
      await this.post(`/v2/markets/${id}/orders/prepare`, body),
    );
    assertMarket(response.market_id, id);
    if ("operation" in request && response.action !== request.operation.action) {
      throw new StrataContractError("prepared order action does not match request");
    }
    return response;
  }

  private async orderSubmit(
    marketId: string,
    request: PlatformOrderSubmitInput,
  ): Promise<PlatformOrderSubmitResponse> {
    await this.requireCapability("orders.submit", "submit");
    const id = checkedMarketId(marketId);
    const orderControlId = checkedHandle(
      request.orderControlId,
      "orderControlId",
      "or_",
    );
    const signedTransactionBase64 = request.signedTransactionBase64.trim();
    decodeBase64(signedTransactionBase64);
    const response = platformOrderSubmitResponse(
      await this.post(`/v2/markets/${id}/orders/submit`, {
        order_control_id: orderControlId,
        signed_transaction_base64: signedTransactionBase64,
        idempotency_key: normalizeIdempotencyKey(request.idempotencyKey),
      }),
    );
    assertMarket(response.market_id, id);
    if (response.order_control_id !== orderControlId) {
      throw new StrataContractError("order receipt does not match submitted control ID");
    }
    return response;
  }

  private async orderStatus(
    marketId: string,
    request: PlatformOrderStatusInput,
  ): Promise<PlatformOrderStatusResponse> {
    await this.requireCapability("orders.submit", "submit");
    const id = checkedMarketId(marketId);
    const orderControlId = checkedHandle(
      request.orderControlId,
      "orderControlId",
      "or_",
    );
    const response = platformOrderStatusResponse(
      await this.post(`/v2/markets/${id}/orders/status`, {
        order_control_id: orderControlId,
        idempotency_key: normalizeIdempotencyKey(request.idempotencyKey),
      }),
    );
    assertMarket(response.market_id, id);
    if (response.order_control_id !== orderControlId) {
      throw new StrataContractError("order status does not match control ID");
    }
    return response;
  }

  private async executeOrder(
    marketId: string,
    request: PlatformOrderExecuteInput,
  ): Promise<PlatformOrderSubmitResponse> {
    if (request.verifyTransaction !== undefined && typeof request.verifyTransaction !== "function") {
      throw new TypeError("verifyTransaction must be a function when supplied");
    }
    const signerPublicKey = canonicalPublicKey(request.signer.publicKey, "signer.publicKey");
    if (typeof request.signer.signTransaction !== "function") {
      throw new TypeError("signer must provide signTransaction");
    }
    const id = checkedMarketId(marketId);
    const operation = {
      ...request.operation,
      sessionPublicKey: signerPublicKey,
    } as PlatformOrderChallengeInput;
    // One signature: the operation is bound and built in one step and the
    // session signs only the resulting transaction, after the SDK has decoded
    // it and checked it is exactly this operation.
    const prepared = await this.orderPrepare(id, { operation });
    const ownerWallet = canonicalPublicKey(request.operation.ownerWallet, "ownerWallet");
    const verification: PlatformOrderVerificationContext = {
      operation,
      marketId: id,
      prepared,
      ownerWallet,
      sessionPublicKey: signerPublicKey,
    };
    if (request.verifyTransaction) {
      await request.verifyTransaction(verification);
    } else {
      await verifyOrderTransaction({
        marketId: id,
        operation,
        prepared,
        ownerWallet,
        sessionPublicKey: signerPublicKey,
      });
    }
    const signedTransactionBase64 = await request.signer.signTransaction(
      prepared.transaction_base64,
    );
    decodeBase64(signedTransactionBase64);
    verifySignedTransactionMessage(prepared.transaction_base64, signedTransactionBase64);
    return this.orderSubmit(marketId, {
      orderControlId: prepared.order_control_id,
      signedTransactionBase64,
      idempotencyKey: request.idempotencyKey ?? prepared.order_control_id,
    });
  }

  private async connectOrders(
    marketId: string,
    ownerWallet: string,
    signer: StrataSessionSigner,
    handlers: PlatformOrderCommandHandlers = {},
    options: PlatformOrderCommandOptions = {},
  ): Promise<PlatformOrderCommandConnection> {
    await Promise.all([
      this.requireCapability("orders.prepare", "prepare", "websocket"),
      this.requireCapability("orders.submit", "submit", "websocket"),
    ]);
    return connectPlatformOrderCommands(
      this.apiBase,
      checkedMarketId(marketId),
      ownerWallet,
      signer,
      handlers,
      options,
    );
  }

  private async accountMarketIds(requested?: readonly string[]): Promise<readonly string[]> {
    if (requested !== undefined) {
      if (requested.length === 0) throw new TypeError("marketIds must not be empty");
      return [...new Set(requested.map(checkedMarketId))];
    }
    const marketIds: string[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.listMarkets(
        cursor === undefined ? { limit: MAX_PAGE_SIZE } : { cursor, limit: MAX_PAGE_SIZE },
      );
      marketIds.push(...response.markets.map((market) => checkedMarketId(market.market_id)));
      cursor = response.page.next_cursor ?? undefined;
      if (response.page.has_more && cursor === undefined) {
        throw new StrataContractError("market discovery pagination is incomplete");
      }
    } while (cursor !== undefined);
    if (marketIds.length === 0) throw new StrataContractError("no live markets are discoverable");
    return [...new Set(marketIds)];
  }

  private async requireReadCapability(
    capabilityId: string,
    transport: "http" | "websocket" = "http",
  ): Promise<PlatformDiscoveryResponse> {
    const discovery = await this.readDiscovery(false);
    const capability = discovery.capabilities.find((item) => item.id === capabilityId);
    if (!capability || capability.risk !== "read" || !capability.transports.includes(transport)) {
      throw new StrataContractError(`live capability is not available: ${capabilityId}`);
    }
    return discovery;
  }

  private async requireCapability(
    capabilityId: string,
    risk: "prepare" | "submit" | "destructive",
    transport: "http" | "websocket" = "http",
  ): Promise<PlatformDiscoveryResponse> {
    const discovery = await this.readDiscovery(false);
    const capability = discovery.capabilities.find((item) => item.id === capabilityId);
    if (!capability || capability.risk !== risk || !capability.transports.includes(transport)) {
      throw new StrataContractError(`live capability is not available: ${capabilityId}`);
    }
    return discovery;
  }

  private async get(path: string, headers: Record<string, string> = {}): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${this.apiBase}${path}`, {
        method: "GET",
        headers: { Accept: "application/json", ...headers },
        signal: controller.signal,
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok) {
        const error = parsePublicError(body);
        throw new StrataApiError(
          response.status,
          error?.code ?? "request_failed",
          error?.message ?? "Strata could not complete the request.",
          error?.retryable ?? response.status >= 500,
        );
      }
      return body;
    } catch (error) {
      if (error instanceof StrataApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new StrataApiError(0, "timeout", "Strata request timed out.", true);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${this.apiBase}${path}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let value: unknown;
      try {
        value = await response.json();
      } catch {
        value = null;
      }
      if (!response.ok) {
        const error = parsePublicError(value);
        throw new StrataApiError(
          response.status,
          error?.code ?? "request_failed",
          error?.message ?? "Strata could not complete the request.",
          error?.retryable ?? response.status >= 500,
        );
      }
      return value;
    } catch (error) {
      if (error instanceof StrataApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new StrataApiError(0, "timeout", "Strata request timed out.", true);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * `account_sequence` only when the caller pinned one; an omitted sequence stays
 * omitted on the wire so Strata resolves it from the Vault's confirmed market
 * account.
 */
function optionalAccountSequence(
  value: string | bigint | undefined,
): { readonly account_sequence?: string } {
  return value === undefined
    ? {}
    : { account_sequence: checkedAtomic(value, "accountSequence", true) };
}

/** The wire body of one order-control operation (challenge or direct prepare). */
function orderOperationWire(request: PlatformOrderChallengeInput): Record<string, unknown> {
  const ownerWallet = canonicalPublicKey(request.ownerWallet, "ownerWallet");
  const sessionPublicKey = canonicalPublicKey(request.sessionPublicKey, "sessionPublicKey");
  if (ownerWallet === sessionPublicKey) {
    throw new TypeError("sessionPublicKey must be distinct from ownerWallet");
  }
  if (request.action === "place") {
    return {
      action: "place",
      owner_wallet: ownerWallet,
      session_public_key: sessionPublicKey,
      ...orderPlaceWire(request),
    };
  }
  if (request.action === "cancel") {
    return {
      action: "cancel",
      owner_wallet: ownerWallet,
      session_public_key: sessionPublicKey,
      order_id: checkedOrderId(request.orderId),
    };
  }
  if (request.action === "cancel_all") {
    return {
      action: "cancel_all",
      owner_wallet: ownerWallet,
      session_public_key: sessionPublicKey,
    };
  }
  if (request.action === "replace") {
    return {
      action: "replace",
      owner_wallet: ownerWallet,
      session_public_key: sessionPublicKey,
      order_id: checkedOrderId(request.orderId),
      ...orderPlaceWire(request),
    };
  }
  if (request.action === "batch") {
    if (request.operations.length < 1 || request.operations.length > 6) {
      throw new TypeError("order batch must contain between one and six operations");
    }
    return {
      action: "batch",
      owner_wallet: ownerWallet,
      session_public_key: sessionPublicKey,
      operations: request.operations.map((operation) => {
        if (operation.action === "place") {
          return { action: "place", ...orderPlaceWire(operation) };
        }
        if (operation.action === "cancel") {
          return { action: "cancel", order_id: checkedOrderId(operation.orderId) };
        }
        return {
          action: "replace",
          order_id: checkedOrderId(operation.orderId),
          ...orderPlaceWire(operation),
        };
      }),
    };
  }
  throw new TypeError("order action is invalid");
}

/** The wire body of one TWAP action (challenge or direct prepare). */
function twapOperationWire(request: PlatformTwapChallengeInput): Record<string, unknown> {
  const ownerWallet = canonicalPublicKey(request.ownerWallet, "ownerWallet");
  const sessionPublicKey = canonicalPublicKey(request.sessionPublicKey, "sessionPublicKey");
  if (ownerWallet === sessionPublicKey) {
    throw new TypeError("sessionPublicKey must be distinct from ownerWallet");
  }
  if (request.action === "place") {
    if (request.side !== "buy" && request.side !== "sell") {
      throw new TypeError("side must be buy or sell");
    }
    checkedInteger(request.slicesTotal, "slicesTotal", 2, 120);
    checkedInteger(request.maximumToleranceBps, "maximumToleranceBps", 1, 1_000);
    checkedInteger(request.intervalSlots, "intervalSlots", 25, 4_500);
    return {
      action: "place",
      owner_wallet: ownerWallet,
      session_public_key: sessionPublicKey,
      side: request.side,
      total_size_atoms: checkedAtomic(request.totalSizeAtoms, "totalSizeAtoms", false),
      slices_total: request.slicesTotal,
      maximum_tolerance_bps: request.maximumToleranceBps,
      interval_slots: request.intervalSlots,
      limit_price_atoms: checkedAtomic(request.limitPriceAtoms, "limitPriceAtoms", false),
    };
  }
  return {
    action: "cancel",
    owner_wallet: ownerWallet,
    session_public_key: sessionPublicKey,
    twap_id: checkedTwapId(request.twapId),
  };
}

function orderPlaceWire(operation: {
  readonly accountSequence?: string | bigint;
  readonly clientOrderId: string;
  readonly side: string;
  readonly orderType: string;
  readonly limitPriceAtoms: string | bigint;
  readonly sizeAtoms: string | bigint;
}): Record<string, unknown> {
  if (operation.side !== "buy" && operation.side !== "sell") {
    throw new TypeError("side must be buy or sell");
  }
  if (operation.orderType !== "good_until_cancelled" && operation.orderType !== "post_only") {
    throw new TypeError("resting orderType must be good_until_cancelled or post_only");
  }
  return {
    ...optionalAccountSequence(operation.accountSequence),
    client_order_id: checkedOpaqueInput(operation.clientOrderId, "clientOrderId"),
    side: operation.side,
    order_type: operation.orderType,
    limit_price_atoms: checkedAtomic(operation.limitPriceAtoms, "limitPriceAtoms", false),
    size_atoms: checkedAtomic(operation.sizeAtoms, "sizeAtoms", false),
  };
}

interface MakerPrepareWire {
  readonly body: Record<string, unknown>;
  readonly makerWallet: string;
  readonly action: PlatformMakerControlAction;
}

function makerStrandPrepareWire(request: PlatformMakerStrandPrepareInput): MakerPrepareWire {
  const makerWallet = canonicalPublicKey(request.makerWallet, "makerWallet");
  if (request.action === "upsert") {
    const bidOffsets = checkedFixedIntegers(request.bidOffsetsTicks, "bidOffsetsTicks", 16, 0, 65_535);
    const askOffsets = checkedFixedIntegers(request.askOffsetsTicks, "askOffsetsTicks", 16, 0, 65_535);
    const bidSizes = checkedFixedAtomics(request.bidSizesBaseAtoms, "bidSizesBaseAtoms", 16);
    const askSizes = checkedFixedAtomics(request.askSizesBaseAtoms, "askSizesBaseAtoms", 16);
    if (![...bidSizes, ...askSizes].some((size) => size !== "0")) {
      throw new TypeError("Strand requires at least one non-zero level");
    }
    if (
      bidOffsets.some((offset, index) => offset === 0 && bidSizes[index] !== "0")
      || askOffsets.some((offset, index) => offset === 0 && askSizes[index] !== "0")
    ) {
      throw new TypeError("active Strand levels require positive offsets");
    }
    return {
      makerWallet,
      action: "strand_upsert",
      body: {
        action: "upsert",
        maker_wallet: makerWallet,
        enabled: checkedBoolean(request.enabled, "enabled"),
        async_only: checkedBoolean(request.asyncOnly, "asyncOnly"),
        sync_spread_ticks: checkedInteger(request.syncSpreadTicks, "syncSpreadTicks", 0, 65_535),
        mid_price_atoms: checkedAtomic(request.midPriceAtoms, "midPriceAtoms", false),
        max_exposure_base_atoms: checkedAtomic(
          request.maxExposureBaseAtoms,
          "maxExposureBaseAtoms",
          false,
        ),
        bid_offsets_ticks: bidOffsets,
        ask_offsets_ticks: askOffsets,
        bid_sizes_base_atoms: bidSizes,
        ask_sizes_base_atoms: askSizes,
        valid_until_slot: checkedAtomic(request.validUntilSlot, "validUntilSlot", true),
      },
    };
  }
  if (request.action === "recenter") {
    return {
      makerWallet,
      action: "strand_recenter",
      body: {
        action: "recenter",
        maker_wallet: makerWallet,
        new_mid_price_atoms: checkedAtomic(request.newMidPriceAtoms, "newMidPriceAtoms", false),
        valid_until_slot: checkedAtomic(request.validUntilSlot, "validUntilSlot", true),
      },
    };
  }
  if (request.action === "set_enabled") {
    return {
      makerWallet,
      action: "strand_set_enabled",
      body: {
        action: "set_enabled",
        maker_wallet: makerWallet,
        enabled: checkedBoolean(request.enabled, "enabled"),
      },
    };
  }
  if (request.action === "cancel") {
    return {
      makerWallet,
      action: "strand_cancel",
      body: { action: "cancel", maker_wallet: makerWallet },
    };
  }
  throw new TypeError("Strand action is invalid");
}

function makerCurrentPrepareWire(request: PlatformMakerCurrentPrepareInput): MakerPrepareWire {
  const makerWallet = canonicalPublicKey(request.makerWallet, "makerWallet");
  if (request.action === "cancel") {
    return {
      makerWallet,
      action: "current_cancel",
      body: { action: "cancel", maker_wallet: makerWallet },
    };
  }
  if (request.action !== "upsert") throw new TypeError("Current action is invalid");
  const bidDepth = checkedFixedAtomics(request.bidDepthBaseAtoms, "bidDepthBaseAtoms", 8);
  const askDepth = checkedFixedAtomics(request.askDepthBaseAtoms, "askDepthBaseAtoms", 8);
  if (![...bidDepth, ...askDepth].some((depth) => depth !== "0")) {
    throw new TypeError("Current requires at least one non-zero depth band");
  }
  return {
    makerWallet,
    action: "current_upsert",
    body: {
      action: "upsert",
      maker_wallet: makerWallet,
      enabled: checkedBoolean(request.enabled, "enabled"),
      async_only: checkedBoolean(request.asyncOnly, "asyncOnly"),
      half_spread_bps: checkedInteger(request.halfSpreadBps, "halfSpreadBps", 1, 65_535),
      band_step_bps: checkedInteger(request.bandStepBps, "bandStepBps", 0, 65_535),
      max_conf_bps: checkedInteger(request.maxConfidenceBps, "maxConfidenceBps", 1, 100),
      max_oracle_dev_bps: checkedInteger(
        request.maxOracleDeviationBps,
        "maxOracleDeviationBps",
        1,
        500,
      ),
      max_oracle_age_secs: checkedInteger(
        request.maxOracleAgeSeconds,
        "maxOracleAgeSeconds",
        0,
        4_294_967_295,
      ),
      sync_spread_bps: checkedInteger(request.syncSpreadBps, "syncSpreadBps", 0, 65_535),
      max_exposure_base_atoms: checkedAtomic(
        request.maxExposureBaseAtoms,
        "maxExposureBaseAtoms",
        false,
      ),
      bid_depth_base_atoms: bidDepth,
      ask_depth_base_atoms: askDepth,
      valid_until_slot: checkedAtomic(request.validUntilSlot, "validUntilSlot", true),
    },
  };
}

function assertMakerControlPrepare(
  response: PlatformMakerControlPrepareResponse,
  marketId: string,
  makerWallet: string,
  product: PlatformMakerControlProduct,
  action: PlatformMakerControlAction,
): void {
  assertMarket(response.market_id, marketId);
  if (
    response.maker_wallet !== makerWallet
    || response.product !== product
    || response.action !== action
  ) {
    throw new StrataContractError("prepared maker control changed the requested binding");
  }
}

/** A maker identity is a wallet address or a signer whose public key names it. */
function makerWalletAddress(maker: PlatformMakerIdentity): string {
  if (typeof maker === "string") return canonicalPublicKey(maker, "walletAddress");
  if (!maker || typeof maker !== "object" || typeof maker.publicKey !== "string") {
    throw new TypeError("maker must be a wallet address or a signer with publicKey");
  }
  return canonicalPublicKey(maker.publicKey, "maker.publicKey");
}

function checkedMarketId(value: string): string {
  const marketId = value.trim();
  if (!/^market_[0-9a-f]{32}$/.test(marketId)) {
    throw new TypeError("marketId must be an opaque Strata market ID");
  }
  return marketId;
}

function checkedAssetId(value: string, field: string): string {
  const assetId = value.trim();
  if (!/^asset_[0-9a-f]{32}$/.test(assetId)) {
    throw new TypeError(`${field} must be an opaque Strata asset ID`);
  }
  return assetId;
}

function checkedAtomic(
  value: string | bigint,
  field: string,
  allowZero: boolean,
): string {
  const normalized = typeof value === "bigint" ? value.toString() : value.trim();
  if (!/^(?:0|[1-9][0-9]*)$/.test(normalized) || (!allowZero && normalized === "0")) {
    throw new TypeError(`${field} must be a canonical unsigned atomic value`);
  }
  return normalized;
}

function checkedOpaqueInput(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 64 || !/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new TypeError(`${field} must contain 1-64 URL-safe characters`);
  }
  return normalized;
}

function checkedOrderId(value: string): string {
  const orderId = value.trim();
  if (!/^order_[0-9a-f]{32}$/.test(orderId)) {
    throw new TypeError("orderId must be an opaque Strata order ID");
  }
  return orderId;
}

function checkedTwapId(value: string): string {
  const twapId = value.trim();
  if (!/^twap_[0-9a-f]{32}$/.test(twapId)) {
    throw new TypeError("twapId must be an opaque Strata TWAP ID");
  }
  return twapId;
}

function checkedInteger(
  value: number,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function checkedBoolean(value: boolean, field: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${field} must be boolean`);
  return value;
}

function checkedFixedIntegers(
  values: readonly number[],
  field: string,
  length: number,
  minimum: number,
  maximum: number,
): number[] {
  if (!Array.isArray(values) || values.length !== length) {
    throw new TypeError(`${field} must contain exactly ${length} values`);
  }
  return values.map((value, index) =>
    checkedInteger(value, `${field}[${index}]`, minimum, maximum));
}

function checkedFixedAtomics(
  values: readonly (string | bigint)[],
  field: string,
  length: number,
): string[] {
  if (!Array.isArray(values) || values.length !== length) {
    throw new TypeError(`${field} must contain exactly ${length} values`);
  }
  return values.map((value, index) => checkedAtomic(value, `${field}[${index}]`, true));
}

function checkedHandle(
  value: string,
  field: string,
  prefix: "oc_" | "or_" | "twc_" | "twctl_" | "vp_" | "mc_",
): string {
  const handle = value.trim();
  if (!new RegExp(`^${prefix}[0-9a-f]{32}$`).test(handle)) {
    throw new TypeError(`${field} must be an opaque Strata handle`);
  }
  return handle;
}

function checkedBase58Signature(value: string, field: string): string {
  const signature = value.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) {
    throw new TypeError(`${field} must be a canonical base58 Ed25519 signature`);
  }
  return signature;
}

function checkedHexSignature(value: string, field: string): string {
  const signature = value.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(signature)) {
    throw new TypeError(`${field} must be a 64-byte hexadecimal Ed25519 signature`);
  }
  return signature;
}

function checkedBugMessage(value: string): string {
  const message = value.trim();
  const length = [...message].length;
  if (length < 1 || length > 2_000) {
    throw new TypeError("bug message must contain between 1 and 2000 characters");
  }
  return message;
}

export function bugAuthorizationPayload(message: string): Uint8Array {
  return new TextEncoder().encode(`strata-bug-report:v1:${checkedBugMessage(message)}`);
}

function checkedReferralCode(value: string): string {
  const code = value.trim();
  if (code.length < 1 || code.length > 64 || !/^[A-Za-z0-9_-]+$/.test(code)) {
    throw new TypeError("referralCode must contain 1-64 letters, numbers, underscores, or dashes");
  }
  return code;
}

export function referralLinkAuthorizationPayload(referralCode: string): Uint8Array {
  return new TextEncoder().encode(`strata-referral:v1:${checkedReferralCode(referralCode)}`);
}

export function referralClaimAuthorizationPayload(payoutWalletAddress: string): Uint8Array {
  const payout = canonicalPublicKey(payoutWalletAddress, "payoutWalletAddress");
  return new TextEncoder().encode(`strata-referral-claim:v1:${payout}`);
}

function assertMarket(actual: string, expected: string): void {
  if (actual !== expected) throw new StrataContractError("response market does not match request");
}

function depthQuery(request: PlatformBookRequest): string {
  if (request.depth === undefined) return "";
  if (!Number.isSafeInteger(request.depth) || request.depth < 1 || request.depth > 2_000) {
    throw new TypeError("depth must be an integer between 1 and 2000");
  }
  return `?depth=${request.depth}`;
}

function tradesQuery(request: PlatformTradesRequest): string {
  if (request.limit === undefined) return "";
  if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 500) {
    throw new TypeError("limit must be an integer between 1 and 500");
  }
  return `?limit=${request.limit}`;
}

function checkedFillLimit(value: number | undefined): number {
  if (value === undefined) return 100;
  if (!Number.isSafeInteger(value) || value < 1 || value > 200) {
    throw new TypeError("fillLimit must be an integer between 1 and 200");
  }
  return value;
}

function fillLimitQuery(value: number | undefined): string {
  if (value === undefined) return "";
  return `?fill_limit=${checkedFillLimit(value)}`;
}

function checkedAccountSigner(signer: PlatformAccountSigner): PlatformAccountSigner {
  if (!signer || typeof signer !== "object" || typeof signer.signMessage !== "function") {
    throw new TypeError("account signer must provide publicKey and signMessage");
  }
  const publicKey = signer.publicKey?.trim();
  if (!publicKey || publicKey.length < 32 || publicKey.length > 44 || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(publicKey)) {
    throw new TypeError("account signer publicKey must be a base58 wallet address");
  }
  if (publicKey === signer.publicKey) return signer;
  return { publicKey, signMessage: (message) => signer.signMessage(message) };
}

export function makerStatusAuthMessage(
  marketId: string,
  walletAddress: string,
  authorizationTimeMs: number,
): Uint8Array {
  const market = checkedMarketId(marketId);
  const wallet = canonicalPublicKey(walletAddress, "walletAddress");
  if (!Number.isSafeInteger(authorizationTimeMs) || authorizationTimeMs < 0) {
    throw new TypeError("authorizationTimeMs must be a non-negative safe integer");
  }
  return new TextEncoder().encode(
    `strata:mm-status-read:v2\n${market}\n${wallet}\n${authorizationTimeMs}`,
  );
}

export function makerReputationAuthMessage(
  marketId: string,
  walletAddress: string,
  authorizationTimeMs: number,
): Uint8Array {
  const market = checkedMarketId(marketId);
  const wallet = canonicalPublicKey(walletAddress, "walletAddress");
  if (!Number.isSafeInteger(authorizationTimeMs) || authorizationTimeMs < 0) {
    throw new TypeError("authorizationTimeMs must be a non-negative safe integer");
  }
  return new TextEncoder().encode(
    `strata:mm-reputation-read:v2\n${market}\n${wallet}\n${authorizationTimeMs}`,
  );
}

function pageQuery(request: PageRequest): string {
  const query = new URLSearchParams();
  if (request.limit !== undefined) {
    if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > MAX_PAGE_SIZE) {
      throw new TypeError(`limit must be an integer between 1 and ${MAX_PAGE_SIZE}`);
    }
    query.set("limit", String(request.limit));
  }
  if (request.cursor !== undefined) {
    const cursor = request.cursor.trim();
    if (cursor.length === 0 || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
      throw new TypeError("cursor must be a non-empty opaque URL-safe value");
    }
    query.set("cursor", cursor);
  }
  const value = query.toString();
  return value ? `?${value}` : "";
}

function parsePublicError(value: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} | undefined {
  if (!value || typeof value !== "object") return undefined;
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== "object") return undefined;
  const fields = error as Record<string, unknown>;
  if (
    typeof fields.code !== "string"
    || typeof fields.message !== "string"
    || typeof fields.retryable !== "boolean"
  ) {
    return undefined;
  }
  return {
    code: fields.code,
    message: fields.message,
    retryable: fields.retryable,
  };
}

export async function validateOrderAuthorization(
  challenge: PlatformOrderChallengeResponse,
  operation: PlatformOrderExecuteOperation,
  sessionPublicKey: string,
): Promise<Uint8Array> {
  const bytes = decodeBase64(challenge.authorization_payload_base64);
  const encoder = new TextEncoder();
  let cursor = 0;
  const domain = encoder.encode("strata-platform-order-control:v1\0");
  expectBytes(bytes, cursor, domain, "order authorization domain");
  cursor += domain.length;
  cursor += 32; // Canonical market identity; the public API intentionally exposes only its opaque ID.
  const ownerWallet = canonicalPublicKey(operation.ownerWallet, "ownerWallet");
  expectBytes(
    bytes,
    cursor,
    base58Decode(ownerWallet, 32, "ownerWallet"),
    "order authorization owner",
  );
  cursor += 32;
  expectBytes(
    bytes,
    cursor,
    base58Decode(sessionPublicKey, 32, "sessionPublicKey"),
    "order authorization session",
  );
  cursor += 32;
  const actionByte = readByte(bytes, cursor, "order authorization action");
  cursor += 1;
  const expectedAction = operation.action === "place" ? 0
    : operation.action === "cancel" ? 1
      : operation.action === "cancel_all" ? 2
        : operation.action === "replace" ? 3 : 4;
  if (actionByte !== expectedAction || challenge.action !== operation.action) {
    throw new StrataContractError("order authorization action changed");
  }
  const derivedOrderIds: string[] = [];
  if (operation.action === "place") {
    expectAccountSequence(bytes, cursor, operation.accountSequence);
    cursor += 8;
    const clientLength = readU16(bytes, cursor, "client order ID length");
    cursor += 2;
    const clientId = encoder.encode(checkedOpaqueInput(operation.clientOrderId, "clientOrderId"));
    if (clientLength !== clientId.length) {
      throw new StrataContractError("client order ID length changed");
    }
    expectBytes(bytes, cursor, clientId, "client order ID");
    cursor += clientLength;
    const side = readByte(bytes, cursor, "order side");
    cursor += 1;
    if (side !== (operation.side === "buy" ? 0 : 1)) {
      throw new StrataContractError("order side changed");
    }
    const orderType = readByte(bytes, cursor, "order type");
    cursor += 1;
    if (orderType !== (operation.orderType === "good_until_cancelled" ? 0 : 3)) {
      throw new StrataContractError("order type changed");
    }
    expectU64Value(bytes, cursor, operation.limitPriceAtoms, "order limit price");
    cursor += 8;
    expectU64Value(bytes, cursor, operation.sizeAtoms, "order size");
    cursor += 8;
    const pda = take(bytes, cursor, 32, "order identity");
    cursor += 32;
    derivedOrderIds.push(await opaqueProductId(
      "order",
      `${challenge.market_id}:${base58Encode(pda)}`,
    ));
  } else if (operation.action === "cancel" || operation.action === "cancel_all") {
    const count = readByte(bytes, cursor, "cancel order count");
    cursor += 1;
    if (count < 1 || count > 6 || (operation.action === "cancel" && count !== 1)) {
      throw new StrataContractError("cancel order count changed");
    }
    for (let index = 0; index < count; index += 1) {
      const pda = take(bytes, cursor, 32, `cancel order ${index}`);
      cursor += 32;
      const rentSource = readByte(bytes, cursor, `cancel rent source ${index}`);
      cursor += 1;
      if (rentSource !== 0 && rentSource !== 1) {
        throw new StrataContractError("cancel rent source is invalid");
      }
      derivedOrderIds.push(await opaqueProductId(
        "order",
        `${challenge.market_id}:${base58Encode(pda)}`,
      ));
    }
    if (operation.action === "cancel" && derivedOrderIds[0] !== checkedOrderId(operation.orderId)) {
      throw new StrataContractError("cancel order identity changed");
    }
  } else if (operation.action === "replace") {
    let parsed = await validateCancelBinding(
      bytes,
      cursor,
      challenge.market_id,
      operation.orderId,
    );
    cursor = parsed.cursor;
    derivedOrderIds.push(parsed.orderId);
    parsed = await validatePlaceBinding(bytes, cursor, challenge.market_id, operation);
    cursor = parsed.cursor;
    derivedOrderIds.push(parsed.orderId);
  } else {
    const count = readByte(bytes, cursor, "batch count");
    cursor += 1;
    if (count < 1 || count > 6 || count !== operation.operations.length) {
      throw new StrataContractError("order batch count changed");
    }
    for (const item of operation.operations) {
      const tag = readByte(bytes, cursor, "batch action");
      cursor += 1;
      if (item.action === "place" && tag === 0) {
        const parsed = await validatePlaceBinding(bytes, cursor, challenge.market_id, item);
        cursor = parsed.cursor;
        derivedOrderIds.push(parsed.orderId);
      } else if (item.action === "cancel" && tag === 1) {
        const parsed = await validateCancelBinding(
          bytes,
          cursor,
          challenge.market_id,
          item.orderId,
        );
        cursor = parsed.cursor;
        derivedOrderIds.push(parsed.orderId);
      } else if (item.action === "replace" && tag === 3) {
        let parsed = await validateCancelBinding(
          bytes,
          cursor,
          challenge.market_id,
          item.orderId,
        );
        cursor = parsed.cursor;
        derivedOrderIds.push(parsed.orderId);
        parsed = await validatePlaceBinding(bytes, cursor, challenge.market_id, item);
        cursor = parsed.cursor;
        derivedOrderIds.push(parsed.orderId);
      } else {
        throw new StrataContractError("order batch action changed");
      }
    }
  }
  if (
    derivedOrderIds.length !== challenge.order_ids.length
    || derivedOrderIds.some((orderId, index) => orderId !== challenge.order_ids[index])
  ) {
    throw new StrataContractError("order authorization opaque identities changed");
  }
  cursor += 32; // Recent blockhash, verified again by the mandatory transaction verifier.
  cursor += 8; // Last valid block height.
  expectU64Value(bytes, cursor, String(challenge.expires_at_ms), "order authorization expiry");
  cursor += 8;
  const nonce = take(bytes, cursor, 16, "order authorization nonce");
  cursor += 16;
  if (hexBytes(nonce) !== challenge.challenge_id.slice(3)) {
    throw new StrataContractError("order challenge nonce changed");
  }
  cursor += 16; // Server process epoch.
  if (cursor !== bytes.length) {
    throw new StrataContractError("order authorization contains unrecognized fields");
  }
  return bytes;
}

export async function validateTwapAuthorization(
  challenge: PlatformTwapChallengeResponse,
  operation: PlatformTwapExecuteOperation,
  sessionPublicKey: string,
): Promise<Uint8Array> {
  const bytes = decodeBase64(challenge.authorization_payload_base64);
  const domain = new TextEncoder().encode("strata-twap-control:v1\0");
  let cursor = 0;
  expectBytes(bytes, cursor, domain, "TWAP authorization domain");
  cursor += domain.length;
  cursor += 64; // Canonical program and market identities stay behind the opaque market ID.
  const ownerWallet = canonicalPublicKey(operation.ownerWallet, "ownerWallet");
  expectBytes(
    bytes,
    cursor,
    base58Decode(ownerWallet, 32, "ownerWallet"),
    "TWAP authorization owner",
  );
  cursor += 32;
  expectBytes(
    bytes,
    cursor,
    base58Decode(sessionPublicKey, 32, "sessionPublicKey"),
    "TWAP authorization session",
  );
  cursor += 32;
  const action = readByte(bytes, cursor, "TWAP authorization action");
  cursor += 1;
  if (action !== (operation.action === "place" ? 0 : 1)
      || challenge.action !== operation.action) {
    throw new StrataContractError("TWAP authorization action changed");
  }
  let publicId: string;
  if (operation.action === "place") {
    const side = readByte(bytes, cursor, "TWAP side");
    cursor += 1;
    if (side !== (operation.side === "buy" ? 0 : 1)) {
      throw new StrataContractError("TWAP side changed");
    }
    expectU64Value(bytes, cursor, operation.totalSizeAtoms, "TWAP total size");
    cursor += 8;
    if (readU16(bytes, cursor, "TWAP slices") !== operation.slicesTotal) {
      throw new StrataContractError("TWAP slices changed");
    }
    cursor += 2;
    if (readU16(bytes, cursor, "TWAP tolerance") !== operation.maximumToleranceBps) {
      throw new StrataContractError("TWAP tolerance changed");
    }
    cursor += 2;
    if (readU32(bytes, cursor, "TWAP interval") !== operation.intervalSlots) {
      throw new StrataContractError("TWAP interval changed");
    }
    cursor += 4;
    expectU64Value(bytes, cursor, operation.limitPriceAtoms, "TWAP limit price");
    cursor += 8;
    cursor += 8; // Server-selected collision-resistant schedule nonce.
    const pda = take(bytes, cursor, 32, "TWAP identity");
    cursor += 32;
    publicId = await opaqueProductId("twap", base58Encode(pda));
  } else {
    const pda = take(bytes, cursor, 32, "TWAP identity");
    cursor += 32;
    publicId = await opaqueProductId("twap", base58Encode(pda));
    if (publicId !== checkedTwapId(operation.twapId)) {
      throw new StrataContractError("TWAP cancellation identity changed");
    }
  }
  if (publicId !== challenge.twap_id) {
    throw new StrataContractError("TWAP authorization opaque identity changed");
  }
  cursor += 32; // Recent blockhash, checked again by the transaction verifier.
  cursor += 8; // Last valid block height.
  expectU64Value(bytes, cursor, String(challenge.expires_at_ms), "TWAP authorization expiry");
  cursor += 8;
  const nonce = take(bytes, cursor, 16, "TWAP authorization nonce");
  cursor += 16;
  if (hexBytes(nonce) !== challenge.challenge_id.slice(4)) {
    throw new StrataContractError("TWAP challenge nonce changed");
  }
  if (cursor !== bytes.length) {
    throw new StrataContractError("TWAP authorization contains unrecognized fields");
  }
  return bytes;
}

async function validatePlaceBinding(
  bytes: Uint8Array,
  start: number,
  marketId: string,
  operation: {
    readonly accountSequence?: string | bigint;
    readonly clientOrderId: string;
    readonly side: string;
    readonly orderType: string;
    readonly limitPriceAtoms: string | bigint;
    readonly sizeAtoms: string | bigint;
  },
): Promise<{ readonly cursor: number; readonly orderId: string }> {
  const encoder = new TextEncoder();
  let cursor = start;
  expectAccountSequence(bytes, cursor, operation.accountSequence);
  cursor += 8;
  const clientLength = readU16(bytes, cursor, "client order ID length");
  cursor += 2;
  const clientId = encoder.encode(checkedOpaqueInput(operation.clientOrderId, "clientOrderId"));
  if (clientLength !== clientId.length) {
    throw new StrataContractError("client order ID length changed");
  }
  expectBytes(bytes, cursor, clientId, "client order ID");
  cursor += clientLength;
  const side = readByte(bytes, cursor, "order side");
  cursor += 1;
  if (side !== (operation.side === "buy" ? 0 : 1)) {
    throw new StrataContractError("order side changed");
  }
  const orderType = readByte(bytes, cursor, "order type");
  cursor += 1;
  if (orderType !== (operation.orderType === "good_until_cancelled" ? 0 : 3)) {
    throw new StrataContractError("order type changed");
  }
  expectU64Value(bytes, cursor, operation.limitPriceAtoms, "order limit price");
  cursor += 8;
  expectU64Value(bytes, cursor, operation.sizeAtoms, "order size");
  cursor += 8;
  const pda = take(bytes, cursor, 32, "order identity");
  cursor += 32;
  return {
    cursor,
    orderId: await opaqueProductId("order", `${marketId}:${base58Encode(pda)}`),
  };
}

async function validateCancelBinding(
  bytes: Uint8Array,
  start: number,
  marketId: string,
  expectedOrderId: string,
): Promise<{ readonly cursor: number; readonly orderId: string }> {
  let cursor = start;
  const pda = take(bytes, cursor, 32, "cancel order identity");
  cursor += 32;
  const rentSource = readByte(bytes, cursor, "cancel rent source");
  cursor += 1;
  if (rentSource !== 0 && rentSource !== 1) {
    throw new StrataContractError("cancel rent source is invalid");
  }
  const orderId = await opaqueProductId("order", `${marketId}:${base58Encode(pda)}`);
  if (orderId !== checkedOrderId(expectedOrderId)) {
    throw new StrataContractError("cancel order identity changed");
  }
  return { cursor, orderId };
}

function take(source: Uint8Array, offset: number, length: number, field: string): Uint8Array {
  const value = source.slice(offset, offset + length);
  if (value.length !== length) throw new StrataContractError(`${field} is missing`);
  return value;
}

function expectBytes(
  source: Uint8Array,
  offset: number,
  expected: Uint8Array,
  field: string,
): void {
  const actual = take(source, offset, expected.length, field);
  if (actual.some((byte, index) => byte !== expected[index])) {
    throw new StrataContractError(`${field} changed`);
  }
}

function readByte(source: Uint8Array, offset: number, field: string): number {
  const value = source[offset];
  if (value === undefined) throw new StrataContractError(`${field} is missing`);
  return value;
}

function readU16(source: Uint8Array, offset: number, field: string): number {
  take(source, offset, 2, field);
  return new DataView(source.buffer, source.byteOffset + offset, 2).getUint16(0, true);
}

function readU32(source: Uint8Array, offset: number, field: string): number {
  take(source, offset, 4, field);
  return new DataView(source.buffer, source.byteOffset + offset, 4).getUint32(0, true);
}

function readU64Value(source: Uint8Array, offset: number, field: string): bigint {
  take(source, offset, 8, field);
  return new DataView(source.buffer, source.byteOffset + offset, 8).getBigUint64(0, true);
}

function expectU64Value(
  source: Uint8Array,
  offset: number,
  expected: string | bigint,
  field: string,
): void {
  if (readU64Value(source, offset, field) !== BigInt(expected)) {
    throw new StrataContractError(`${field} changed`);
  }
}

/**
 * A pinned account sequence must match the signed authorization exactly. A
 * sequence left to Strata is accepted from it (the server resolved it from the
 * Vault's confirmed market account); every other binding is still checked.
 */
function expectAccountSequence(
  source: Uint8Array,
  offset: number,
  expected: string | bigint | undefined,
): bigint {
  const actual = readU64Value(source, offset, "order account sequence");
  if (expected !== undefined && actual !== BigInt(expected)) {
    throw new StrataContractError("order account sequence changed");
  }
  return actual;
}

function hexBytes(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function opaqueProductId(kind: "order" | "twap", value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new StrataContractError("Web Crypto is required to verify opaque product identity");
  }
  const prefix = new TextEncoder().encode(`strata-sdk-product:v1\0${kind}\0${value}`);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", prefix));
  return `${kind}_${hexBytes(digest.slice(0, 16))}`;
}

function checkedMakerProduct(value: string): PlatformMakerQuickstartProduct {
  if (value !== "strand" && value !== "current") {
    throw new TypeError("product must be strand or current");
  }
  return value;
}

function checkedMakerTransactionSigner(
  signer: PlatformMakerTransactionSigner,
): PlatformMakerTransactionSigner {
  if (!signer || typeof signer !== "object" || typeof signer.signTransaction !== "function") {
    throw new TypeError("signer must provide publicKey and signTransaction");
  }
  const publicKey = canonicalPublicKey(signer.publicKey, "signer.publicKey");
  return {
    publicKey,
    signTransaction: (transaction) => signer.signTransaction(transaction),
  };
}

function checkedOptionalTimeout(
  value: number | undefined,
  field: string,
  fallback: number,
  minimum = 1_000,
  maximum = 300_000,
): number {
  const resolved = value ?? fallback;
  return checkedInteger(resolved, field, minimum, maximum);
}

function makerDurationSlots(value: number | string | undefined): bigint {
  let seconds: number;
  if (value === undefined) {
    seconds = 600;
  } else if (typeof value === "number") {
    seconds = checkedInteger(value, "duration", 1, 604_800);
  } else {
    const match = /^([1-9][0-9]*)(s|m|h|d)$/i.exec(value.trim());
    if (!match) throw new TypeError("duration must be seconds or look like 30s, 10m, 2h, or 1d");
    const amount = Number(match[1]);
    const scale = ({ s: 1, m: 60, h: 3_600, d: 86_400 } as const)[
      match[2]!.toLowerCase() as "s" | "m" | "h" | "d"
    ];
    seconds = amount * scale;
    checkedInteger(seconds, "duration", 1, 604_800);
  }
  // Solana targets 400ms slots. Rounding up avoids expiring before the requested duration.
  return BigInt(Math.ceil(seconds * 2.5));
}

function makerMarketBaseSymbol(label: string): string | undefined {
  const [base, quote] = label.split("/", 2);
  return base?.trim() && quote?.trim() ? base.trim() : undefined;
}

function humanBaseAtoms(value: string, asset: PlatformAsset, marketLabel: string): bigint {
  const match = /^([0-9]+)(?:\.([0-9]+))?(?:\s+([A-Za-z0-9._-]+))?$/.exec(value.trim());
  const marketSymbol = makerMarketBaseSymbol(marketLabel);
  const displaySymbol = marketSymbol ?? asset.symbol;
  if (!match) throw new TypeError(`size must be an exact ${displaySymbol} amount, for example 0.01 ${displaySymbol}`);
  const symbol = match[3];
  if (
    symbol
    && symbol.toLowerCase() !== asset.symbol.toLowerCase()
    && symbol.toLowerCase() !== marketSymbol?.toLowerCase()
  ) {
    throw new TypeError(`size is denominated in ${displaySymbol}, not ${symbol}`);
  }
  const fraction = match[2] ?? "";
  if (fraction.length > asset.decimals) {
    throw new TypeError(`${asset.symbol} supports at most ${asset.decimals} decimal places`);
  }
  const atoms = BigInt(match[1]!) * (10n ** BigInt(asset.decimals))
    + BigInt((fraction + "0".repeat(asset.decimals)).slice(0, asset.decimals) || "0");
  if (atoms <= 0n || atoms > 18_446_744_073_709_551_615n) {
    throw new TypeError("size is outside the supported base-asset range");
  }
  return atoms;
}

function splitMakerSize(total: bigint, levels: number, width: number): readonly string[] {
  const active = total < BigInt(levels) ? Number(total) : levels;
  const quotient = total / BigInt(active);
  const remainder = total % BigInt(active);
  return Array.from({ length: width }, (_, index) => {
    if (index >= active) return "0";
    return (quotient + (BigInt(index) < remainder ? 1n : 0n)).toString();
  });
}

function makerQuickstartOperation(context: {
  readonly request: PlatformMakerQuickstartPrepareInput;
  readonly makerWallet: string;
  readonly product: PlatformMakerQuickstartProduct;
  readonly baseAsset: PlatformAsset;
  readonly marketLabel: string;
  readonly currentSlot: bigint;
  readonly markPriceAtoms: bigint;
  readonly tickSizeAtoms: bigint;
}): PlatformMakerStrandPrepareInput | PlatformMakerCurrentPrepareInput {
  const {
    request,
    makerWallet,
    product,
    baseAsset,
    marketLabel,
    currentSlot,
    markPriceAtoms,
    tickSizeAtoms,
  } = context;
  const spreadBps = checkedInteger(request.spreadBps, "spreadBps", 1, 5_000);
  const maximumLevels = product === "strand" ? 16 : 8;
  const levels = checkedInteger(request.levels ?? 3, "levels", 1, maximumLevels);
  const levelStepBps = checkedInteger(
    request.levelStepBps ?? spreadBps,
    "levelStepBps",
    1,
    5_000,
  );
  const furthestBps = spreadBps + (levels - 1) * levelStepBps;
  if (furthestBps > 65_535) throw new TypeError("the furthest maker level exceeds 65,535 bps");
  const side = request.side ?? "both";
  if (side !== "both" && side !== "buy" && side !== "sell") {
    throw new TypeError("side must be both, buy, or sell");
  }
  if (typeof request.asyncOnly !== "undefined" && typeof request.asyncOnly !== "boolean") {
    throw new TypeError("asyncOnly must be boolean");
  }
  const sizeAtoms = humanBaseAtoms(request.size, baseAsset, marketLabel);
  const validUntilSlot = currentSlot + makerDurationSlots(request.duration);
  if (validUntilSlot > 18_446_744_073_709_551_615n) {
    throw new TypeError("duration exceeds the supported slot range");
  }
  const width = product === "strand" ? 16 : 8;
  const depth = splitMakerSize(sizeAtoms, levels, width);
  const zero = Array(width).fill("0") as string[];
  const bids = side === "sell" ? zero : [...depth];
  const asks = side === "buy" ? zero : [...depth];
  if (product === "current") {
    return {
      action: "upsert",
      makerWallet,
      enabled: true,
      asyncOnly: request.asyncOnly ?? false,
      halfSpreadBps: spreadBps,
      bandStepBps: levelStepBps,
      maxConfidenceBps: 100,
      maxOracleDeviationBps: 500,
      maxOracleAgeSeconds: 10,
      syncSpreadBps: 0,
      maxExposureBaseAtoms: sizeAtoms.toString(),
      bidDepthBaseAtoms: bids,
      askDepthBaseAtoms: asks,
      validUntilSlot: validUntilSlot.toString(),
    };
  }
  if (tickSizeAtoms <= 0n || markPriceAtoms <= 0n) {
    throw new StrataContractError("the market mark or tick size is invalid");
  }
  const midPriceAtoms = ((markPriceAtoms + tickSizeAtoms / 2n) / tickSizeAtoms) * tickSizeAtoms;
  if (midPriceAtoms <= 0n) throw new StrataContractError("the mark rounds below one tick");
  const offsets = Array.from({ length: 16 }, (_, index) => {
    if (index >= levels) return 0;
    const bps = BigInt(spreadBps + index * levelStepBps);
    const ticks = (midPriceAtoms * bps + 10_000n * tickSizeAtoms - 1n)
      / (10_000n * tickSizeAtoms);
    if (ticks <= 0n || ticks > 65_535n) {
      throw new TypeError("a Strand level cannot be represented on this market's tick grid");
    }
    return Number(ticks);
  });
  return {
    action: "upsert",
    makerWallet,
    enabled: true,
    asyncOnly: request.asyncOnly ?? false,
    syncSpreadTicks: 0,
    midPriceAtoms: midPriceAtoms.toString(),
    maxExposureBaseAtoms: sizeAtoms.toString(),
    bidOffsetsTicks: offsets,
    askOffsetsTicks: offsets,
    bidSizesBaseAtoms: bids,
    askSizesBaseAtoms: asks,
    validUntilSlot: validUntilSlot.toString(),
  };
}

function makerProductPresent(
  status: PlatformMakerStatusResponse,
  product: PlatformMakerQuickstartProduct,
): boolean {
  return product === "strand" ? status.strands.length > 0 : status.currents.length > 0;
}

function sameAtomicArray(actual: readonly string[], expected: readonly (string | bigint)[]): boolean {
  const normalizedActual = [...actual];
  const normalizedExpected = expected.map(String);
  while (normalizedActual.at(-1) === "0") normalizedActual.pop();
  while (normalizedExpected.at(-1) === "0") normalizedExpected.pop();
  return normalizedActual.length === normalizedExpected.length
    && normalizedActual.every((value, index) => value === normalizedExpected[index]);
}

function makerProductMatches(
  status: PlatformMakerStatusResponse,
  product: PlatformMakerQuickstartProduct,
  operation: PlatformMakerStrandPrepareInput | PlatformMakerCurrentPrepareInput,
): boolean {
  if (operation.action !== "upsert") return false;
  if (product === "strand" && "midPriceAtoms" in operation) {
    return status.strands.some((strand) =>
      strand.enabled === operation.enabled
      && strand.async_only === operation.asyncOnly
      && strand.mid_price_atoms === String(operation.midPriceAtoms)
      && strand.maximum_exposure_atoms === String(operation.maxExposureBaseAtoms)
      && strand.valid_until_slot === String(operation.validUntilSlot)
      && sameAtomicArray(strand.bids.map((level) => level.size_atoms), operation.bidSizesBaseAtoms)
      && sameAtomicArray(strand.asks.map((level) => level.size_atoms), operation.askSizesBaseAtoms)
    );
  }
  if (product === "current" && "halfSpreadBps" in operation) {
    return status.currents.some((current) =>
      current.enabled === operation.enabled
      && current.async_only === operation.asyncOnly
      && current.half_spread_bps === operation.halfSpreadBps
      && current.band_step_bps === operation.bandStepBps
      && current.maximum_confidence_bps === operation.maxConfidenceBps
      && current.maximum_oracle_age_seconds === operation.maxOracleAgeSeconds
      && current.sync_spread_bps === operation.syncSpreadBps
      && current.maximum_exposure_atoms === String(operation.maxExposureBaseAtoms)
      && current.valid_until_slot === String(operation.validUntilSlot)
      && sameAtomicArray(current.bid_depth_atoms, operation.bidDepthBaseAtoms)
      && sameAtomicArray(current.ask_depth_atoms, operation.askDepthBaseAtoms)
    );
  }
  return false;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
