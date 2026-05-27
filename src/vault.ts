/**
 * Vault-mode helpers — wrap a Strata-native ix in the
 * `execute_with_delegate` (vault tag 3) envelope so a session key can
 * sign it with zero wallet popups.
 *
 * The vault program PDA + delegate PDA are NOT derived client-side in
 * the SDK — the backend computes them (`POST /vault/initiate` returns
 * `{vault_pda, delegate_pda, ...}`). Consumers fetch and persist these
 * via [`VaultSession`] then pass into [`wrapStrataIxForVault`].
 *
 * Strata-native ixs that are valid inner ixs (allowed by the on-chain
 * vault dispatcher):
 *   - Deposit (tag 1)
 *   - PlaceOrder (tag 3)
 *   - CancelOrder (tag 4)
 *   - InitUserAccount (tag 16)
 *   - SettleTradeWithSignedQuote (tag 31)
 *
 * Any other tag is rejected by the on-chain allowlist.
 */

import { PublicKey, TransactionInstruction } from "@solana/web3.js";

/** Persisted vault session — the four base58 pubkeys + an opaque key id
 *  pointing at the session signing key (in IndexedDB in the browser, in
 *  a file or HSM elsewhere). */
export interface VaultSession {
  /** Master wallet pubkey that owns the vault (base58). */
  owner: string;
  /** Vault PDA (base58). */
  vaultPda: string;
  /** ed25519 verifying key for the session signer (base58). */
  delegatePubkey: string;
  /** Delegate PDA, on-chain row that caps + expires the session. */
  delegatePda: string;
  /** Opaque storage id for the private session key. */
  keyId: string;
}

/** Vault discriminator. The on-chain vault program reserves tag 3 for
 *  `execute_with_delegate`. */
export const VAULT_EXECUTE_WITH_DELEGATE_TAG = 3;

export interface WrapStrataIxOpts {
  session: VaultSession;
  /** Master wallet pubkey (must match `session.owner` decoded). */
  masterOwner: PublicKey;
  /** The Strata-native inner ix to wrap. Must be one of the allowlisted
   *  tags above. */
  innerIx: TransactionInstruction;
  /** Informational atoms-of-input. Strata-native branch ignores the
   *  amount cap; pass 0 for tag-less ixs (cancel_order, etc). */
  amountIn: bigint;
  /** The vault program id for this cluster (env-driven; the frontend
   *  defaults to `E65Y4...` on devnet). */
  vaultProgramId: PublicKey;
}

/**
 * Wrap a Strata-native ix in `execute_with_delegate` so the session
 * key is the only signer. The vault program CPI-signs as the vault
 * PDA via seeds — Strata downstream sees the vault PDA as the
 * authoritative signer, with the session key only proving "ops on
 * behalf of this vault."
 *
 * Wire layout of the data field:
 * ```
 *   tag=3                         (1 byte)
 *   amount_in: u64 LE             (8 bytes)
 *   input_ata_idx: u8             (1 byte; ignored by Strata-native branch)
 *   output_ata_idx: u8            (1 byte; ignored)
 *   inner_ix_data_len: u16 LE     (2 bytes)
 *   inner_acct_count: u8          (1 byte)
 *   inner_ix_data                 (N bytes)
 *   inner_account_roles           (N bytes; bit0 = signer, bit1 = writable)
 * ```
 *
 * Account list:
 * ```
 *   0: delegate_pubkey (signer, RO)
 *   1: vault_pda (RO)
 *   2: delegate_pda (RW; vault increments velocity + last-used)
 *   3: inner_ix.program_id (RO)
 *   4: master_owner (RO)
 *   5..: inner_ix.keys (writability preserved; signer bit stripped)
 * ```
 */
export function wrapStrataIxForVault(
  opts: WrapStrataIxOpts,
): TransactionInstruction {
  const { session, masterOwner, innerIx, amountIn, vaultProgramId } = opts;

  const innerData = innerIx.data;
  const accountRoles = Buffer.from(
    innerIx.keys.map(
      (k) => (k.isSigner ? 0b01 : 0) | (k.isWritable ? 0b10 : 0),
    ),
  );
  const header = Buffer.alloc(13);
  let off = 0;
  header.writeBigUInt64LE(amountIn, off); off += 8;
  header.writeUInt8(0, off); off += 1; // input_ata_idx (ignored)
  header.writeUInt8(0, off); off += 1; // output_ata_idx (ignored)
  header.writeUInt16LE(innerData.length, off); off += 2;
  header.writeUInt8(innerIx.keys.length, off);

  const tag = Buffer.from([VAULT_EXECUTE_WITH_DELEGATE_TAG]);
  const data = Buffer.concat([tag, header, innerData, accountRoles]);

  const fixedKeys = [
    {
      pubkey: new PublicKey(session.delegatePubkey),
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: new PublicKey(session.vaultPda),
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: new PublicKey(session.delegatePda),
      isSigner: false,
      isWritable: true,
    },
    { pubkey: innerIx.programId, isSigner: false, isWritable: false },
    { pubkey: masterOwner, isSigner: false, isWritable: false },
  ];
  const innerKeys = innerIx.keys.map((k) => ({
    pubkey: k.pubkey,
    isSigner: false,
    isWritable: k.isWritable,
  }));

  return new TransactionInstruction({
    programId: vaultProgramId,
    keys: [...fixedKeys, ...innerKeys],
    data,
  });
}
