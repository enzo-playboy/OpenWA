/**
 * Process-local counters for agent decisions, rendered into the scrape by
 * cadence-guard-metrics.ts (which reads them via renderAgentDecisionLines). Counters are
 * process-lifetime only — agent decisions are cheap and frequent, and persisting them would add
 * snapshot churn without changing any alert anyone would write. Prometheus treats a process
 * restart as a counter reset, which rate()/increase() already handle.
 */

export type AgentDecisionOutcome = 'dispatch' | 'hold' | 'reject';

export type AgentSource = 'llm' | 'heuristic' | 'template' | 'rules';

interface AgentDecisionKey {
  agent: string;
  outcome: AgentDecisionOutcome;
  source: AgentSource;
}

const decisionTotals = new Map<string, number>();

function keyOf({ agent, outcome, source }: AgentDecisionKey): string {
  return `${agent}|${outcome}|${source}`;
}

/** Record one agent decision (a vote, a check result, or a final consensus). */
export function recordAgentDecision(
  agent: 'qualification' | 'message' | 'safety' | 'consensus' | 'responder',
  outcome: AgentDecisionOutcome,
  source: AgentSource,
): void {
  const key = keyOf({ agent, outcome, source });
  decisionTotals.set(key, (decisionTotals.get(key) ?? 0) + 1);
}

/** Current lifetime totals keyed the same way they are rendered. */
export function getAgentDecisionTotals(): Array<AgentDecisionKey & { count: number }> {
  return [...decisionTotals.entries()].map(([key, count]) => {
    const [agent, outcome, source] = key.split('|') as [string, AgentDecisionOutcome, AgentSource];
    return { agent, outcome, source, count };
  });
}

/** Test hook. */
export function resetAgentDecisionTotals(): void {
  decisionTotals.clear();
}

/**
 * Render the agent decision series as Prometheus text-exposition lines. Empty until a decision
 * has been recorded this process (a family that appears at its first occurrence is easier to
 * alert on than one pinned at zero).
 */
export function renderAgentDecisionLines(): string[] {
  if (decisionTotals.size === 0) return [];

  const escapeLabelValue = (value: string): string =>
    value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

  const lines: string[] = [
    '# HELP openwa_agent_decisions_total Decisions recorded by the autonomous agents, by agent, outcome and source.',
    '# TYPE openwa_agent_decisions_total counter',
  ];
  for (const { agent, outcome, source, count } of getAgentDecisionTotals()) {
    lines.push(
      `openwa_agent_decisions_total{agent="${escapeLabelValue(agent)}",outcome="${escapeLabelValue(outcome)}",source="${escapeLabelValue(source)}"} ${count}`,
    );
  }
  return lines;
}

/**
 * Opening-style response rates from the feedback loop's engagement store. Rendered as GAUGES
 * (a rate is a ratio, not an accumulation) with persona (nicho) in the label. Read synchronously
 * through the reader injected at module wiring; absent when the store has no data yet.
 */
export interface OpeningStyleMetricReader {
  getStylePerformance(): Promise<Array<{ openingStyle: string; totalSent: number; responseRatePercent: number; personaId?: string }>>;
}

let styleReader: OpeningStyleMetricReader | null = null;

/** Wire the engagement store reader (called once at module bootstrap). */
export function setOpeningStyleMetricReader(reader: OpeningStyleMetricReader): void {
  styleReader = reader;
}

export async function renderOpeningStyleLines(): Promise<string[]> {
  if (!styleReader) return [];
  let rows: Awaited<ReturnType<OpeningStyleMetricReader['getStylePerformance']>>;
  try {
    rows = await styleReader.getStylePerformance();
  } catch {
    return [];
  }
  if (rows.length === 0) return [];

  const escapeLabelValue = (value: string): string =>
    value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

  const lines: string[] = [
    '# HELP openwa_agent_opening_style_response_rate_percent Response rate per opening style, from tracked engagements (nicho-scoped when persona is set).',
    '# TYPE openwa_agent_opening_style_response_rate_percent gauge',
    '# HELP openwa_agent_opening_style_sent_total Sends tracked per opening style (nicho-scoped when persona is set).',
    '# TYPE openwa_agent_opening_style_sent_total gauge',
  ];
  for (const row of rows) {
    const persona = row.personaId ?? 'all';
    lines.push(
      `openwa_agent_opening_style_response_rate_percent{style="${escapeLabelValue(row.openingStyle)}",persona="${escapeLabelValue(persona)}"} ${row.responseRatePercent}`,
    );
    lines.push(
      `openwa_agent_opening_style_sent_total{style="${escapeLabelValue(row.openingStyle)}",persona="${escapeLabelValue(persona)}"} ${row.totalSent}`,
    );
  }
  return lines;
}
