#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  runMakerFundedConformance,
  runMakerSafeConformance,
  runMakerWaterfallConformance,
  type MakerFundedConformanceOptions,
  type MakerSafeConformanceOptions,
} from "./maker-conformance.js";
import { sessionSignerFromSecretKey } from "./session-signer.js";

const FUNDED_CONFIRMATION = "RUN_FUNDED_MAINNET_CONFORMANCE";

export interface MakerConformanceCliOptions {
  readonly mode: "safe" | "funded" | "full";
  readonly apiBase?: string;
  readonly mcpUrl?: string;
  readonly market?: string;
  readonly makerWallet?: string;
  readonly size?: string;
  readonly spreadBps?: number;
  readonly duration?: string;
  readonly holdMs?: number;
  readonly confirmationTimeoutMs?: number;
  readonly expirySeconds?: number;
  readonly keypair?: string;
  readonly takerOwner?: string;
  readonly takerSessionKeypair?: string;
  readonly partialFillBaseAtoms?: string;
  readonly fallbackBaseAtoms?: string;
  readonly takerSide?: "buy" | "sell";
  readonly maximumToleranceBps?: number;
  readonly confirmedFundedWrite: boolean;
  readonly pretty: boolean;
}

function usage(): string {
  return `Usage:
  strata-maker-conformance safe [options]
  strata-maker-conformance funded --keypair /absolute/keypair.json \\
    --confirm-funded-write ${FUNDED_CONFIRMATION} [options]
  strata-maker-conformance full --keypair /absolute/maker.json \\
    --taker-owner PUBKEY --taker-session-keypair /absolute/session.json \\
    --confirm-funded-write ${FUNDED_CONFIRMATION} [options]

The safe mode is non-broadcasting and is suitable for every deployment. It
prepares and verifies Strand and Current through the published TypeScript SDK
and through fresh requests to the hosted MCP server.

The funded mode broadcasts mainnet transactions. It starts, observes and
stops Current over MCP; repeats the lifecycle for Strand through the SDK; and
proves automatic expiry. It never prints secret keys or prepared packets.

Full mode adds real partial fills through isolated Current and Strand, then a
mixed execution larger than both maker exposures combined. The maker's public
fill stream must attribute both products and the remainder must complete via
Sonar. Internal execution details remain private.

Options:
  --api-base URL               Strata API (default https://api.stratabook.app)
  --mcp-url URL                Hosted MCP endpoint (default API /mcp)
  --market LABEL               Market label or opaque ID (default SOL/USDC)
  --maker-wallet PUBKEY        Safe-mode public test identity
  --size AMOUNT                Decimal base size (default "0.01 SOL")
  --spread-bps N               Quote distance from mark (default 5)
  --duration VALUE             Active duration (default 10m)
  --hold-ms N                  Funded active-collateral window (default 5000)
  --confirmation-timeout-ms N  Funded chain observation timeout (default 60000)
  --expiry-seconds N           Funded expiry proof; zero disables (default 20)
  --keypair PATH               Absolute Solana JSON keypair path (funded only)
  --taker-owner PUBKEY         Different funded Vault owner (full only)
  --taker-session-keypair PATH Absolute registered Vault session key (full only)
  --partial-fill-base-atoms N  Isolated product partial fill (default 1000000)
  --fallback-base-atoms N      Mixed amount beyond both products (default same)
  --taker-side buy|sell        Full-suite taker direction (default buy)
  --maximum-tolerance-bps N    Full-suite execution tolerance (default 100)
  --pretty                     Pretty-print the JSON report
  --help                       Show this help
`;
}

function value(args: readonly string[], index: number, flag: string): string {
  const result = args[index + 1];
  if (result === undefined || result.startsWith("--")) {
    throw new TypeError(`${flag} requires a value`);
  }
  return result;
}

function number(value: string, flag: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw new TypeError(`${flag} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new TypeError(`${flag} is too large`);
  return parsed;
}

export function parseMakerConformanceArgs(args: readonly string[]): MakerConformanceCliOptions {
  let mode: "safe" | "funded" | "full" = "safe";
  let start = 0;
  if (args[0] === "safe" || args[0] === "funded" || args[0] === "full") {
    mode = args[0];
    start = 1;
  }
  let apiBase: string | undefined;
  let mcpUrl: string | undefined;
  let market: string | undefined;
  let makerWallet: string | undefined;
  let size: string | undefined;
  let spreadBps: number | undefined;
  let duration: string | undefined;
  let holdMs: number | undefined;
  let confirmationTimeoutMs: number | undefined;
  let expirySeconds: number | undefined;
  let keypair: string | undefined;
  let takerOwner: string | undefined;
  let takerSessionKeypair: string | undefined;
  let partialFillBaseAtoms: string | undefined;
  let fallbackBaseAtoms: string | undefined;
  let takerSide: "buy" | "sell" | undefined;
  let maximumToleranceBps: number | undefined;
  let confirmedFundedWrite = false;
  let pretty = false;
  for (let index = start; index < args.length; index += 1) {
    const flag = args[index]!;
    if (flag === "--help" || flag === "-h") throw new Error("help");
    if (flag === "--pretty") {
      pretty = true;
      continue;
    }
    const next = value(args, index, flag);
    index += 1;
    switch (flag) {
      case "--api-base": apiBase = next; break;
      case "--mcp-url": mcpUrl = next; break;
      case "--market": market = next; break;
      case "--maker-wallet": makerWallet = next; break;
      case "--size": size = next; break;
      case "--spread-bps": spreadBps = number(next, flag); break;
      case "--duration": duration = next; break;
      case "--hold-ms": holdMs = number(next, flag); break;
      case "--confirmation-timeout-ms": confirmationTimeoutMs = number(next, flag); break;
      case "--expiry-seconds": expirySeconds = number(next, flag); break;
      case "--keypair": keypair = next; break;
      case "--taker-owner": takerOwner = next; break;
      case "--taker-session-keypair": takerSessionKeypair = next; break;
      case "--partial-fill-base-atoms":
        if (!/^[1-9][0-9]*$/.test(next)) throw new TypeError(`${flag} must be positive atoms`);
        partialFillBaseAtoms = next;
        break;
      case "--fallback-base-atoms":
        if (!/^[1-9][0-9]*$/.test(next)) throw new TypeError(`${flag} must be positive atoms`);
        fallbackBaseAtoms = next;
        break;
      case "--taker-side":
        if (next !== "buy" && next !== "sell") throw new TypeError(`${flag} must be buy or sell`);
        takerSide = next;
        break;
      case "--maximum-tolerance-bps": maximumToleranceBps = number(next, flag); break;
      case "--confirm-funded-write":
        if (next !== FUNDED_CONFIRMATION) {
          throw new TypeError(`--confirm-funded-write must equal ${FUNDED_CONFIRMATION}`);
        }
        confirmedFundedWrite = true;
        break;
      default: throw new TypeError(`unknown option: ${flag}`);
    }
  }
  return {
    mode,
    ...(apiBase === undefined ? {} : { apiBase }),
    ...(mcpUrl === undefined ? {} : { mcpUrl }),
    ...(market === undefined ? {} : { market }),
    ...(makerWallet === undefined ? {} : { makerWallet }),
    ...(size === undefined ? {} : { size }),
    ...(spreadBps === undefined ? {} : { spreadBps }),
    ...(duration === undefined ? {} : { duration }),
    ...(holdMs === undefined ? {} : { holdMs }),
    ...(confirmationTimeoutMs === undefined ? {} : { confirmationTimeoutMs }),
    ...(expirySeconds === undefined ? {} : { expirySeconds }),
    ...(keypair === undefined ? {} : { keypair }),
    ...(takerOwner === undefined ? {} : { takerOwner }),
    ...(takerSessionKeypair === undefined ? {} : { takerSessionKeypair }),
    ...(partialFillBaseAtoms === undefined ? {} : { partialFillBaseAtoms }),
    ...(fallbackBaseAtoms === undefined ? {} : { fallbackBaseAtoms }),
    ...(takerSide === undefined ? {} : { takerSide }),
    ...(maximumToleranceBps === undefined ? {} : { maximumToleranceBps }),
    confirmedFundedWrite,
    pretty,
  };
}

async function keypairBytes(path: string): Promise<Uint8Array> {
  if (!path.startsWith("/")) throw new TypeError("--keypair must be an absolute path");
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (
    !Array.isArray(parsed)
    || (parsed.length !== 32 && parsed.length !== 64)
    || parsed.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
  ) {
    throw new TypeError("keypair file must contain a 32-byte seed or 64-byte Solana secret key");
  }
  return Uint8Array.from(parsed);
}

async function main(): Promise<void> {
  let options: MakerConformanceCliOptions;
  try {
    options = parseMakerConformanceArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof Error && error.message === "help") {
      process.stdout.write(usage());
      return;
    }
    throw error;
  }
  const common: MakerSafeConformanceOptions = {
    ...(options.apiBase === undefined ? {} : { apiBase: options.apiBase }),
    ...(options.mcpUrl === undefined ? {} : { mcpUrl: options.mcpUrl }),
    ...(options.market === undefined ? {} : { market: options.market }),
    ...(options.makerWallet === undefined ? {} : { makerWallet: options.makerWallet }),
    ...(options.size === undefined ? {} : { size: options.size }),
    ...(options.spreadBps === undefined ? {} : { spreadBps: options.spreadBps }),
    ...(options.duration === undefined ? {} : { duration: options.duration }),
  };
  const report = options.mode === "safe"
    ? await runMakerSafeConformance(common)
    : await (async () => {
      if (!options.confirmedFundedWrite) {
        throw new TypeError(
          `funded mode requires --confirm-funded-write ${FUNDED_CONFIRMATION}`,
        );
      }
      if (options.keypair === undefined) throw new TypeError("funded mode requires --keypair");
      if (options.makerWallet !== undefined) {
        throw new TypeError("funded mode derives the maker wallet from --keypair; omit --maker-wallet");
      }
      const signer = await sessionSignerFromSecretKey(await keypairBytes(options.keypair));
      const funded: MakerFundedConformanceOptions = {
        ...common,
        signer,
        ...(options.holdMs === undefined ? {} : { holdMs: options.holdMs }),
        ...(options.confirmationTimeoutMs === undefined
          ? {}
          : { confirmationTimeoutMs: options.confirmationTimeoutMs }),
        ...(options.expirySeconds === undefined ? {} : { expirySeconds: options.expirySeconds }),
      };
      const lifecycle = await runMakerFundedConformance(funded);
      if (options.mode === "funded") return lifecycle;
      if (options.takerOwner === undefined || options.takerSessionKeypair === undefined) {
        throw new TypeError("full mode requires --taker-owner and --taker-session-keypair");
      }
      const takerSigner = await sessionSignerFromSecretKey(
        await keypairBytes(options.takerSessionKeypair),
      );
      const waterfall = await runMakerWaterfallConformance({
        ...funded,
        takerOwnerWallet: options.takerOwner,
        takerSigner,
        ...(options.partialFillBaseAtoms === undefined
          ? {}
          : { partialFillBaseAtoms: options.partialFillBaseAtoms }),
        ...(options.fallbackBaseAtoms === undefined
          ? {}
          : { fallbackBaseAtoms: options.fallbackBaseAtoms }),
        ...(options.takerSide === undefined ? {} : { takerSide: options.takerSide }),
        ...(options.maximumToleranceBps === undefined
          ? {}
          : { maximumToleranceBps: options.maximumToleranceBps }),
      });
      return {
        schema_version: 1,
        mode: "full",
        ok: true,
        lifecycle,
        waterfall,
      } as const;
    })();
  process.stdout.write(`${JSON.stringify(report, null, options.pretty ? 2 : 0)}\n`);
}

function isDirectEntrypoint(path: string | undefined): boolean {
  if (path === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(path)).href;
  } catch {
    return false;
  }
}

if (isDirectEntrypoint(process.argv[1])) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown conformance failure";
    process.stderr.write(`strata-maker-conformance: ${message}\n`);
    process.exitCode = 1;
  });
}
