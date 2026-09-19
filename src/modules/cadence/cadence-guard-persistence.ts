/**
 * Durable state for the cadence guards.
 *
 * The cadence-guard.helper.ts guards keep their state in module-local Maps — in-memory only. Every
 * process restart silently zeroed the 360s chip interval, the rate-limit windows and the guard
 * counters, so a restart mid-day could back-to-back dispatch on the same chip and no one could tell
 * from the metrics, because the metrics restarted with the process too.
 *
 * This module persists the guard state as a single JSON snapshot under data/ (gitignored), written
 * atomically (tmp + rename) so a crash mid-write cannot leave a truncated file. Writes are
 * debounced because recordChipSentTimestamp() runs once per dispatch — at the 360s interval the
 * write rate is tiny, and the debounce also collapses test bursts that would otherwise turn into
 * many sync writes.
 *
 * Prometheus semantics: counters must be monotonic. On boot, persisted lifetime counters become the
 * in-process baseline; the rendered total is baseline + process-lifetime delta, so Grafana never
 * sees the totals fall (the only visible reset is the per-process re-anchor rate() already handles).
 *
 * Kept dependency-free: plain fs, no ORM, no Redis. The state is two chips' worth of timestamps —
 * a row in a table or a Redis key would buy nothing and cost a connection.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Snapshot location. Defaults to <cwd>/data/guard-state.json (data/ is gitignored); GUARD_STATE_PATH
 * overrides it so tests (and unusual deployments) can redirect the file without mocking fs.
 */
export function guardStateFile(): string {
  return process.env.GUARD_STATE_PATH || path.resolve(process.cwd(), 'data', 'guard-state.json');
}

/** Debounce window for snapshot writes: collapses bursts, bounds fs churn. */
export const FLUSH_DEBOUNCE_MS = 2_000;

/** A persisted rate-limit window entry is only relevant within the 60s window itself. */
const RATE_WINDOW_TTL_MS = 60_000;

/** A persisted webhook fingerprint is only relevant within its dedup TTL. */
const WEBHOOK_FINGERPRINT_TTL_MS = 300_000;

/** A persisted chip lock is only relevant within its lock TTL. */
const CHIP_LOCK_TTL_MS = 15_000;

export interface GuardCounters {
  protected_contacts_blocked: number;
  chip_interval_rejections: number;
  rate_limit_rejections: number;
  duplicate_webhooks_ignored: number;
  concurrency_lock_conflicts: number;
  dispatches_recorded: number;
  chip_failover_count: number;
}

export interface GuardSnapshotV1 {
  version: 1;
  savedAt: string;
  /** sessionId -> last dispatch timestamp (ms epoch). */
  lastSentTimestamps: Record<string, number>;
  /** sessionId -> dispatch timestamps inside the current 60s rate window. */
  chipDispatchWindows: Record<string, number[]>;
  /** sha256 fingerprint -> first-seen timestamp (ms epoch). */
  webhookFingerprints: Record<string, number>;
  /** sessionId -> lock (lockId + expiry). Short-TTL, persisted for multi-worker visibility. */
  chipLocks: Record<string, { lockId: string; expiresAt: number }>;
  /** Lifetime guard counters (baseline + runtime at save time), monotonic across restarts. */
  counters: GuardCounters;
}

interface LoadedState {
  lastSentTimestamps: Record<string, number>;
  chipDispatchWindows: Record<string, number[]>;
  webhookFingerprints: Record<string, number>;
  chipLocks: Record<string, { lockId: string; expiresAt: number }>;
  /** Counters persisted by a previous process; added onto runtime deltas when rendering totals. */
  counterBaseline: GuardCounters;
  /** In-process counter delta since boot (set by the helper via setGuardRuntimeCounters). */
  runtimeCounters: GuardCounters;
}

const emptyCounters = (): GuardCounters => ({
  protected_contacts_blocked: 0,
  chip_interval_rejections: 0,
  rate_limit_rejections: 0,
  duplicate_webhooks_ignored: 0,
  concurrency_lock_conflicts: 0,
  dispatches_recorded: 0,
  chip_failover_count: 0,
});

const sumCounters = (a: GuardCounters, b: GuardCounters): GuardCounters => ({
  protected_contacts_blocked: a.protected_contacts_blocked + b.protected_contacts_blocked,
  chip_interval_rejections: a.chip_interval_rejections + b.chip_interval_rejections,
  rate_limit_rejections: a.rate_limit_rejections + b.rate_limit_rejections,
  duplicate_webhooks_ignored: a.duplicate_webhooks_ignored + b.duplicate_webhooks_ignored,
  concurrency_lock_conflicts: a.concurrency_lock_conflicts + b.concurrency_lock_conflicts,
  dispatches_recorded: a.dispatches_recorded + b.dispatches_recorded,
  chip_failover_count: a.chip_failover_count + b.chip_failover_count,
});

const loaded: LoadedState = {
  lastSentTimestamps: {},
  chipDispatchWindows: {},
  webhookFingerprints: {},
  chipLocks: {},
  counterBaseline: emptyCounters(),
  runtimeCounters: emptyCounters(),
};

let loadAttempted = false;
let writeTimer: NodeJS.Timeout | null = null;
let lastWriteAt = 0;

function readSnapshot(): GuardSnapshotV1 | null {
  try {
    const file = guardStateFile();
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as GuardSnapshotV1;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    // A corrupt/partial snapshot must never block boot: guards start fresh, and the next
    // successful dispatch overwrites the file.
    return null;
  }
}

/**
 * Load the persisted snapshot into memory (once per process). Expired entries (rate windows,
 * webhook fingerprints, locks) are dropped on load. lastSent timestamps are kept regardless of
 * age on purpose: the 360s interval check compares against now, so an old timestamp simply no
 * longer blocks — but a recent one still does after a restart, which is the whole point.
 */
export function loadGuardState(): void {
  if (loadAttempted) return;
  loadAttempted = true;

  const snap = readSnapshot();
  if (!snap) return;

  const now = Date.now();
  loaded.lastSentTimestamps = { ...(snap.lastSentTimestamps ?? {}) };
  loaded.webhookFingerprints = Object.fromEntries(
    Object.entries(snap.webhookFingerprints ?? {}).filter(([, ts]) => now - ts < WEBHOOK_FINGERPRINT_TTL_MS),
  );
  loaded.chipLocks = Object.fromEntries(
    Object.entries(snap.chipLocks ?? {}).filter(([, lock]) => lock.expiresAt > now),
  );
  loaded.chipDispatchWindows = {};
  for (const [sessionId, timestamps] of Object.entries(snap.chipDispatchWindows ?? {})) {
    const fresh = (timestamps ?? []).filter(ts => now - ts < RATE_WINDOW_TTL_MS);
    if (fresh.length > 0) loaded.chipDispatchWindows[sessionId] = fresh;
  }
  loaded.counterBaseline = { ...emptyCounters(), ...(snap.counters ?? {}) };
}

/**
 * Merge helper state (windows/fingerprints/locks) into the pending snapshot. Called by the guard
 * helper on every mutation so the snapshot always reflects the live Maps.
 */
export function setGuardRuntimeState(state: {
  lastSentTimestamps: Record<string, number>;
  chipDispatchWindows: Record<string, number[]>;
  webhookFingerprints: Record<string, number>;
  chipLocks: Record<string, { lockId: string; expiresAt: number }>;
}): void {
  loaded.lastSentTimestamps = { ...state.lastSentTimestamps };
  loaded.chipDispatchWindows = Object.fromEntries(
    Object.entries(state.chipDispatchWindows).map(([k, v]) => [k, [...v]]),
  );
  loaded.webhookFingerprints = { ...state.webhookFingerprints };
  loaded.chipLocks = Object.fromEntries(Object.entries(state.chipLocks).map(([k, v]) => [k, { ...v }]));
}

/** Record the live in-process counter delta (baseline excluded); set by the guard helper. */
export function setGuardRuntimeCounters(counters: GuardCounters): void {
  loaded.runtimeCounters = { ...counters };
}

/**
 * Test hook: zero baseline AND runtime counters in memory without touching the snapshot file.
 * resetGuardMetrics() uses this so resetting one test's assertions cannot destroy the on-disk
 * snapshot another test (or the production boot) still needs to read.
 */
export function zeroGuardCountersForTests(): void {
  loaded.counterBaseline = emptyCounters();
  loaded.runtimeCounters = emptyCounters();
}

/**
 * Post-load runtime state for hydrating the guard helper's Maps: what a previous process left
 * behind, already filtered to non-expired entries. Returns copies — callers own their Maps.
 */
export function getPersistedRuntimeState(): {
  lastSentTimestamps: Record<string, number>;
  chipDispatchWindows: Record<string, number[]>;
  webhookFingerprints: Record<string, number>;
  chipLocks: Record<string, { lockId: string; expiresAt: number }>;
} {
  return {
    lastSentTimestamps: { ...loaded.lastSentTimestamps },
    chipDispatchWindows: Object.fromEntries(Object.entries(loaded.chipDispatchWindows).map(([k, v]) => [k, [...v]])),
    webhookFingerprints: { ...loaded.webhookFingerprints },
    chipLocks: Object.fromEntries(Object.entries(loaded.chipLocks).map(([k, v]) => [k, { ...v }])),
  };
}

/** Lifetime counter totals: baseline (pre-restart, from snapshot) + in-process delta since boot. */
export function getGuardLifetimeCounters(): GuardCounters {
  return sumCounters(loaded.counterBaseline, loaded.runtimeCounters);
}

/** Build the snapshot object that would be written right now. */
export function buildGuardSnapshot(nowTimestampMs: number = Date.now()): GuardSnapshotV1 {
  return {
    version: 1,
    savedAt: new Date(nowTimestampMs).toISOString(),
    lastSentTimestamps: { ...loaded.lastSentTimestamps },
    chipDispatchWindows: Object.fromEntries(Object.entries(loaded.chipDispatchWindows).map(([k, v]) => [k, [...v]])),
    webhookFingerprints: { ...loaded.webhookFingerprints },
    chipLocks: Object.fromEntries(Object.entries(loaded.chipLocks).map(([k, v]) => [k, { ...v }])),
    counters: getGuardLifetimeCounters(),
  };
}

/** Synchronous atomic write: tmp file + rename, so a crash never leaves a truncated snapshot. */
export function flushGuardStateSync(): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  try {
    const file = guardStateFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(buildGuardSnapshot(), null, 2), 'utf8');
    fs.renameSync(tmp, file);
    lastWriteAt = Date.now();
  } catch {
    // Best-effort: a failed write must never break a dispatch. The next flush retries.
  }
}

/** Debounced flush: writes immediately outside the debounce window, schedules one inside it. */
export function scheduleGuardStateFlush(): void {
  const now = Date.now();
  // lastWriteAt === 0 means nothing was written yet this process: the first flush must be
  // immediate, so a crash right after the first dispatch still leaves the snapshot on disk
  // (that timestamp is what enforces the 360s interval across the restart).
  if (lastWriteAt === 0 || now - lastWriteAt >= FLUSH_DEBOUNCE_MS) {
    flushGuardStateSync();
    return;
  }
  if (!writeTimer) {
    writeTimer = setTimeout(() => {
      writeTimer = null;
      flushGuardStateSync();
    }, FLUSH_DEBOUNCE_MS);
    // Do not hold the process open for a metrics write.
    writeTimer.unref?.();
  }
}

/** Test hook: reset all loaded state (does not touch the file). */
export function resetGuardPersistenceForTests(): void {
  loadAttempted = false;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  loaded.lastSentTimestamps = {};
  loaded.chipDispatchWindows = {};
  loaded.webhookFingerprints = {};
  loaded.chipLocks = {};
  loaded.counterBaseline = emptyCounters();
  loaded.runtimeCounters = emptyCounters();
  lastWriteAt = 0;
}

export const GUARD_TTLS = {
  RATE_WINDOW_TTL_MS,
  WEBHOOK_FINGERPRINT_TTL_MS,
  CHIP_LOCK_TTL_MS,
} as const;
