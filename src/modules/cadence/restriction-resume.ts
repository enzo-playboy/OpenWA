/**
 * Reaction to a WhatsApp account restriction (the 24h reachout timelock).
 *
 * WhatsApp's reachout_timelock means: the account stays connected, existing chats keep working,
 * but STARTING NEW CONVERSATIONS is blocked until the timelock expires. For a prospecção pipeline
 * that initiates contact, that chip is effectively out of the rotation for the lock's duration.
 *
 * This module holds the pure decision logic (easily testable, no NestJS):
 *   - shouldSkipForRestriction: does this chip's restriction block this dispatch?
 *   - restrictionResumeAt:      when can dispatches on this chip resume?
 *
 * Consumers: CadenceEngineService (re-schedules the lead instead of failing the send) and
 * SafetyGuardrailsAgent (flags account_restriction as a violation / excludes the chip).
 */

import type { AccountRestriction } from '../../engine/interfaces/whatsapp-engine.interface';

/**
 * Whether the given restriction blocks a NEW-conversation dispatch.
 *
 * Only the reachout_timelock is dispatch-relevant in this narrow sense: tos_block/proxy_block kill
 * the connection entirely, and those sessions are already FAILED/unavailable by their own paths —
 * they never reach a dispatch attempt as "available". A reachout_timelock, though, sits on a READY
 * session and must be honored here.
 */
export function restrictionBlocksDispatch(restriction: AccountRestriction | undefined | null): boolean {
  return Boolean(restriction && restriction.kind === 'reachout_timelock');
}

/**
 * When dispatches may resume on a restricted chip, or null when it is not restricted.
 *
 * Without an engine-stated expiresAt, assumes the canonical 24h WhatsApp enforcement window from
 * the moment the restriction was (re)reported — the last time the store was refreshed with it.
 */
export function restrictionResumeAt(restriction: AccountRestriction | undefined | null): number | null {
  if (!restrictionBlocksDispatch(restriction)) return null;
  if (restriction!.expiresAt != null) return restriction!.expiresAt;
  // Without a stated expiry, assume 24h from the re-report. AccountRestriction carries no
  // reportedAt, so the store's refresh cadence is the best clock available.
  return Date.now() + 24 * 60 * 60 * 1000;
}

/**
 * Next run time for a lead whose chip is restricted: at most one minute after the restriction
 * lifts (the timelock's own end is precise; the extra minute lets the engine's lift event land
 * and the store clear before the lead retries).
 */
export function rescheduleForRestriction(nowTimestampMs: number, resumeAtMs: number): Date {
  return new Date(Math.max(resumeAtMs, nowTimestampMs) + 60_000);
}
