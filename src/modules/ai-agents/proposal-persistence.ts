/**
 * Durable state for the agent orchestrator's proposal queue.
 *
 * The orchestrator keeps proposals in an in-memory bounded ring — suggestions, not records — which
 * is fine until a restart drops proposals that were already marked 'proposed' in the CRM. After a
 * restart the scheduler's durable dedupe marker prevents those leads from ever being re-proposed:
 * the lead falls into a hole (proposed, proposal lost, never surfaces again).
 *
 * This module persists pending proposals (decision !== terminal 'spent'/'reject') as a single JSON
 * snapshot under data/ (gitignored), written atomically (tmp + rename). Rejected proposals are NOT
 * persisted: they are pipeline noise; the operator's audit trail is the agent decision counters.
 * Proposals already dispatched (spent) are also dropped — the durable trail is the message store.
 *
 * Kept dependency-free like cadence-guard-persistence: plain fs, no ORM, no Redis.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DispatchProposal } from './agents.types';

/** Snapshot location. AGENT_PROPOSALS_PATH overrides it for tests and unusual deployments. */
export function proposalsStateFile(): string {
  return process.env.AGENT_PROPOSALS_PATH || path.resolve(process.cwd(), 'data', 'agent-proposals.json');
}

export interface ProposalSnapshotV1 {
  version: 1;
  savedAt: string;
  /** proposal id -> proposal (only pending/hold ones worth restoring). */
  proposals: Record<string, DispatchProposal>;
}

const snapshot: ProposalSnapshotV1 = { version: 1, savedAt: '', proposals: {} };

let loadAttempted = false;

/** Cap on restored proposals: matches the orchestrator's in-memory ring (MAX_PROPOSALS). */
export const MAX_PERSISTED_PROPOSALS = 500;

function readSnapshot(): ProposalSnapshotV1 | null {
  try {
    const file = proposalsStateFile();
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as ProposalSnapshotV1;
    if (parsed?.version !== 1 || typeof parsed.proposals !== 'object' || parsed.proposals === null) return null;
    return parsed;
  } catch {
    // A corrupt/partial snapshot must never block boot: the queue starts empty and the next
    // store/drop overwrites the file. Manual repair of the file is the recovery path.
    return null;
  }
}

/** Proposals worth keeping across restarts: anything still awaiting (or needing) a human decision. */
export function isPersistableProposal(proposal: DispatchProposal): boolean {
  return proposal.decision.decision === 'dispatch' || proposal.decision.decision === 'hold';
}

/** Load the persisted snapshot into the in-memory map (once per process). Idempotent. */
export function loadProposalsFromDisk(): void {
  if (loadAttempted) return;
  loadAttempted = true;
  const parsed = readSnapshot();
  if (!parsed) return;
  for (const [id, proposal] of Object.entries(parsed.proposals)) {
    if (proposal && isPersistableProposal(proposal)) snapshot.proposals[id] = proposal;
  }
}

/** Replace the whole in-memory pending set (used right after a load). */
export function pendingProposals(): DispatchProposal[] {
  loadProposalsFromDisk();
  return Object.values(snapshot.proposals);
}

/** Upsert one proposal into the durable set. Prunes to the cap, oldest first. */
export function persistProposal(proposal: DispatchProposal): void {
  loadProposalsFromDisk();
  if (!isPersistableProposal(proposal)) {
    delete snapshot.proposals[proposal.id];
    scheduleProposalsFlush();
    return;
  }
  snapshot.proposals[proposal.id] = proposal;
  const entries = Object.entries(snapshot.proposals);
  if (entries.length > MAX_PERSISTED_PROPOSALS) {
    entries
      .sort((a, b) => String(a[1].createdAt).localeCompare(String(b[1].createdAt)))
      .slice(0, entries.length - MAX_PERSISTED_PROPOSALS)
      .forEach(([id]) => delete snapshot.proposals[id]);
  }
  scheduleProposalsFlush();
}

/** Remove a proposal from the durable set (spent, rejected, or explicitly discarded). */
export function dropProposal(id: string): void {
  loadProposalsFromDisk();
  if (!(id in snapshot.proposals)) return;
  delete snapshot.proposals[id];
  scheduleProposalsFlush();
}

/** Test hook: forget everything, including the loaded flag. Does not touch the snapshot file. */
export function resetProposalPersistenceForTests(): void {
  snapshot.proposals = {};
  loadAttempted = false;
}

let writeTimer: NodeJS.Timeout | null = null;

/** Debounced atomic write. Small state, low write rate — debounce collapses bursts. */
export function scheduleProposalsFlush(): void {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    flushProposalsSync();
  }, 2_000);
  // Never keep the process alive for a snapshot write.
  writeTimer.unref?.();
}

/** Write the snapshot now (tmp + rename so a crash mid-write cannot truncate the file). */
export function flushProposalsSync(): void {
  try {
    const file = proposalsStateFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    snapshot.savedAt = new Date().toISOString();
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch {
    // Best-effort: the in-memory ring still serves this process.
  }
}
