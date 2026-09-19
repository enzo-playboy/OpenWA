/**
 * Shared types for the autonomous decision agents.
 *
 * Design constraint (AGENTS.md): nothing here sends anything. The pipeline TERMINATES in a
 * proposal for a human — dispatch is a separate, individually approved action.
 */

export type LeadNiche = 'ouro' | 'agro';

export interface AgentLeadInput {
  phone: string;
  name?: string;
  company?: string;
  niche: LeadNiche;
  /** Free-text notes from the CRM (Supabase lead row) the LLM can use as context. */
  notes?: string;
  /** Historical touches already sent to this lead (latest last). */
  previousTouches?: string[];
}

export type QualificationRecommendation = 'CONTACT' | 'HOLD' | 'REJECT';

export interface QualificationResult {
  score: number; // 0-100
  recommendation: QualificationRecommendation;
  reasons: string[];
  dataQuality: 'good' | 'partial' | 'poor';
  confidence: number; // 0-1
  /** How the result was produced — surfaced in proposals and metrics. */
  source: 'llm' | 'heuristic';
}

export type PersonalizationLevel = 'basic' | 'referenced' | 'deep';

/**
 * Performance of one opening style, from the feedback loop's engagement history.
 * Drives the message agent's style choice: what has been ANSWERED teaches more than what was sent.
 */
export interface OpeningStylePerformanceSummary {
  style: 'question' | 'statement' | 'context' | 'direct_offer';
  totalSent: number;
  responseRatePercent: number;
}

/** Aggregate view of what opening styles have been working, handed to the message agent. */
export interface OpeningStyleInsight {
  styles: OpeningStylePerformanceSummary[];
  /** The style with the best response rate among styles with at least MIN_STYLE_SAMPLE sends. */
  bestStyle: OpeningStylePerformanceSummary | null;
  /** True when the sample is too small to trust (agent then uses neutral priors). */
  insufficientSample: boolean;
}

export interface GeneratedMessage {
  text: string;
  personalization: PersonalizationLevel;
  confidence: number;
  source: 'llm' | 'template';
  /** Opening style actually used — tracked against the reply outcome later (feedback loop). */
  openingStyle?: OpeningStylePerformanceSummary['style'];
  /** What the engagement history says about opening styles (surfaced in proposals for review). */
  styleInsight?: OpeningStyleInsight;
}

export interface SafetyCheckResult {
  allowed: boolean;
  /** Guard identifiers that rejected the dispatch (empty when allowed). */
  violations: string[];
  /** Human-readable reasons aligned with violations. */
  reasons: string[];
  /** Resolved chip for the niche (always present when allowed). */
  sessionId?: string;
  chipName?: string;
}

export type AgentDecision = 'dispatch' | 'hold' | 'reject';

export interface AgentDecisionBreakdown {
  decision: AgentDecision;
  confidence: number;
  /** Weighted vote each agent contributed to the final decision. */
  contributions: Array<{ agent: string; weight: number; vote: AgentDecision; confidence: number }>;
}

export interface DispatchProposal {
  id: string;
  createdAt: string;
  lead: AgentLeadInput;
  qualification: QualificationResult;
  message: GeneratedMessage;
  safety: SafetyCheckResult;
  decision: AgentDecisionBreakdown;
  /** Resolved chip when safety allowed routing. */
  sessionId?: string;
  /** Set when the pipeline short-circuited (REJECT / safety block). */
  blockedReason?: string;
}
