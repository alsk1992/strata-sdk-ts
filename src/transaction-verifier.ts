/**
 * Built-in transaction verification for one-signature order control.
 *
 * With the direct prepare path the session's signature over the returned
 * transaction is the whole authorization, so before signing the SDK checks
 * that the transaction is exactly the requested operation and nothing more:
 *
 * - the session key co-signs and never pays (it is not the fee payer);
 * - the owner wallet is not asked to sign;
 * - the session key signs only delegated instructions of one program (never a
 *   system, token, or other well-known program instruction);
 * - for resting orders, every delegated place/cancel is decoded and matched
 *   against the requested sides, prices, sizes, order types, order IDs, and the
 *   market — nothing added, nothing changed, nothing missing.
 *
 * TWAP and immediate execution get the same structural checks; their inner
 * economics are bound server-side by the echoed prepare fields the client
 * already checks (`validate*` in the clients). Applications with stricter
 * policies keep supplying their own `verifyTransaction`.
 */
import { StrataContractError, base58Encode, decodeBase64 } from "./client.js";
import type {
  PlatformOrderChallengeInput,
  PlatformOrderPrepareResponse,
  PlatformOrderBatchOperation,
  PlatformTradeSide,
  PlatformRestingOrderType,
  PlatformMakerControlPrepareResponse,
  PlatformMakerCurrentPrepareInput,
  PlatformMakerStrandPrepareInput,
  PlatformTwapPrepareResponse,
} from "./platform.js";
import type { ExecutionPrepareResponse } from "./types.js";

/** Programs a Vault session key must never sign for directly. */
const WELL_KNOWN_PROGRAMS: ReadonlySet<string> = new Set([
  "11111111111111111111111111111111", // system
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // token
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", // token-2022
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", // associated token
  "ComputeBudget111111111111111111111111111111", // compute budget
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", // memo
  "Stake11111111111111111111111111111111111111", // stake
  "Vote111111111111111111111111111111111111111", // vote
  "AddressLookupTab1e1111111111111111111111111", // address lookup tables
  "BPFLoaderUpgradeab1e11111111111111111111111", // upgradeable loader
]);

/** Delegated-instruction envelope tag (`execute_with_delegate`). */
const DELEGATED_ENVELOPE_TAG = 3;
/** Inner instruction tags a delegated order-control transaction may carry. */
const INNER_TAG_BALANCE = 1;
const INNER_TAG_CANCEL_ORDER = 4;
const INNER_TAG_PLACE_ORDER = 33;
const INNER_TAG_MARKET_ACCOUNT = 34;
const INNER_TAG_TWAP_CANCEL = 36;
const INNER_TAG_TWAP_POST = 38;

export interface DecodedInstruction {
  readonly programIdIndex: number;
  readonly accountIndexes: readonly number[];
  readonly data: Uint8Array;
}

export interface DecodedTransaction {
  readonly version: "legacy" | 0;
  readonly signatureCount: number;
  readonly numRequiredSignatures: number;
  readonly numReadonlySigned: number;
  readonly numReadonlyUnsigned: number;
  /** Base58 static account keys, in message order. */
  readonly staticAccountKeys: readonly string[];
  readonly recentBlockhash: string;
  readonly instructions: readonly DecodedInstruction[];
  readonly addressTableLookupCount: number;
}

class Reader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  u8(): number {
    if (this.offset >= this.bytes.length) throw new StrataContractError("transaction is truncated");
    return this.bytes[this.offset++]!;
  }

  compactU16(): number {
    let value = 0;
    let shift = 0;
    for (let i = 0; i < 3; i += 1) {
      const byte = this.u8();
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value;
      shift += 7;
    }
    throw new StrataContractError("transaction length prefix is invalid");
  }

  take(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) {
      throw new StrataContractError("transaction is truncated");
    }
    const out = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }

  done(): boolean {
    return this.offset === this.bytes.length;
  }
}

/** Decode a base64 legacy or v0 transaction without any RPC. */
export function decodeTransaction(transactionBase64: string): DecodedTransaction {
  const reader = new Reader(decodeBase64(transactionBase64));
  const signatureCount = reader.compactU16();
  reader.take(signatureCount * 64);
  let first = reader.u8();
  let version: "legacy" | 0 = "legacy";
  if ((first & 0x80) !== 0) {
    if ((first & 0x7f) !== 0) throw new StrataContractError("unsupported transaction version");
    version = 0;
    first = reader.u8();
  }
  const numRequiredSignatures = first;
  const numReadonlySigned = reader.u8();
  const numReadonlyUnsigned = reader.u8();
  const keyCount = reader.compactU16();
  const staticAccountKeys: string[] = [];
  for (let i = 0; i < keyCount; i += 1) staticAccountKeys.push(base58Encode(reader.take(32)));
  const recentBlockhash = base58Encode(reader.take(32));
  const instructionCount = reader.compactU16();
  const instructions: DecodedInstruction[] = [];
  for (let i = 0; i < instructionCount; i += 1) {
    const programIdIndex = reader.u8();
    const accountCount = reader.compactU16();
    const accountIndexes = Array.from(reader.take(accountCount));
    const dataLength = reader.compactU16();
    const data = new Uint8Array(reader.take(dataLength));
    instructions.push({ programIdIndex, accountIndexes, data });
  }
  let addressTableLookupCount = 0;
  if (version === 0) {
    addressTableLookupCount = reader.compactU16();
    for (let i = 0; i < addressTableLookupCount; i += 1) {
      reader.take(32);
      reader.take(reader.compactU16());
      reader.take(reader.compactU16());
    }
  }
  if (!reader.done()) throw new StrataContractError("transaction carries trailing bytes");
  if (signatureCount !== numRequiredSignatures || numRequiredSignatures === 0) {
    throw new StrataContractError("transaction signature layout is invalid");
  }
  if (staticAccountKeys.length < numRequiredSignatures) {
    throw new StrataContractError("transaction signer layout is invalid");
  }
  return {
    version,
    signatureCount,
    numRequiredSignatures,
    numReadonlySigned,
    numReadonlyUnsigned,
    staticAccountKeys,
    recentBlockhash,
    instructions,
    addressTableLookupCount,
  };
}

/**
 * A wallet may fill transaction signatures, but it must not replace the
 * message the SDK verified. This comparison is byte-exact and works for any
 * signature count without needing an RPC or Solana dependency.
 */
export function verifySignedTransactionMessage(
  preparedTransactionBase64: string,
  signedTransactionBase64: string,
): void {
  const prepared = transactionMessageBytes(preparedTransactionBase64);
  const signed = transactionMessageBytes(signedTransactionBase64);
  if (
    prepared.length !== signed.length
    || prepared.some((byte, index) => byte !== signed[index])
  ) {
    throw new StrataContractError("signed transaction message changed after verification");
  }
}

function transactionMessageBytes(transactionBase64: string): Uint8Array {
  const bytes = decodeBase64(transactionBase64);
  let offset = 0;
  let signatureCount = 0;
  let shift = 0;
  for (let index = 0; index < 3; index += 1) {
    const byte = bytes[offset];
    if (byte === undefined) throw new StrataContractError("transaction is truncated");
    offset += 1;
    signatureCount |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      const messageOffset = offset + signatureCount * 64;
      if (messageOffset >= bytes.length) {
        throw new StrataContractError("transaction is truncated");
      }
      return bytes.subarray(messageOffset);
    }
    shift += 7;
  }
  throw new StrataContractError("transaction length prefix is invalid");
}

export interface MakerTransactionVerification {
  readonly marketId: string;
  readonly makerWallet: string;
  readonly operation: PlatformMakerStrandPrepareInput | PlatformMakerCurrentPrepareInput;
  readonly prepared: PlatformMakerControlPrepareResponse;
}

/**
 * Deny-by-default verification for direct maker-wallet controls. The packet
 * must contain one native-v0 instruction, require only the maker signature, bind
 * the requested market where present, and encode exactly the requested maker
 * economics. The PDA bump is the only server-resolved byte.
 */
export async function verifyMakerTransaction(context: MakerTransactionVerification): Promise<void> {
  const tx = decodeTransaction(context.prepared.transaction_base64);
  if (tx.version !== 0 || tx.addressTableLookupCount !== 0) {
    throw new StrataContractError("maker controls must be native v0 without lookup tables");
  }
  if (
    tx.numRequiredSignatures !== 1
    || tx.signatureCount !== 1
    || tx.staticAccountKeys[0] !== context.makerWallet
    || tx.numReadonlySigned !== 0
  ) {
    throw new StrataContractError("maker control must require only the maker wallet");
  }
  if (tx.recentBlockhash !== context.prepared.recent_blockhash) {
    throw new StrataContractError("prepared maker blockhash does not match");
  }
  if (tx.instructions.length !== 1) {
    throw new StrataContractError("maker control must contain exactly one instruction");
  }
  const instruction = tx.instructions[0]!;
  if (instruction.accountIndexes[0] !== 0) {
    throw new StrataContractError("maker wallet is not the instruction signer");
  }
  const program = tx.staticAccountKeys[instruction.programIdIndex];
  if (!program || WELL_KNOWN_PROGRAMS.has(program)) {
    throw new StrataContractError("maker control targets an invalid program");
  }
  const data = instruction.data;
  const operation = context.operation;
  const action = context.prepared.action;
  const expectedTag = ({
    strand_upsert: 41,
    strand_recenter: 42,
    strand_cancel: 43,
    strand_set_enabled: 44,
    current_upsert: 47,
    current_cancel: 48,
  } as const)[action];
  if (data[0] !== expectedTag) throw new StrataContractError("maker instruction action changed");

  if (action === "strand_upsert" && operation.action === "upsert" && "midPriceAtoms" in operation) {
    if (data.length !== 353) throw new StrataContractError("Strand upsert has an invalid length");
    await verifyMakerMarket(tx, instruction, context.marketId);
    expectU8(data, 1, Number(operation.enabled) | (Number(operation.asyncOnly) << 1), "Strand flags");
    expectU16(data, 3, operation.syncSpreadTicks, "Strand sync spread");
    expectU64(data, 9, operation.midPriceAtoms, "Strand mid price");
    expectU64(data, 17, operation.maxExposureBaseAtoms, "Strand exposure");
    operation.bidOffsetsTicks.forEach((value, index) => expectU16(data, 25 + index * 2, value, "Strand bid offset"));
    operation.askOffsetsTicks.forEach((value, index) => expectU16(data, 57 + index * 2, value, "Strand ask offset"));
    operation.bidSizesBaseAtoms.forEach((value, index) => expectU64(data, 89 + index * 8, value, "Strand bid size"));
    operation.askSizesBaseAtoms.forEach((value, index) => expectU64(data, 217 + index * 8, value, "Strand ask size"));
    expectU64(data, 345, operation.validUntilSlot, "Strand expiry");
    return;
  }
  if (action === "strand_recenter" && operation.action === "recenter") {
    if (data.length !== 17) throw new StrataContractError("Strand recenter has an invalid length");
    expectU64(data, 1, operation.newMidPriceAtoms, "Strand mid price");
    expectU64(data, 9, operation.validUntilSlot, "Strand expiry");
    return;
  }
  if (action === "strand_set_enabled" && operation.action === "set_enabled") {
    if (data.length !== 2) throw new StrataContractError("Strand enable has an invalid length");
    expectU8(data, 1, Number(operation.enabled), "Strand enabled state");
    return;
  }
  if (action === "current_upsert" && operation.action === "upsert" && "halfSpreadBps" in operation) {
    if (data.length !== 161) throw new StrataContractError("Current upsert has an invalid length");
    await verifyMakerMarket(tx, instruction, context.marketId);
    expectU8(data, 1, Number(operation.enabled) | (Number(operation.asyncOnly) << 1), "Current flags");
    expectU16(data, 3, operation.halfSpreadBps, "Current spread");
    expectU16(data, 5, operation.bandStepBps, "Current band step");
    expectU16(data, 7, operation.maxConfidenceBps, "Current confidence bound");
    expectU16(data, 9, operation.maxOracleDeviationBps, "Current deviation bound");
    expectU32(data, 11, operation.maxOracleAgeSeconds, "Current mark age");
    expectU16(data, 15, operation.syncSpreadBps, "Current sync spread");
    expectU64(data, 17, operation.maxExposureBaseAtoms, "Current exposure");
    operation.bidDepthBaseAtoms.forEach((value, index) => expectU64(data, 25 + index * 8, value, "Current bid depth"));
    operation.askDepthBaseAtoms.forEach((value, index) => expectU64(data, 89 + index * 8, value, "Current ask depth"));
    expectU64(data, 153, operation.validUntilSlot, "Current expiry");
    return;
  }
  if (
    (action === "strand_cancel" || action === "current_cancel")
    && operation.action === "cancel"
  ) {
    if (data.length !== 1 || instruction.accountIndexes.length !== 3) {
      throw new StrataContractError("maker cancellation has an invalid shape");
    }
    const rentReceiver = tx.staticAccountKeys[instruction.accountIndexes[2]!];
    if (rentReceiver !== context.makerWallet) {
      throw new StrataContractError("maker rent receiver changed");
    }
    return;
  }
  throw new StrataContractError("prepared maker action does not match the requested operation");
}

async function verifyMakerMarket(
  tx: DecodedTransaction,
  instruction: DecodedInstruction,
  expectedMarketId: string,
): Promise<void> {
  const market = tx.staticAccountKeys[instruction.accountIndexes[1]!];
  if (!market || await opaqueProductId("market", market) !== expectedMarketId) {
    throw new StrataContractError("maker transaction touches another market");
  }
}

function expectU8(data: Uint8Array, offset: number, expected: number, field: string): void {
  if (data[offset] !== expected) throw new StrataContractError(`${field} changed`);
}

function expectU16(data: Uint8Array, offset: number, expected: number, field: string): void {
  if (offset + 2 > data.length || new DataView(data.buffer, data.byteOffset + offset, 2).getUint16(0, true) !== expected) {
    throw new StrataContractError(`${field} changed`);
  }
}

function expectU32(data: Uint8Array, offset: number, expected: number, field: string): void {
  if (offset + 4 > data.length || new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, true) !== expected) {
    throw new StrataContractError(`${field} changed`);
  }
}

function expectU64(
  data: Uint8Array,
  offset: number,
  expected: string | bigint,
  field: string,
): void {
  if (
    offset + 8 > data.length
    || new DataView(data.buffer, data.byteOffset + offset, 8).getBigUint64(0, true) !== BigInt(expected)
  ) {
    throw new StrataContractError(`${field} changed`);
  }
}

interface DelegatedInstruction {
  readonly innerProgram: string;
  readonly innerTag: number;
  readonly inner: Uint8Array;
  /** Base58 keys of the inner instruction's accounts, in order. */
  readonly innerAccounts: readonly (string | undefined)[];
}

/**
 * The structural invariants every session-signed Strata transaction must hold.
 * Returns the delegated instructions for the caller's own decoding.
 */
function structuralChecks(
  tx: DecodedTransaction,
  sessionPublicKey: string,
  ownerWallet: string,
  recentBlockhash: string,
  options: { readonly allowLookupTables: boolean; readonly requireEnvelope: boolean },
): DelegatedInstruction[] {
  if (tx.recentBlockhash !== recentBlockhash) {
    throw new StrataContractError("prepared transaction blockhash does not match");
  }
  const keys = tx.staticAccountKeys;
  const sessionIndex = keys.indexOf(sessionPublicKey);
  if (sessionIndex === -1 || sessionIndex >= tx.numRequiredSignatures) {
    throw new StrataContractError("the session key is not a required signer");
  }
  if (sessionIndex === 0) {
    throw new StrataContractError("the session key must never be the fee payer");
  }
  const ownerIndex = keys.indexOf(ownerWallet);
  if (ownerIndex !== -1 && ownerIndex < tx.numRequiredSignatures) {
    throw new StrataContractError("the owner wallet must not be asked to sign");
  }
  if (!options.allowLookupTables && tx.addressTableLookupCount !== 0) {
    throw new StrataContractError("order-control transactions carry no lookup tables");
  }
  let envelopeProgram: string | undefined;
  let innerProgram: string | undefined;
  const delegated: DelegatedInstruction[] = [];
  for (const instruction of tx.instructions) {
    if (!instruction.accountIndexes.includes(sessionIndex)) continue;
    const program = keys[instruction.programIdIndex];
    if (program === undefined) throw new StrataContractError("instruction program is not static");
    if (WELL_KNOWN_PROGRAMS.has(program)) {
      throw new StrataContractError("the session key must not sign a system or token instruction");
    }
    if (envelopeProgram === undefined) envelopeProgram = program;
    if (program !== envelopeProgram) {
      throw new StrataContractError("the session key signs for more than one program");
    }
    if (instruction.accountIndexes[0] !== sessionIndex) {
      throw new StrataContractError("the session key is not the delegate signer");
    }
    if (!options.requireEnvelope) continue;
    const data = instruction.data;
    if (data.length < 14 || data[0] !== DELEGATED_ENVELOPE_TAG) {
      throw new StrataContractError("the session key signs a non-delegated instruction");
    }
    const innerLength = data[11]! | (data[12]! << 8);
    const inner = data.subarray(14, 14 + innerLength);
    if (inner.length !== innerLength || innerLength === 0) {
      throw new StrataContractError("delegated instruction is malformed");
    }
    const innerProgramKey = keys[instruction.accountIndexes[3] ?? -1];
    if (innerProgramKey === undefined) {
      throw new StrataContractError("delegated instruction target is not static");
    }
    if (innerProgram === undefined) innerProgram = innerProgramKey;
    if (innerProgramKey !== innerProgram) {
      throw new StrataContractError("delegated instructions target more than one program");
    }
    delegated.push({
      innerProgram: innerProgramKey,
      innerTag: inner[0]!,
      inner,
      innerAccounts: instruction.accountIndexes.slice(6).map((index) => keys[index]),
    });
  }
  if (delegated.length === 0 && options.requireEnvelope) {
    throw new StrataContractError("the transaction carries no delegated instruction");
  }
  return delegated;
}

function readU64(bytes: Uint8Array, offset: number): bigint {
  if (offset + 8 > bytes.length) throw new StrataContractError("delegated instruction is truncated");
  let value = 0n;
  for (let i = 7; i >= 0; i -= 1) value = (value << 8n) | BigInt(bytes[offset + i]!);
  return value;
}

function hexBytes(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function opaqueProductId(kind: "market" | "order", value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new StrataContractError("Web Crypto is required to verify opaque product identity");
  }
  const prefix = new TextEncoder().encode(`strata-sdk-product:v1\0${kind}\0${value}`);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", prefix));
  return `${kind}_${hexBytes(digest.slice(0, 16))}`;
}

const SIDE_WIRE: Record<PlatformTradeSide, number> = { buy: 0, sell: 1 };
const ORDER_TYPE_WIRE: Record<PlatformRestingOrderType, number> = {
  good_until_cancelled: 0,
  post_only: 3,
};

interface ExpectedPlace {
  readonly side: number;
  readonly orderType: number;
  readonly price: bigint;
  readonly size: bigint;
}

interface ExpectedOrderIntent {
  readonly places: ExpectedPlace[];
  /** Order IDs that must be cancelled, or "all" for cancel_all. */
  readonly cancels: string[] | "all";
}

function expectedPlace(
  operation: Extract<PlatformOrderChallengeInput, { action: "place" | "replace" }>
    | Extract<PlatformOrderBatchOperation, { action: "place" | "replace" }>,
): ExpectedPlace {
  return {
    side: SIDE_WIRE[operation.side],
    orderType: ORDER_TYPE_WIRE[operation.orderType],
    price: BigInt(operation.limitPriceAtoms),
    size: BigInt(operation.sizeAtoms),
  };
}

function expectedOrderIntent(operation: PlatformOrderChallengeInput): ExpectedOrderIntent {
  switch (operation.action) {
    case "place":
      return { places: [expectedPlace(operation)], cancels: [] };
    case "cancel":
      return { places: [], cancels: [operation.orderId] };
    case "cancel_all":
      return { places: [], cancels: "all" };
    case "replace":
      return { places: [expectedPlace(operation)], cancels: [operation.orderId] };
    case "batch": {
      const places: ExpectedPlace[] = [];
      const cancels: string[] = [];
      for (const item of operation.operations) {
        if (item.action === "place") places.push(expectedPlace(item));
        else if (item.action === "cancel") cancels.push(item.orderId);
        else {
          cancels.push(item.orderId);
          places.push(expectedPlace(item));
        }
      }
      return { places, cancels };
    }
    default:
      throw new StrataContractError("order action is invalid");
  }
}

function sameMultiset<T>(left: readonly T[], right: readonly T[], key: (value: T) => string): boolean {
  if (left.length !== right.length) return false;
  const counts = new Map<string, number>();
  for (const value of left) counts.set(key(value), (counts.get(key(value)) ?? 0) + 1);
  for (const value of right) {
    const k = key(value);
    const remaining = counts.get(k);
    if (!remaining) return false;
    counts.set(k, remaining - 1);
  }
  return true;
}

export interface OrderTransactionVerification {
  readonly marketId: string;
  readonly operation: PlatformOrderChallengeInput;
  readonly prepared: PlatformOrderPrepareResponse;
  readonly ownerWallet: string;
  readonly sessionPublicKey: string;
}

/**
 * Deny-by-default verification of a prepared resting-order transaction: it
 * must be exactly the requested operation for this market and session.
 */
export async function verifyOrderTransaction(context: OrderTransactionVerification): Promise<void> {
  const tx = decodeTransaction(context.prepared.transaction_base64);
  const delegated = structuralChecks(
    tx,
    context.sessionPublicKey,
    context.ownerWallet,
    context.prepared.recent_blockhash,
    { allowLookupTables: false, requireEnvelope: true },
  );
  const places: { place: ExpectedPlace; market: string; order: string }[] = [];
  const cancels: { market: string; order: string }[] = [];
  for (const instruction of delegated) {
    switch (instruction.innerTag) {
      case INNER_TAG_BALANCE:
      case INNER_TAG_MARKET_ACCOUNT:
        break;
      case INNER_TAG_PLACE_ORDER: {
        const inner = instruction.inner;
        // [tag][side][order_type][0,0][price u64][size u64][expiry u64][bump]
        if (inner.length < 30) throw new StrataContractError("place instruction is truncated");
        const market = instruction.innerAccounts[1];
        const order = instruction.innerAccounts[3];
        if (market === undefined || order === undefined) {
          throw new StrataContractError("place instruction accounts are not static");
        }
        places.push({
          place: {
            side: inner[1]!,
            orderType: inner[2]!,
            price: readU64(inner, 5),
            size: readU64(inner, 13),
          },
          market,
          order,
        });
        break;
      }
      case INNER_TAG_CANCEL_ORDER: {
        const market = instruction.innerAccounts[1];
        const order = instruction.innerAccounts[3];
        if (market === undefined || order === undefined) {
          throw new StrataContractError("cancel instruction accounts are not static");
        }
        cancels.push({ market, order });
        break;
      }
      default:
        throw new StrataContractError(
          `the transaction delegates an unexpected instruction (${instruction.innerTag})`,
        );
    }
  }
  // Every touched market must be the requested one.
  const markets = new Set([...places, ...cancels].map((entry) => entry.market));
  for (const market of markets) {
    if ((await opaqueProductId("market", market)) !== context.marketId) {
      throw new StrataContractError("the transaction touches another market");
    }
  }
  const expected = expectedOrderIntent(context.operation);
  if (
    !sameMultiset(
      places.map((entry) => entry.place),
      expected.places,
      (place) => `${place.side}:${place.orderType}:${place.price}:${place.size}`,
    )
  ) {
    throw new StrataContractError("the transaction does not place exactly the requested orders");
  }
  const cancelledIds = await Promise.all(
    cancels.map((entry) => opaqueProductId("order", `${context.marketId}:${entry.order}`)),
  );
  if (expected.cancels === "all") {
    if (cancelledIds.length === 0) {
      throw new StrataContractError("cancel_all prepared no cancellation");
    }
  } else if (!sameMultiset(cancelledIds, expected.cancels, (id) => id)) {
    throw new StrataContractError("the transaction does not cancel exactly the requested orders");
  }
  // The echoed order IDs must be exactly the orders this transaction touches.
  const placedIds = await Promise.all(
    places.map((entry) => opaqueProductId("order", `${context.marketId}:${entry.order}`)),
  );
  if (!sameMultiset([...cancelledIds, ...placedIds], context.prepared.order_ids, (id) => id)) {
    throw new StrataContractError("prepared order IDs do not match the transaction");
  }
}

export interface TwapTransactionVerification {
  readonly prepared: PlatformTwapPrepareResponse;
  readonly ownerWallet: string;
  readonly sessionPublicKey: string;
}

/**
 * Structural verification of a prepared TWAP-control transaction: session
 * co-signs only delegated TWAP instructions and never pays; the bound TWAP
 * economics are checked against the echoed prepare fields by the client.
 */
export function verifyTwapTransaction(context: TwapTransactionVerification): void {
  const tx = decodeTransaction(context.prepared.transaction_base64);
  const delegated = structuralChecks(
    tx,
    context.sessionPublicKey,
    context.ownerWallet,
    context.prepared.recent_blockhash,
    { allowLookupTables: false, requireEnvelope: true },
  );
  for (const instruction of delegated) {
    if (
      instruction.innerTag !== INNER_TAG_BALANCE
      && instruction.innerTag !== INNER_TAG_MARKET_ACCOUNT
      && instruction.innerTag !== INNER_TAG_TWAP_POST
      && instruction.innerTag !== INNER_TAG_TWAP_CANCEL
    ) {
      throw new StrataContractError(
        `the transaction delegates an unexpected instruction (${instruction.innerTag})`,
      );
    }
  }
}

export interface ExecutionTransactionVerification {
  readonly prepared: ExecutionPrepareResponse;
  readonly ownerWallet: string;
  readonly sessionPublicKey: string;
}

/**
 * Structural verification of a prepared immediate execution: the session
 * co-signs only Vault-delegated instructions of one program and never pays.
 * The bound quote economics are checked against the echoed prepare fields.
 */
export function verifyExecutionTransaction(context: ExecutionTransactionVerification): void {
  const tx = decodeTransaction(context.prepared.transaction_base64);
  structuralChecks(
    tx,
    context.sessionPublicKey,
    context.ownerWallet,
    context.prepared.recent_blockhash,
    { allowLookupTables: true, requireEnvelope: false },
  );
}
