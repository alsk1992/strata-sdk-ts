import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { base58Encode } from "../src/client.js";
import { parseMakerConformanceArgs } from "../src/maker-conformance-cli.js";
import { assertNativeMakerTransaction } from "../src/maker-conformance.js";

function compact(value: number): Uint8Array {
  assert.ok(value >= 0 && value < 128);
  return Uint8Array.from([value]);
}

function join(...parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function transaction(options: { readonly legacy?: boolean; readonly lookups?: number } = {}): {
  readonly base64: string;
  readonly wallet: string;
} {
  const wallet = new Uint8Array(32).fill(7);
  const header = new Uint8Array([1, 0, 0]);
  const message = join(
    ...(options.legacy ? [] : [new Uint8Array([0x80])]),
    header,
    compact(1),
    wallet,
    new Uint8Array(32).fill(9),
    compact(0),
    ...(options.legacy
      ? []
      : options.lookups === 1
        ? [compact(1), new Uint8Array(32).fill(4), compact(0), compact(0)]
        : [compact(0)]),
  );
  return {
    base64: Buffer.from(join(compact(1), new Uint8Array(64), message)).toString("base64"),
    wallet: base58Encode(wallet),
  };
}

test("accepts only compact native-v0 maker envelopes without lookup tables", () => {
  const native = transaction();
  assert.deepEqual(assertNativeMakerTransaction(native.base64, native.wallet), {
    bytes: Buffer.from(native.base64, "base64").length,
    signatures: 1,
  });

  const legacy = transaction({ legacy: true });
  assert.throws(
    () => assertNativeMakerTransaction(legacy.base64, legacy.wallet),
    /not a native-v0 transaction/,
  );

  const lookup = transaction({ lookups: 1 });
  assert.throws(
    () => assertNativeMakerTransaction(lookup.base64, lookup.wallet),
    /unexpectedly uses lookup tables/,
  );

  assert.throws(
    () => assertNativeMakerTransaction(native.base64, base58Encode(new Uint8Array(32).fill(8))),
    /unexpected signer layout/,
  );
});

test("safe is the default and funded writes need the exact confirmation phrase", () => {
  assert.deepEqual(parseMakerConformanceArgs([]), {
    mode: "safe",
    confirmedFundedWrite: false,
    pretty: false,
  });
  assert.deepEqual(
    parseMakerConformanceArgs([
      "funded",
      "--keypair",
      "/secure/maker.json",
      "--confirm-funded-write",
      "RUN_FUNDED_MAINNET_CONFORMANCE",
      "--expiry-seconds",
      "30",
      "--pretty",
    ]),
    {
      mode: "funded",
      keypair: "/secure/maker.json",
      expirySeconds: 30,
      confirmedFundedWrite: true,
      pretty: true,
    },
  );
  assert.throws(
    () => parseMakerConformanceArgs([
      "funded",
      "--confirm-funded-write",
      "yes",
    ]),
    /must equal RUN_FUNDED_MAINNET_CONFORMANCE/,
  );
});

test("unknown flags and secret-like inline values fail closed", () => {
  assert.throws(() => parseMakerConformanceArgs(["--wat"]), /requires a value/);
  assert.throws(
    () => parseMakerConformanceArgs(["funded", "--secret-key", "do-not-accept"]),
    /unknown option/,
  );
});

test("the npm-style symlink executes the conformance CLI", async () => {
  const directory = await mkdtemp(joinPath(tmpdir(), "strata-maker-conformance-"));
  try {
    const target = fileURLToPath(new URL("../src/maker-conformance-cli.js", import.meta.url));
    const entrypoint = joinPath(directory, "strata-maker-conformance");
    await symlink(target, entrypoint);
    const result = spawnSync(process.execPath, [entrypoint, "--help"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Usage:\n  strata-maker-conformance safe/m);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
