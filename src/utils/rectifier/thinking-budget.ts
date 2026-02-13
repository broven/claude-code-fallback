import type {
  RectifierConfig,
  BudgetRectifyResult,
  BudgetRectifySnapshot,
} from "../../types/rectifier";

/**
 * Constants for budget rectification
 */
export const MAX_THINKING_BUDGET = 32000;
export const MAX_TOKENS_VALUE = 64000;
export const MIN_MAX_TOKENS_FOR_BUDGET = MAX_THINKING_BUDGET + 1; // 32001

/**
 * Check if an error message indicates a thinking budget issue that should be rectified.
 *
 * Detection requires:
 * - Contains "budget_tokens" or "budget tokens"
 * - Contains "thinking"
 * - Contains one of: ">= 1024", "greater than or equal to 1024", or "1024" + "input should be"
 */
export function shouldRectifyThinkingBudget(
  errorMessage: string | null | undefined,
  config: RectifierConfig,
): boolean {
  // Check master switch
  if (!config.enabled) {
    return false;
  }

  // Check budget rectifier switch
  if (!config.requestThinkingBudget) {
    return false;
  }

  if (!errorMessage) {
    return false;
  }

  const lower = errorMessage.toLowerCase();

  // Must reference budget_tokens or budget
  const hasBudgetTokens =
    lower.includes("budget_tokens") ||
    lower.includes("budget tokens") ||
    lower.includes("budget");

  // Must reference thinking
  const hasThinking = lower.includes("thinking");

  // Must have 1024 constraint
  const has1024Constraint =
    lower.includes(">= 1024") ||
    lower.includes("greater than or equal to 1024") ||
    (lower.includes("1024") && lower.includes("input should be"));

  return hasBudgetTokens && hasThinking && has1024Constraint;
}

/**
 * Rectify thinking budget by setting standard values.
 *
 * Rules:
 * 1. If thinking.type === "adaptive", do nothing
 * 2. If thinking is missing or invalid, create it
 * 3. Set thinking.type = "enabled"
 * 4. Set thinking.budget_tokens = 32000
 * 5. If max_tokens < 32001 or missing, set to 64000
 */
export function rectifyThinkingBudget(
  body: Record<string, any>,
): BudgetRectifyResult {
  const before = snapshotBudget(body);

  // Skip adaptive requests
  if (before.thinkingType === "adaptive") {
    return {
      applied: false,
      before,
      after: before,
    };
  }

  // Create thinking object if missing or invalid
  if (!body.thinking || typeof body.thinking !== "object") {
    body.thinking = {};
  }

  // Set standard values
  body.thinking.type = "enabled";
  body.thinking.budget_tokens = MAX_THINKING_BUDGET;

  // Adjust max_tokens if needed
  if (!before.maxTokens || before.maxTokens < MIN_MAX_TOKENS_FOR_BUDGET) {
    body.max_tokens = MAX_TOKENS_VALUE;
  }

  const after = snapshotBudget(body);

  return {
    applied:
      before.maxTokens !== after.maxTokens ||
      before.thinkingType !== after.thinkingType ||
      before.thinkingBudgetTokens !== after.thinkingBudgetTokens,
    before,
    after,
  };
}

/**
 * Create a snapshot of budget-related fields
 */
function snapshotBudget(body: Record<string, any>): BudgetRectifySnapshot {
  const thinking = body.thinking;
  const isValidThinking = thinking && typeof thinking === "object";

  return {
    maxTokens:
      typeof body.max_tokens === "number" ? body.max_tokens : undefined,
    thinkingType: isValidThinking ? String(thinking.type || "") : undefined,
    thinkingBudgetTokens: isValidThinking
      ? typeof thinking.budget_tokens === "number"
        ? thinking.budget_tokens
        : undefined
      : undefined,
  };
}
