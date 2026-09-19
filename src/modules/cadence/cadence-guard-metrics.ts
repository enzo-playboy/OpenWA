/**
 * Prometheus exposition for the cadence guards — dispatched by MetricsService.render() via
 * `lines.push(...renderCadenceGuardMetrics())`, mirroring src/common/metrics/request-metrics.ts.
 *
 * Counter families are ALWAYS emitted (zeros included), unlike the send-pacing refusals family:
 * a guard counter sitting at zero is a meaningful operational fact (e.g. protected-contact
 * blocking has never fired), and these rejections happen constantly by design — the 360s chip
 * interval rejects nearly every engine tick, so the family would never be absent anyway.
 *
 * Counters are lifetime totals (pre-restart baseline from the durable snapshot + process delta),
 * so a process restart does not look like a traffic drop on rate()/increase() dashboards.
 */

import { getChipLastSentSnapshot, getGuardMetrics } from './cadence-guard.helper';
import { renderAgentDecisionLines, renderOpeningStyleLines } from '../ai-agents/agents-metrics';

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/** Render the cadence-guard series as Prometheus text-exposition lines. */
export async function renderCadenceGuardMetrics(): Promise<string[]> {
  const metrics = getGuardMetrics();
  const lines: string[] = [];

  lines.push(
    '# HELP openwa_cadence_guard_rejections_total Dispatches rejected by cadence guards, by guard type (lifetime, monotonic across restarts).',
  );
  lines.push('# TYPE openwa_cadence_guard_rejections_total counter');
  const rejections: Array<[string, number]> = [
    ['protected_contact', metrics.protected_contacts_blocked],
    ['chip_interval', metrics.chip_interval_rejections],
    ['rate_limit', metrics.rate_limit_rejections],
    ['duplicate_webhook', metrics.duplicate_webhooks_ignored],
    ['concurrency_lock', metrics.concurrency_lock_conflicts],
  ];
  for (const [guard, count] of rejections) {
    lines.push(`openwa_cadence_guard_rejections_total{guard="${escapeLabelValue(guard)}"} ${count}`);
  }

  lines.push(
    '# HELP openwa_cadence_dispatches_recorded_total Dispatches recorded by the cadence engine (lifetime, monotonic across restarts).',
  );
  lines.push('# TYPE openwa_cadence_dispatches_recorded_total counter');
  lines.push(`openwa_cadence_dispatches_recorded_total ${metrics.dispatches_recorded}`);

  lines.push(
    '# HELP openwa_cadence_chip_failovers_total Chip failovers resolved by niche routing (lifetime, monotonic across restarts).',
  );
  lines.push('# TYPE openwa_cadence_chip_failovers_total counter');
  lines.push(`openwa_cadence_chip_failovers_total ${metrics.chip_failover_count}`);

  // Emitted only for chips that have dispatched at least once (in this or a previous process):
  // a family that appears at its first occurrence is easier to alert on than one pinned at zero.
  const lastSent = getChipLastSentSnapshot();
  if (Object.keys(lastSent).length > 0) {
    lines.push('# HELP openwa_cadence_chip_last_sent_timestamp_seconds Last dispatch per chip, in unix seconds.');
    lines.push('# TYPE openwa_cadence_chip_last_sent_timestamp_seconds gauge');
    for (const [sessionId, timestampMs] of Object.entries(lastSent)) {
      const seconds = Math.floor(timestampMs / 1000);
      lines.push(
        `openwa_cadence_chip_last_sent_timestamp_seconds{chip_id="${escapeLabelValue(sessionId)}"} ${seconds}`,
      );
    }
  }

  // Agent decisions (prospecção autônoma): empty until a decision is recorded this process.
  lines.push(...renderAgentDecisionLines());
  // Opening-style response rates (feedback loop). Async: the engagement store is a DB read.
  lines.push(...(await renderOpeningStyleLines()));

  return lines;
}
