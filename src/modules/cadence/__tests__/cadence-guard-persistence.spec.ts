import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildGuardSnapshot,
  flushGuardStateSync,
  getPersistedRuntimeState,
  getGuardLifetimeCounters,
  GUARD_TTLS,
  GuardSnapshotV1,
  loadGuardState,
  resetGuardPersistenceForTests,
  setGuardRuntimeState,
} from '../cadence-guard-persistence';
import {
  getGuardMetrics,
  initGuardStatePersistence,
  isDuplicateWebhook,
  recordChipSentTimestamp,
  resetGuardMetrics,
  validateChipInterval,
} from '../cadence-guard.helper';
import { renderCadenceGuardMetrics } from '../cadence-guard-metrics';

describe('Cadence guard durable state (snapshot round-trip)', () => {
  let tmpDir: string;
  let stateFile: string;

  const snapshotOnDisk = (): GuardSnapshotV1 => JSON.parse(fs.readFileSync(stateFile, 'utf8')) as GuardSnapshotV1;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-state-'));
    stateFile = path.join(tmpDir, 'guard-state.json');
    process.env.GUARD_STATE_PATH = stateFile;
    resetGuardPersistenceForTests();
    resetGuardMetrics();
  });

  afterEach(() => {
    delete process.env.GUARD_STATE_PATH;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes an atomic snapshot whose counters are the lifetime totals', () => {
    recordChipSentTimestamp('chip-a', 1_000_000);
    isDuplicateWebhook({ from: '5511999999999', text: 'oi', timestamp: 1_000_000 }, 300, 1_000_000);
    isDuplicateWebhook({ from: '5511999999999', text: 'oi', timestamp: 1_000_000 }, 300, 1_000_000); // dup

    flushGuardStateSync();

    const snap = snapshotOnDisk();
    expect(snap.version).toBe(1);
    expect(snap.lastSentTimestamps['chip-a']).toBe(1_000_000);
    expect(snap.counters.dispatches_recorded).toBe(1);
    expect(snap.counters.duplicate_webhooks_ignored).toBe(1);
  });

  it('restores the 360s chip interval across a simulated process restart', () => {
    const now = Date.now();
    recordChipSentTimestamp('chip-a', now);

    // New "process": reset loaded state, re-load from disk and hydrate via the real boot path.
    resetGuardPersistenceForTests();
    resetGuardMetrics();
    loadGuardState();
    initGuardStatePersistence();

    // The guard still enforces the interval even though this process never dispatched.
    const check = validateChipInterval('chip-a', 360, now + 10_000);
    expect(check.valid).toBe(false);
    expect(check.remainingSeconds).toBe(350);
  });

  it('does not let a restart block dispatches after the interval has elapsed', () => {
    const now = Date.now();
    recordChipSentTimestamp('chip-a', now);

    resetGuardPersistenceForTests();
    resetGuardMetrics();
    loadGuardState();
    initGuardStatePersistence();

    const check = validateChipInterval('chip-a', 360, now + 361_000);
    expect(check.valid).toBe(true);
  });

  it('drops expired rate windows, fingerprints and locks on load, but keeps lastSent', () => {
    const now = Date.now();
    setGuardRuntimeState({
      lastSentTimestamps: { 'chip-a': now - 10_000 },
      chipDispatchWindows: { 'chip-a': [now - GUARD_TTLS.RATE_WINDOW_TTL_MS - 1, now - 1_000] },
      webhookFingerprints: { fp_fresh: now - 1_000, fp_stale: now - GUARD_TTLS.WEBHOOK_FINGERPRINT_TTL_MS - 1 },
      chipLocks: { 'chip-a': { lockId: 'l1', expiresAt: now - GUARD_TTLS.CHIP_LOCK_TTL_MS } },
    });

    flushGuardStateSync();
    resetGuardPersistenceForTests();
    loadGuardState();

    const state = getPersistedRuntimeState();
    expect(state.lastSentTimestamps['chip-a']).toBe(now - 10_000);
    expect(state.chipDispatchWindows['chip-a']).toEqual([now - 1_000]);
    expect(Object.keys(state.webhookFingerprints)).toEqual(['fp_fresh']);
    expect(Object.keys(state.chipLocks)).toEqual([]);
  });

  it('keeps counters monotonic across a restart (baseline + runtime delta)', () => {
    recordChipSentTimestamp('chip-a');
    flushGuardStateSync();
    const onDisk = snapshotOnDisk().counters.dispatches_recorded;
    expect(onDisk).toBe(1);

    resetGuardPersistenceForTests();
    resetGuardMetrics();
    loadGuardState();
    initGuardStatePersistence();

    // New process records one more dispatch.
    recordChipSentTimestamp('chip-a');
    expect(getGuardLifetimeCounters().dispatches_recorded).toBe(2);
  });

  it('survives a corrupt snapshot without blocking boot', () => {
    fs.writeFileSync(stateFile, '{corrupt json', 'utf8');
    expect(() => loadGuardState()).not.toThrow();
    expect(getGuardLifetimeCounters().dispatches_recorded).toBe(0);
  });

  it('resetGuardMetrics zeroes the baseline so test assertions stay deterministic', () => {
    recordChipSentTimestamp('chip-a');
    isDuplicateWebhook({ from: 'x', text: 'y', timestamp: 1 }, 300, 1);
    isDuplicateWebhook({ from: 'x', text: 'y', timestamp: 1 }, 300, 1);
    resetGuardMetrics();

    expect(getGuardMetrics().dispatches_recorded).toBe(0);
    expect(getGuardMetrics().duplicate_webhooks_ignored).toBe(0);
  });

  it('buildGuardSnapshot deep-copies runtime maps (mutating the snapshot does not leak back)', () => {
    recordChipSentTimestamp('chip-a', 1);
    const snap = buildGuardSnapshot();
    snap.chipDispatchWindows['chip-a'].push(999);
    snap.lastSentTimestamps['chip-b'] = 42;

    expect(getGuardMetrics().dispatches_recorded).toBe(1);
    flushGuardStateSync();
    expect(snapshotOnDisk().lastSentTimestamps['chip-b']).toBeUndefined();
  });
});

describe('renderCadenceGuardMetrics', () => {
  beforeEach(() => {
    process.env.GUARD_STATE_PATH = path.join(os.tmpdir(), `guard-state-render-${Date.now()}.json`);
    resetGuardPersistenceForTests();
    resetGuardMetrics();
  });

  afterEach(() => {
    delete process.env.GUARD_STATE_PATH;
  });

  it('emits every guard rejection family at zero before anything happened', () => {
    const lines = renderCadenceGuardMetrics();
    const text = lines.join('\n');

    expect(text).toContain('# TYPE openwa_cadence_guard_rejections_total counter');
    expect(text).toContain('openwa_cadence_guard_rejections_total{guard="protected_contact"} 0');
    expect(text).toContain('openwa_cadence_guard_rejections_total{guard="chip_interval"} 0');
    expect(text).toContain('openwa_cadence_guard_rejections_total{guard="rate_limit"} 0');
    expect(text).toContain('openwa_cadence_guard_rejections_total{guard="duplicate_webhook"} 0');
    expect(text).toContain('openwa_cadence_guard_rejections_total{guard="concurrency_lock"} 0');
    expect(text).toContain('openwa_cadence_dispatches_recorded_total 0');
    expect(text).toContain('openwa_cadence_chip_failovers_total 0');
    // No chip has dispatched: the per-chip gauge family stays absent.
    expect(text).not.toContain('openwa_cadence_chip_last_sent_timestamp_seconds{');
  });

  it('renders recorded dispatches, rejections and per-chip last-sent gauges', () => {
    const t = 1_700_000_000_000;
    recordChipSentTimestamp('chip-a', t);
    validateChipInterval('chip-a', 360, t + 1_000); // rejected -> chip_interval++
    renderCadenceGuardMetrics();

    const text = renderCadenceGuardMetrics().join('\n');
    expect(text).toContain('openwa_cadence_dispatches_recorded_total 1');
    expect(text).toContain('openwa_cadence_guard_rejections_total{guard="chip_interval"} 1');
    expect(text).toContain(`openwa_cadence_chip_last_sent_timestamp_seconds{chip_id="chip-a"} ${Math.floor(t / 1000)}`);
  });

  it('escapes label values', () => {
    recordChipSentTimestamp('chip"\\x', 1_700_000_000_000);
    const text = renderCadenceGuardMetrics().join('\n');
    expect(text).toContain('chip_id="chip\\"\\\\x"');
  });
});
