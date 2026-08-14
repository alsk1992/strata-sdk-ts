import { StrataApiError, StrataContractError } from "./client.js";
import type { PlatformOrderCommandConnection } from "./platform-order-stream.js";

export interface PlatformOrderSloThresholds {
  readonly authenticationP99Ms: number;
  readonly commandP50Ms: number;
  readonly commandP95Ms: number;
  readonly commandP99Ms: number;
  readonly maximumErrorRate: number;
}

export const PRODUCTION_ORDER_COMMAND_SLO: PlatformOrderSloThresholds = {
  authenticationP99Ms: 500,
  commandP50Ms: 10,
  commandP95Ms: 25,
  commandP99Ms: 50,
  maximumErrorRate: 0.001,
};

export interface PlatformOrderSloOptions {
  /** Each call must create a separately authenticated persistent connection. */
  readonly connect: (workerIndex: number) => Promise<PlatformOrderCommandConnection>;
  readonly connections?: number;
  readonly samples?: number;
  readonly warmupSamplesPerConnection?: number;
  readonly maximumInflightPerConnection?: number;
  readonly thresholds?: PlatformOrderSloThresholds;
  /** Override only to exercise a safe environment-specific command. */
  readonly probe?: (
    connection: PlatformOrderCommandConnection,
    sampleIndex: number,
  ) => Promise<unknown>;
}

export interface PlatformOrderSloDistribution {
  readonly samples: number;
  readonly minimum_ms: number;
  readonly p50_ms: number;
  readonly p95_ms: number;
  readonly p99_ms: number;
  readonly maximum_ms: number;
}

export interface PlatformOrderSloCertificate {
  readonly schema_version: 1;
  readonly kind: "strata-order-command-slo";
  readonly generated_at_ms: number;
  readonly configuration: {
    readonly connections: number;
    readonly samples: number;
    readonly warmup_samples_per_connection: number;
    readonly maximum_inflight_per_connection: number;
  };
  readonly authentication: PlatformOrderSloDistribution;
  readonly commands: PlatformOrderSloDistribution;
  /** Wall time of the measured command phase, excluding authentication/warmup. */
  readonly measured_duration_ms: number;
  readonly throughput_commands_per_second: number;
  readonly errors: number;
  readonly sequence_errors: number;
  readonly error_rate: number;
  readonly thresholds: PlatformOrderSloThresholds;
  readonly passed: boolean;
  readonly failures: readonly string[];
}

/**
 * Produce a machine-readable live SLO certificate without submitting a trade.
 * The default probe sends a syntactically valid status lookup for an impossible
 * opaque control ID; a correlated not-found/rejected response counts as a
 * successful transport/control-plane round trip.
 */
export async function certifyPlatformOrderCommandSlo(
  options: PlatformOrderSloOptions,
): Promise<PlatformOrderSloCertificate> {
  const connectionCount = boundedInteger(options.connections ?? 50, "connections", 1, 500);
  const samples = boundedInteger(options.samples ?? 10_000, "samples", 1, 1_000_000);
  const warmup = boundedInteger(
    options.warmupSamplesPerConnection ?? 10,
    "warmupSamplesPerConnection",
    0,
    1_000,
  );
  const inflight = boundedInteger(
    options.maximumInflightPerConnection ?? 16,
    "maximumInflightPerConnection",
    1,
    256,
  );
  const thresholds = checkedThresholds(options.thresholds ?? PRODUCTION_ORDER_COMMAND_SLO);
  const probe = options.probe ?? defaultProbe;
  const connections: PlatformOrderCommandConnection[] = [];
  const authenticationMs: number[] = [];
  try {
    await Promise.all(Array.from({ length: connectionCount }, async (_, index) => {
      const started = monotonicMs();
      const connection = await options.connect(index);
      connections[index] = connection;
      await connection.ready;
      authenticationMs[index] = monotonicMs() - started;
    }));
    await Promise.all(connections.flatMap((connection, connectionIndex) =>
      Array.from({ length: warmup }, (_, index) =>
        completedProbe(probe, connection, -(connectionIndex * warmup + index + 1)))));

    const commandMs = new Array<number>(samples);
    let errors = 0;
    let sequenceErrors = 0;
    let nextSample = 0;
    const measuredStarted = monotonicMs();
    const runners = connections.flatMap((connection) =>
      Array.from({ length: inflight }, async () => {
        while (true) {
          const index = nextSample;
          nextSample += 1;
          if (index >= samples) return;
          const started = monotonicMs();
          const completed = await completedProbe(probe, connection, index);
          commandMs[index] = monotonicMs() - started;
          if (completed !== "success") errors += 1;
          if (completed === "sequence_error") sequenceErrors += 1;
        }
      }));
    await Promise.all(runners);
    const measuredDurationMs = Math.max(monotonicMs() - measuredStarted, Number.EPSILON);

    const authentication = distribution(authenticationMs);
    const commands = distribution(commandMs);
    const errorRate = errors / samples;
    const failures: string[] = [];
    if (authentication.p99_ms > thresholds.authenticationP99Ms) {
      failures.push("authentication_p99");
    }
    if (commands.p50_ms > thresholds.commandP50Ms) failures.push("command_p50");
    if (commands.p95_ms > thresholds.commandP95Ms) failures.push("command_p95");
    if (commands.p99_ms > thresholds.commandP99Ms) failures.push("command_p99");
    if (sequenceErrors > 0) failures.push("sequence_integrity");
    if (errorRate > thresholds.maximumErrorRate) failures.push("error_rate");
    return {
      schema_version: 1,
      kind: "strata-order-command-slo",
      generated_at_ms: Date.now(),
      configuration: {
        connections: connectionCount,
        samples,
        warmup_samples_per_connection: warmup,
        maximum_inflight_per_connection: inflight,
      },
      authentication,
      commands,
      measured_duration_ms: round(measuredDurationMs),
      throughput_commands_per_second: round(samples * 1_000 / measuredDurationMs),
      errors,
      sequence_errors: sequenceErrors,
      error_rate: errorRate,
      thresholds,
      passed: failures.length === 0,
      failures,
    };
  } finally {
    connections.forEach((connection) => connection?.close());
  }
}

async function defaultProbe(
  connection: PlatformOrderCommandConnection,
  sampleIndex: number,
): Promise<unknown> {
  return connection.status(
    `or_${"0".repeat(32)}`,
    `slo-${Math.abs(sampleIndex).toString(36)}`,
  );
}

async function completedProbe(
  probe: (connection: PlatformOrderCommandConnection, sampleIndex: number) => Promise<unknown>,
  connection: PlatformOrderCommandConnection,
  sampleIndex: number,
): Promise<"success" | "sequence_error" | "error"> {
  try {
    await probe(connection, sampleIndex);
    return "success";
  } catch (error) {
    // The non-mutating default deliberately targets an impossible control ID.
    // Either authorization rejection or not-found proves a correlated server
    // command completed; transport, timeout, and sequence failures do not.
    if (error instanceof StrataApiError
        && (error.code === "order_not_found" || error.code === "session_expired")) {
      return "success";
    }
    if (error instanceof StrataContractError
        && error.message.toLowerCase().includes("sequence")) {
      return "sequence_error";
    }
    return "error";
  }
}

function distribution(values: readonly number[]): PlatformOrderSloDistribution {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("SLO sample distribution is invalid");
  }
  const ordered = [...values].sort((left, right) => left - right);
  const pick = (percentile: number) =>
    ordered[Math.max(0, Math.ceil(percentile * ordered.length) - 1)]!;
  const round = (value: number) => Math.round(value * 1_000) / 1_000;
  return {
    samples: ordered.length,
    minimum_ms: round(ordered[0]!),
    p50_ms: round(pick(0.50)),
    p95_ms: round(pick(0.95)),
    p99_ms: round(pick(0.99)),
    maximum_ms: round(ordered.at(-1)!),
  };
}

function checkedThresholds(value: PlatformOrderSloThresholds): PlatformOrderSloThresholds {
  for (const [field, number] of Object.entries(value)) {
    if (!Number.isFinite(number) || number < 0) {
      throw new TypeError(`${field} must be a finite non-negative number`);
    }
  }
  if (value.maximumErrorRate > 1) {
    throw new TypeError("maximumErrorRate must be between zero and one");
  }
  return { ...value };
}

function boundedInteger(value: number, field: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function monotonicMs(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
