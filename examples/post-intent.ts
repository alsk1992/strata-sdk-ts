/**
 * Example: post an MM intent and revoke it.
 *
 * Run with: pnpm ts-node examples/post-intent.ts
 * (You need a funded keypair + an admin-registered IntentRecord on the
 *  market — see Strata's docs for the admin_register_mm flow.)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  findIntentRecordPda,
  findUserAccountPda,
  postIntentIx,
  revokeIntentIx,
  Side,
} from "../src/index.js";
import { readFileSync } from "fs";

async function main() {
  const rpcUrl = process.env.STRATA_RPC_HTTP ?? "https://api.devnet.solana.com";
  const programId = new PublicKey(process.env.STRATA_PROGRAM_ID!);
  const market = new PublicKey(process.env.STRATA_MARKET!);
  const keypairPath = process.env.STRATA_KEYPAIR!;
  const fairPriceAtoms = BigInt(process.env.FAIR_PRICE ?? "150000000");
  const maxFillSize = BigInt(process.env.MAX_FILL_SIZE ?? "50000000");

  const secret = new Uint8Array(JSON.parse(readFileSync(keypairPath, "utf8")));
  const mm = Keypair.fromSecretKey(secret);
  const conn = new Connection(rpcUrl, "confirmed");

  const [intentPda] = findIntentRecordPda(programId, market, mm.publicKey);
  const [uaPda] = findUserAccountPda(programId, market, mm.publicKey);

  // Buy band: pay anywhere up to fair - 12.5 bps.
  const halfBps = 12n;
  const offset = (fairPriceAtoms * halfBps) / 10_000n;
  const buyMax = fairPriceAtoms - offset;
  const buyIx = postIntentIx(
    { programId, mm: mm.publicKey, market, intentRecord: intentPda, mmUserAccount: uaPda },
    Side.Buy,
    0n,
    buyMax,
    maxFillSize,
  );

  // Sell band: receive anywhere from fair + 12.5 bps.
  const sellMin = fairPriceAtoms + offset;
  const sellIx = postIntentIx(
    { programId, mm: mm.publicKey, market, intentRecord: intentPda, mmUserAccount: uaPda },
    Side.Sell,
    sellMin,
    BigInt("0xFFFFFFFFFFFFFFFF"),
    maxFillSize,
  );

  // Atomic both-sides post.
  const tx = new Transaction().add(buyIx, sellIx);
  const sig = await sendAndConfirmTransaction(conn, tx, [mm]);
  console.log("posted both sides:", sig);

  // ... bot runs ...

  // Revoke on shutdown.
  const revokeIx = revokeIntentIx({
    programId,
    mm: mm.publicKey,
    market,
    intentRecord: intentPda,
    mmUserAccount: uaPda,
  });
  const revokeSig = await sendAndConfirmTransaction(
    conn,
    new Transaction().add(revokeIx),
    [mm],
  );
  console.log("revoked:", revokeSig);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
