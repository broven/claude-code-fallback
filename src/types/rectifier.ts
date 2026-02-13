/**
 * Rectifier configuration for Anthropic API compatibility fixes
 */
export interface RectifierConfig {
  /** Master switch - enables/disables all rectification */
  enabled: boolean;
  /** Enable thinking signature rectification */
  requestThinkingSignature: boolean;
  /** Enable thinking budget rectification */
  requestThinkingBudget: boolean;
}

/**
 * Result of applying thinking signature rectification
 */
export interface RectifyResult {
  /** Whether any rectification was applied */
  applied: boolean;
  /** Number of thinking blocks removed */
  removedThinkingBlocks: number;
  /** Number of redacted_thinking blocks removed */
  removedRedactedThinkingBlocks: number;
  /** Number of signature fields removed from non-thinking blocks */
  removedSignatureFields: number;
}

/**
 * Snapshot of budget-related fields before/after rectification
 */
export interface BudgetRectifySnapshot {
  maxTokens: number | undefined;
  thinkingType: string | undefined;
  thinkingBudgetTokens: number | undefined;
}

/**
 * Result of applying thinking budget rectification
 */
export interface BudgetRectifyResult {
  /** Whether any rectification was applied */
  applied: boolean;
  /** State before rectification */
  before: BudgetRectifySnapshot;
  /** State after rectification */
  after: BudgetRectifySnapshot;
}

/**
 * Error types that trigger rectification
 */
export type RectifierErrorType =
  | "thinking_signature"
  | "thinking_budget"
  | "none";
