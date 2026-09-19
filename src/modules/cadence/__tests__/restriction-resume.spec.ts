import { rescheduleForRestriction, restrictionBlocksDispatch, restrictionResumeAt } from '../restriction-resume';

describe('restriction-resume (reachout_timelock reaction)', () => {
  const timelock = (expiresAt?: number) =>
    expiresAt != null
      ? { kind: 'reachout_timelock' as const, code: 'BIZ_QUALITY', expiresAt }
      : { kind: 'reachout_timelock' as const, code: 'BIZ_QUALITY' };

  it('blocks dispatch for a reachout_timelock but not for connection-scoped kinds', () => {
    expect(restrictionBlocksDispatch(timelock())).toBe(true);
    expect(restrictionBlocksDispatch({ kind: 'tos_block', code: 'TOS_BLOCK' })).toBe(false);
    expect(restrictionBlocksDispatch({ kind: 'proxy_block', code: 'PROXYBLOCK' })).toBe(false);
    expect(restrictionBlocksDispatch(undefined)).toBe(false);
    expect(restrictionBlocksDispatch(null)).toBe(false);
  });

  it('resumes at the engine-stated expiry when present', () => {
    const end = Date.now() + 20 * 3600_000;
    expect(restrictionResumeAt(timelock(end))).toBe(end);
  });

  it('assumes 24h from now when the engine did not state an expiry', () => {
    const before = Date.now();
    const resume = restrictionResumeAt(timelock());
    expect(resume).toBeGreaterThanOrEqual(before + 24 * 3600_000);
  });

  it('returns null for unrestricted chips', () => {
    expect(restrictionResumeAt(undefined)).toBeNull();
    expect(restrictionResumeAt({ kind: 'tos_block', code: 'TOS_BLOCK' })).toBeNull();
  });

  it('reschedules at least one minute after the lift', () => {
    const now = Date.now();
    const resumeAt = now - 5_000; // already-lapsed lock reported by a stale store
    const next = rescheduleForRestriction(now, resumeAt);
    expect(next.getTime()).toBeGreaterThanOrEqual(now + 60_000);
  });
});
