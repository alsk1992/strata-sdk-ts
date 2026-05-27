/**
 * Transaction-level helpers: ComputeBudget ix builders, Jito tip ix,
 * minimal `TxBuilder` for the build → sign → submit cycle.
 *
 * Mirrors the Rust kit's `tx_v5.rs`. Every production tx on Solana
 * should set a CU limit + (optionally) a CU price for priority-fee
 * bidding. Without these, leaders may reject under congestion or
 * charge the default CU price.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { COMPUTE_BUDGET_PROGRAM_ID } from "./constants.js";

/** Build a `SetComputeUnitLimit` ix (discriminator 2). */
export function cuLimitIx(units: number): TransactionInstruction {
  const data = Buffer.alloc(5);
  data.writeUInt8(2, 0);
  data.writeUInt32LE(units, 1);
  return new TransactionInstruction({
    programId: COMPUTE_BUDGET_PROGRAM_ID,
    keys: [],
    data,
  });
}

/** Build a `SetComputeUnitPrice` ix (discriminator 3). `price` is
 *  microlamports per CU — typical mainnet values 0..100_000. */
export function cuPriceIx(priceMicrolamports: bigint): TransactionInstruction {
  const data = Buffer.alloc(9);
  data.writeUInt8(3, 0);
  data.writeBigUInt64LE(priceMicrolamports, 1);
  return new TransactionInstruction({
    programId: COMPUTE_BUDGET_PROGRAM_ID,
    keys: [],
    data,
  });
}

/** SystemProgram::Transfer to a Jito tip account, for bundle-priority
 *  submission of urgent cancels. Tip accounts rotate hourly — see
 *  `https://docs.jito.wtf/lowlatencytxnsend/`. */
export function jitoTipIx(
  payer: PublicKey,
  tipAccount: PublicKey,
  lamports: bigint,
): TransactionInstruction {
  // SystemProgram::Transfer ix: u32 LE discriminator (2), then u64 lamports.
  const data = Buffer.alloc(12);
  data.writeUInt32LE(2, 0);
  data.writeBigUInt64LE(lamports, 4);
  return new TransactionInstruction({
    programId: PublicKey.default, // SystemProgram = all zeros
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: tipAccount, isSigner: false, isWritable: true },
    ],
    data,
  });
}

/** Build → sign → submit helper. Prepends ComputeBudget ixs. Mirrors
 *  the Rust kit's `submit_v5` minus the multi-RPC failover + blockhash
 *  cache (consumers can compose those if needed). */
export interface TxBuilderOptions {
  /** CU limit to set via `cuLimitIx`. Skipped if 0. */
  cuLimit?: number;
  /** CU price (microlamports/CU). Skipped if 0. */
  cuPriceMicrolamports?: bigint;
  /** Fee-payer keypair. Defaults to `signer` if omitted. */
  feePayer?: Keypair;
}

/** Send + confirm a tx with the given ixs. Prepends ComputeBudget ixs
 *  per `opts`. Uses the connection's commitment for confirmation. */
export async function buildAndSend(
  connection: Connection,
  signer: Keypair,
  ixs: TransactionInstruction[],
  opts: TxBuilderOptions = {},
): Promise<string> {
  const tx = new Transaction();
  if (opts.cuLimit && opts.cuLimit > 0) tx.add(cuLimitIx(opts.cuLimit));
  if (opts.cuPriceMicrolamports && opts.cuPriceMicrolamports > 0n) {
    tx.add(cuPriceIx(opts.cuPriceMicrolamports));
  }
  for (const ix of ixs) tx.add(ix);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = (opts.feePayer ?? signer).publicKey;

  const signers = opts.feePayer && !opts.feePayer.publicKey.equals(signer.publicKey)
    ? [signer, opts.feePayer]
    : [signer];
  tx.sign(...signers);

  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}
