/**
 * PDA derivers for Strata accounts. All functions are pure — no global
 * state, no env coupling. Pass `programId` + (where applicable) `market`
 * explicitly so the SDK works across markets and clusters.
 *
 * Mirrors the Rust crate's `pdas.rs`. Account layout MUST stay byte-
 * identical with the on-chain program; if the on-chain seeds change,
 * update this file in lockstep.
 */

import { PublicKey } from "@solana/web3.js";
import { SPL_TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "./constants.js";

/** `["market", base_mint, quote_mint]` */
export function findMarketPda(
  programId: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), baseMint.toBuffer(), quoteMint.toBuffer()],
    programId,
  );
}

/** `["user", market, owner]` */
export function findUserAccountPda(
  programId: PublicKey,
  market: PublicKey,
  owner: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user"), market.toBuffer(), owner.toBuffer()],
    programId,
  );
}

/** `["order", market, owner, order_seq_le_u64]` */
export function findOrderPda(
  programId: PublicKey,
  market: PublicKey,
  owner: PublicKey,
  orderSeq: bigint,
): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(orderSeq);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("order"), market.toBuffer(), owner.toBuffer(), buf],
    programId,
  );
}

/** `["protocol_vault", market]` */
export function findProtocolVaultPda(
  programId: PublicKey,
  market: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_vault"), market.toBuffer()],
    programId,
  );
}

/** `["intent", market, mm_pubkey]` */
export function findIntentRecordPda(
  programId: PublicKey,
  market: PublicKey,
  mmPubkey: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("intent"), market.toBuffer(), mmPubkey.toBuffer()],
    programId,
  );
}

/**
 * Standard Associated Token Account address. Same logic as
 * `@solana/spl-token` but inlined so the SDK doesn't pay for the
 * extra dep if a consumer only needs PDA derivers.
 */
export function findAta(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), SPL_TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return ata;
}
