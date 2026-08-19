import { verifyExecutionTransaction } from "./transaction-verifier.js";
import {
  DEFAULT_API_BASE,
  DEFAULT_MAXIMUM_TOLERANCE_BPS,
  type ActionGraph,
  type CapabilityCatalog,
  type ExecuteQuoteRequest,
  type ExecutionChallengeResponse,
  type ExecutionChallengeRequest,
  type ExecutionPrepareResponse,
  type ExecutionPrepareRequest,
  type ExecutionSubmitResponse,
  type ExecutionSubmitRequest,
  type MarketsResponse,
  type QuoteRequest,
  type QuoteResponse,
  type StrataClientOptions,
} from "./types.js";
import {
  atomic,
  actionGraph,
  capabilityCatalog,
  errorResponse,
  executionChallengeResponse,
  executionPrepareResponse,
  executionSubmitResponse,
  marketsResponse,
  quoteResponse,
} from "./validation.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const BASE58_PATTERN = /^[1-9A-HJ-NP-Za-km-z]+$/;

export class StrataApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;

  constructor(status: number, code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "StrataApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export class StrataContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrataContractError";
  }
}

export class StrataClient {
  readonly apiBase: string;
  readonly timeoutMs: number;
  readonly fetch: typeof globalThis.fetch;

  constructor(options: StrataClientOptions = {}) {
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
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new TypeError("a Fetch-compatible implementation is required");
    }
    this.fetch = fetchImpl;
  }

  async capabilities(): Promise<CapabilityCatalog> {
    return capabilityCatalog(await this.get("/sonar/capabilities"));
  }

  async actionGraph(): Promise<ActionGraph> {
    return actionGraph(await this.get("/sonar/action-graph"));
  }

  async markets(): Promise<MarketsResponse> {
    return marketsResponse(await this.get("/sonar/markets"));
  }

  async quote(request: QuoteRequest): Promise<QuoteResponse> {
    if ((request.amountInAtoms === undefined) === (request.amountOutAtoms === undefined)) {
      throw new TypeError("provide exactly one of amountInAtoms or amountOutAtoms");
    }
    const exactOutput = request.amountOutAtoms !== undefined;
    const amount = normalizeAtoms(
      exactOutput ? request.amountOutAtoms! : request.amountInAtoms!,
    );
    if (BigInt(amount) === 0n) {
      throw new TypeError(
        `${exactOutput ? "amountOutAtoms" : "amountInAtoms"} must be greater than zero`,
      );
    }
    if (request.maximumToleranceBps !== undefined && request.slippageBps !== undefined) {
      throw new TypeError("use maximumToleranceBps; slippageBps is its legacy name");
    }
    const tolerance = request.maximumToleranceBps ?? request.slippageBps ?? DEFAULT_MAXIMUM_TOLERANCE_BPS;
    if (!Number.isSafeInteger(tolerance) || tolerance < 0 || tolerance > 1_000) {
      throw new TypeError("maximumToleranceBps must be an integer between 0 and 1,000");
    }
    if (request.side !== "buy" && request.side !== "sell") {
      throw new TypeError("side must be buy or sell");
    }

    const catalog = await this.markets();
    const requestedMarket = request.market.trim();
    const market = catalog.markets.find(
      (item) =>
        item.label.toLowerCase() === requestedMarket.toLowerCase()
        || item.market_pda === requestedMarket,
    );
    if (!market?.market_pda) {
      throw new StrataContractError(`market is not available: ${request.market}`);
    }
    if (!market.ready) {
      throw new StrataContractError(`Sonar quotes are not available for: ${request.market}`);
    }
    if (!market.quote_path || !validOperationPath(market.quote_path)) {
      throw new StrataContractError(`Sonar quotes are not available for: ${request.market}`);
    }
    const quote = quoteResponse(await this.post(market.quote_path, {
      market_id: market.market_pda,
      side: request.side,
      // Exactly one amount goes on the wire; an exact-output request omits
      // `amount_in_atoms` so Strata resolves it.
      ...(exactOutput ? { amount_out_atoms: amount } : { amount_in_atoms: amount }),
      maximum_tolerance_bps: tolerance,
    }));
    // An exact-output quote's floor is the requested amount with the caller's
    // tolerance applied the same way an exact-input quote applies it.
    const boundToRequest = exactOutput
      ? quote.minimum_output_atoms
        === ((BigInt(amount) * BigInt(10_000 - tolerance)) / 10_000n).toString()
      : quote.amount_in_atoms === amount;
    if (
      quote.market_id !== market.market_pda
      || quote.side !== request.side
      || quote.maximum_tolerance_bps !== tolerance
      || !boundToRequest
    ) {
      throw new StrataContractError("quote binding does not match the request");
    }
    return quote;
  }

  async executionChallenge(
    request: ExecutionChallengeRequest,
  ): Promise<ExecutionChallengeResponse> {
    const executionPath = await this.executionPath(request.market);
    const quoteId = normalizeHandle(request.quoteId, "quoteId", "sq_");
    const ownerWallet = canonicalPublicKey(request.ownerWallet, "ownerWallet");
    const sessionPublicKey = canonicalPublicKey(request.sessionPublicKey, "sessionPublicKey");
    const accountSequence = request.accountSequence === undefined
      ? undefined
      : normalizeAtoms(request.accountSequence);
    const challenge = executionChallengeResponse(await this.post(`${executionPath}/challenge`, {
      quote_id: quoteId,
      owner_wallet: ownerWallet,
      session_public_key: sessionPublicKey,
      // Omitted stays omitted so Strata resolves it from the Vault's
      // confirmed market account.
      ...(accountSequence === undefined ? {} : { account_sequence: accountSequence }),
    }));
    if (challenge.quote_id !== quoteId) {
      throw new StrataContractError("execution challenge does not match the requested quote");
    }
    return challenge;
  }

  async executionPrepare(
    request: ExecutionPrepareRequest,
  ): Promise<ExecutionPrepareResponse> {
    const executionPath = await this.executionPath(request.market);
    if ("challengeId" in request) {
      const challengeId = normalizeHandle(request.challengeId, "challengeId", "sc_");
      const signature = request.authorizationSignature.trim();
      const signatureBytes = base58Decode(signature, 64, "authorizationSignature");
      if (base58Encode(signatureBytes) !== signature) {
        throw new TypeError("authorizationSignature must be a canonical base58 signature");
      }
      return executionPrepareResponse(await this.post(`${executionPath}/prepare`, {
        challenge_id: challengeId,
        authorization_signature: signature,
      }));
    }
    // Direct: bind the quote and build in one step; the transaction signature
    // is the authorization.
    const quoteId = normalizeHandle(request.quoteId, "quoteId", "sq_");
    const ownerWallet = canonicalPublicKey(request.ownerWallet, "ownerWallet");
    const sessionPublicKey = canonicalPublicKey(request.sessionPublicKey, "sessionPublicKey");
    const accountSequence = request.accountSequence === undefined
      ? undefined
      : normalizeAtoms(request.accountSequence);
    const prepared = executionPrepareResponse(await this.post(`${executionPath}/prepare`, {
      quote_id: quoteId,
      owner_wallet: ownerWallet,
      session_public_key: sessionPublicKey,
      ...(accountSequence === undefined ? {} : { account_sequence: accountSequence }),
    }));
    if (prepared.quote_id !== quoteId) {
      throw new StrataContractError("prepared execution does not match the requested quote");
    }
    return prepared;
  }

  async executionSubmit(
    request: ExecutionSubmitRequest,
  ): Promise<ExecutionSubmitResponse> {
    const executionPath = await this.executionPath(request.market);
    const executionId = normalizeHandle(request.executionId, "executionId", "se_");
    const signedTransaction = request.signedTransactionBase64.trim();
    if (!validBase64(signedTransaction)) {
      throw new TypeError("signedTransactionBase64 must be canonical base64");
    }
    const idempotencyKey = normalizeIdempotencyKey(request.idempotencyKey);
    const submitted = executionSubmitResponse(await this.post(`${executionPath}/submit`, {
      execution_id: executionId,
      signed_transaction_base64: signedTransaction,
      idempotency_key: idempotencyKey,
    }));
    if (submitted.execution_id !== executionId) {
      throw new StrataContractError("execution receipt does not match the submitted transaction");
    }
    return submitted;
  }

  /**
   * Execute one short-lived Sonar quote through a non-exportable Vault session.
   *
   * The SDK validates every public binding before signing. The caller-supplied
   * verifier checks that the exact prepared transaction matches the external
   * agent owner's configured execution policy before it reaches the signer.
   */
  async executeQuote(request: ExecuteQuoteRequest): Promise<ExecutionSubmitResponse> {
    if (request.verifyTransaction !== undefined && typeof request.verifyTransaction !== "function") {
      throw new TypeError("verifyTransaction must be a function when supplied");
    }
    const quote = quoteResponse(request.quote);
    if (quote.expires_at_ms <= Date.now()) {
      throw new StrataContractError("quote has expired");
    }
    const ownerWallet = canonicalPublicKey(request.ownerWallet, "ownerWallet");
    const sessionPublicKey = canonicalPublicKey(request.signer.publicKey, "signer.publicKey");
    if (typeof request.signer.signTransaction !== "function") {
      throw new TypeError("signer.signTransaction is required");
    }
    const accountSequence = request.accountSequence === undefined
      ? undefined
      : normalizeAtoms(request.accountSequence);
    // One signature: the quote is bound and built in one step and the
    // session signs only the resulting transaction.
    const prepared = await this.executionPrepare({
      market: quote.market_id,
      quoteId: quote.quote_id,
      ownerWallet,
      sessionPublicKey,
      ...(accountSequence === undefined ? {} : { accountSequence }),
    });
    assertExecutionBinding(prepared, quote, "prepared execution");
    const verification = {
      quote,
      prepared,
      ownerWallet,
      sessionPublicKey,
    };
    if (request.verifyTransaction) {
      await request.verifyTransaction(verification);
    } else {
      verifyExecutionTransaction(verification);
    }
    const signedTransaction = await request.signer.signTransaction(
      prepared.transaction_base64,
    );
    if (!validBase64(signedTransaction)) {
      throw new StrataContractError("session signer returned an invalid transaction");
    }
    const submitted = await this.executionSubmit({
      market: quote.market_id,
      executionId: prepared.execution_id,
      signedTransactionBase64: signedTransaction,
      idempotencyKey: request.idempotencyKey ?? prepared.execution_id,
    });
    if (submitted.execution_id !== prepared.execution_id) {
      throw new StrataContractError("execution receipt does not match the prepared transaction");
    }
    return submitted;
  }

  private async executionPath(requestedMarket: string): Promise<string> {
    const catalog = await this.markets();
    const market = catalog.markets.find(
      (item) => item.market_pda === requestedMarket
        || item.label.toLowerCase() === requestedMarket.trim().toLowerCase(),
    );
    if (!market?.ready || !market.quote_path || !validOperationPath(market.quote_path)) {
      throw new StrataContractError(`Sonar execution is not available for: ${requestedMarket}`);
    }
    return market.quote_path.slice(0, -"/quote".length) + "/execution";
  }

  private async get(path: string): Promise<unknown> {
    return this.request(path);
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    return this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      const response = await this.fetch(`${this.apiBase}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok) {
        const publicError = errorResponse(body);
        throw new StrataApiError(
          response.status,
          publicError?.error.code ?? "request_failed",
          publicError?.error.message ?? "Strata could not complete the request.",
          publicError?.error.retryable ?? response.status >= 500,
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
}

function validOperationPath(path: string): boolean {
  return /^\/sonar\/markets\/[a-z0-9]+(?:-[a-z0-9]+)*\/quote$/.test(path);
}

function normalizeAtoms(value: string | bigint): string {
  const normalized = typeof value === "bigint" ? value.toString() : value;
  return atomic(normalized, "amountInAtoms");
}

type PublicExecutionBinding = Pick<
  ExecutionChallengeResponse | ExecutionPrepareResponse,
  "quote_id" | "market_id" | "side" | "amount_in_atoms" | "minimum_output_atoms"
>;

function assertExecutionBinding(
  value: PublicExecutionBinding,
  quote: QuoteResponse,
  field: string,
): void {
  if (
    value.quote_id !== quote.quote_id
    || value.market_id !== quote.market_id
    || value.side !== quote.side
    || value.amount_in_atoms !== quote.amount_in_atoms
    || value.minimum_output_atoms !== quote.minimum_output_atoms
  ) {
    throw new StrataContractError(`${field} does not match the Sonar quote`);
  }
}

export interface AuthorizationEnvelope {
  bytes: Uint8Array;
  recentBlockhash: string;
  lastValidBlockHeight: number;
}

/**
 * Two-step path helper: check a challenge's authorization payload binds
 * exactly this quote, owner, and session before signing it. The one-call
 * `executeQuote` no longer needs it (one signature over the transaction).
 */
export function validateExecutionAuthorizationPayload(
  challenge: ExecutionChallengeResponse,
  quote: QuoteResponse,
  ownerWallet: string,
  sessionPublicKey: string,
  accountSequence: string | undefined,
): AuthorizationEnvelope {
  const bytes = decodeBase64(challenge.authorization_payload_base64);
  const domain = new TextEncoder().encode("strata-sonar-execution:v1\0");
  let cursor = 0;
  takeEqual(bytes, cursor, domain, "authorization domain");
  cursor += domain.length;
  takeEqual(bytes, cursor, base58Decode32(quote.market_id), "authorization market");
  cursor += 32;
  const quoteId = new TextEncoder().encode(quote.quote_id);
  takeEqual(bytes, cursor, quoteId, "authorization quote");
  cursor += quoteId.length;
  takeEqual(bytes, cursor, base58Decode32(ownerWallet), "authorization owner");
  cursor += 32;
  takeEqual(bytes, cursor, base58Decode32(sessionPublicKey), "authorization session");
  cursor += 32;
  const side = bytes[cursor++];
  if (side !== (quote.side === "buy" ? 0 : 1)) {
    throw new StrataContractError("authorization side changed");
  }
  expectU64(bytes, cursor, quote.amount_in_atoms, "authorization input");
  cursor += 8;
  expectU64(bytes, cursor, quote.minimum_output_atoms, "authorization minimum output");
  cursor += 8;
  // A pinned sequence must match; one left to Strata is accepted from the
  // signed authorization (resolved from the Vault's confirmed market account).
  if (accountSequence === undefined) {
    readU64(bytes, cursor, "authorization account sequence");
  } else {
    expectU64(bytes, cursor, accountSequence, "authorization account sequence");
  }
  cursor += 8;
  readU64(bytes, cursor, "authorization output balance");
  cursor += 8;
  const blockhash = bytes.slice(cursor, cursor + 32);
  if (blockhash.length !== 32) throw new StrataContractError("authorization blockhash is missing");
  cursor += 32;
  const lastValidBlockHeight = readU64(
    bytes,
    cursor,
    "authorization last valid block height",
  );
  cursor += 8;
  if (lastValidBlockHeight > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new StrataContractError("authorization block height exceeds the supported range");
  }
  expectU64(bytes, cursor, String(challenge.expires_at_ms), "authorization expiry");
  cursor += 8;
  const nonce = bytes.slice(cursor, cursor + 16);
  if (nonce.length !== 16 || hex(nonce) !== challenge.challenge_id.slice(3)) {
    throw new StrataContractError("authorization challenge nonce changed");
  }
  cursor += 16;
  cursor += 16; // Process epoch: replay-bound server instance identifier.
  if (cursor !== bytes.length) {
    throw new StrataContractError("authorization payload contains unrecognized fields");
  }
  return {
    bytes,
    recentBlockhash: base58Encode(blockhash),
    lastValidBlockHeight: Number(lastValidBlockHeight),
  };
}

function expectU64(bytes: Uint8Array, offset: number, expected: string, field: string): void {
  if (readU64(bytes, offset, field) !== BigInt(expected)) {
    throw new StrataContractError(`${field} changed`);
  }
}

function readU64(bytes: Uint8Array, offset: number, field: string): bigint {
  if (offset + 8 > bytes.length) throw new StrataContractError(`${field} is missing`);
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, true);
}

function takeEqual(
  source: Uint8Array,
  offset: number,
  expected: Uint8Array,
  field: string,
): void {
  const actual = source.slice(offset, offset + expected.length);
  if (actual.length !== expected.length || actual.some((byte, index) => byte !== expected[index])) {
    throw new StrataContractError(`${field} changed`);
  }
}

export function canonicalPublicKey(value: string, field: string): string {
  const trimmed = value.trim();
  const bytes = base58Decode32(trimmed);
  if (base58Encode(bytes) !== trimmed) {
    throw new TypeError(`${field} must be a canonical base58 public key`);
  }
  return trimmed;
}

function normalizeHandle(value: string, field: string, prefix: "sq_" | "sc_" | "se_"): string {
  const trimmed = value.trim();
  if (!new RegExp(`^${prefix}[0-9a-f]{32}$`).test(trimmed)) {
    throw new TypeError(`${field} must be an opaque ${prefix.slice(0, -1)} handle`);
  }
  return trimmed;
}

function base58Decode32(value: string): Uint8Array {
  return base58Decode(value, 32, "public key");
}

export function base58Decode(value: string, expectedLength: number, field: string): Uint8Array {
  if (!value || !BASE58_PATTERN.test(value)) {
    throw new TypeError(`${field} must use base58`);
  }
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = [0];
  for (const character of value) {
    let carry = alphabet.indexOf(character);
    if (carry < 0) throw new TypeError(`${field} must use base58`);
    for (let index = 0; index < bytes.length; index++) {
      carry += bytes[index]! * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let index = 0; index < value.length - 1 && value[index] === "1"; index++) {
    bytes.push(0);
  }
  const decoded = Uint8Array.from(bytes.reverse());
  if (decoded.length !== expectedLength) {
    throw new TypeError(`${field} must contain ${expectedLength} bytes`);
  }
  return decoded;
}

export function base58Encode(value: Uint8Array): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const digits = [0];
  for (const byte of value) {
    let carry = byte;
    for (let index = 0; index < digits.length; index++) {
      carry += digits[index]! << 8;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let output = "";
  for (let index = 0; index < value.length - 1 && value[index] === 0; index++) {
    output += "1";
  }
  for (let index = digits.length - 1; index >= 0; index--) {
    output += alphabet[digits[index]!]!;
  }
  return output;
}

export function decodeBase64(value: string): Uint8Array {
  if (!validBase64(value)) throw new StrataContractError("invalid base64 payload");
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function validBase64(value: string): boolean {
  return value.length > 0
    && value.length % 4 === 0
    && /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}

function hex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeIdempotencyKey(value: string): string {
  const key = value.trim();
  if (
    key.length === 0
    || key.length > 64
    || !/^[A-Za-z0-9._-]+$/.test(key)
  ) {
    throw new TypeError("idempotencyKey must contain 1-64 URL-safe characters");
  }
  return key;
}
