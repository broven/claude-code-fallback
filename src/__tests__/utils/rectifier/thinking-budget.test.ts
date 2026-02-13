import { describe, it, expect } from "vitest";
import {
  shouldRectifyThinkingBudget,
  rectifyThinkingBudget,
} from "../../../utils/rectifier/thinking-budget";
import type { RectifierConfig } from "../../../types/rectifier";

const enabledConfig: RectifierConfig = {
  enabled: true,
  requestThinkingSignature: true,
  requestThinkingBudget: true,
};

const disabledConfig: RectifierConfig = {
  enabled: false,
  requestThinkingSignature: true,
  requestThinkingBudget: true,
};

const budgetDisabledConfig: RectifierConfig = {
  enabled: true,
  requestThinkingSignature: true,
  requestThinkingBudget: false,
};

describe("shouldRectifyThinkingBudget", () => {
  it("returns false when rectifier is disabled", () => {
    expect(
      shouldRectifyThinkingBudget(
        "thinking.budget_tokens: Input should be greater than or equal to 1024",
        disabledConfig,
      ),
    ).toBe(false);
  });

  it("returns false when budget rectifier is disabled", () => {
    expect(
      shouldRectifyThinkingBudget(
        "thinking.budget_tokens: Input should be greater than or equal to 1024",
        budgetDisabledConfig,
      ),
    ).toBe(false);
  });

  it("returns false for null error message", () => {
    expect(shouldRectifyThinkingBudget(null, enabledConfig)).toBe(false);
  });

  it("returns false for undefined error message", () => {
    expect(shouldRectifyThinkingBudget(undefined, enabledConfig)).toBe(false);
  });

  it("detects budget_tokens with >= 1024 constraint", () => {
    expect(
      shouldRectifyThinkingBudget(
        "thinking.budget_tokens: Input should be greater than or equal to 1024",
        enabledConfig,
      ),
    ).toBe(true);
  });

  it("detects budget tokens with >= 1024", () => {
    expect(
      shouldRectifyThinkingBudget(
        "thinking budget must be >= 1024 for thinking",
        enabledConfig,
      ),
    ).toBe(true);
  });

  it("detects 1024 with input should be", () => {
    expect(
      shouldRectifyThinkingBudget(
        "thinking.budget_tokens: 1024 - input should be at least 1024",
        enabledConfig,
      ),
    ).toBe(true);
  });

  it("requires all three components to match", () => {
    // Missing thinking reference
    expect(
      shouldRectifyThinkingBudget(
        "budget_tokens: Input should be greater than or equal to 1024",
        enabledConfig,
      ),
    ).toBe(false);

    // Missing budget_tokens reference
    expect(
      shouldRectifyThinkingBudget(
        "thinking: Input should be greater than or equal to 1024",
        enabledConfig,
      ),
    ).toBe(false);

    // Missing 1024 constraint
    expect(
      shouldRectifyThinkingBudget(
        "thinking.budget_tokens: Invalid value",
        enabledConfig,
      ),
    ).toBe(false);
  });

  it("returns false for unrelated errors", () => {
    expect(
      shouldRectifyThinkingBudget("Rate limit exceeded", enabledConfig),
    ).toBe(false);
  });
});

describe("rectifyThinkingBudget", () => {
  it("sets budget_tokens to 32000 when rectifying", () => {
    const body = {
      model: "claude-test",
      thinking: { type: "enabled", budget_tokens: 512 },
    };

    const result = rectifyThinkingBudget(body);

    expect(result.applied).toBe(true);
    expect(body.thinking.budget_tokens).toBe(32000);
  });

  it("sets max_tokens to 64000 when less than 32001", () => {
    const body = {
      model: "claude-test",
      max_tokens: 1024,
      thinking: { type: "enabled", budget_tokens: 512 },
    };

    const result = rectifyThinkingBudget(body);

    expect(result.applied).toBe(true);
    expect(body.max_tokens).toBe(64000);
  });

  it("preserves max_tokens when already >= 32001", () => {
    const body = {
      model: "claude-test",
      max_tokens: 50000,
      thinking: { type: "enabled", budget_tokens: 512 },
    };

    const result = rectifyThinkingBudget(body);

    expect(result.applied).toBe(true);
    expect(body.max_tokens).toBe(50000);
  });

  it("sets max_tokens when not present", () => {
    const body = {
      model: "claude-test",
      thinking: { type: "enabled", budget_tokens: 512 },
    } as any;

    const result = rectifyThinkingBudget(body);

    expect(result.applied).toBe(true);
    expect(body.max_tokens).toBe(64000);
  });

  it("skips adaptive thinking type", () => {
    const body = {
      model: "claude-test",
      thinking: { type: "adaptive", budget_tokens: 512 },
      max_tokens: 1024,
    };

    const result = rectifyThinkingBudget(body);

    expect(result.applied).toBe(false);
    expect(body.thinking.budget_tokens).toBe(512);
    expect(body.max_tokens).toBe(1024);
  });

  it("creates thinking object if missing", () => {
    const body = {
      model: "claude-test",
      max_tokens: 1024,
    } as any;

    const result = rectifyThinkingBudget(body);

    expect(result.applied).toBe(true);
    expect(body.thinking).toEqual({
      type: "enabled",
      budget_tokens: 32000,
    });
  });

  it("handles thinking as non-object", () => {
    const body = {
      model: "claude-test",
      thinking: "invalid",
      max_tokens: 1024,
    } as any;

    const result = rectifyThinkingBudget(body);

    expect(result.applied).toBe(true);
    expect(body.thinking).toEqual({
      type: "enabled",
      budget_tokens: 32000,
    });
  });

  it("records before/after state correctly", () => {
    const body = {
      model: "claude-test",
      max_tokens: 1024,
      thinking: { type: "enabled", budget_tokens: 512 },
    };

    const result = rectifyThinkingBudget(body);

    expect(result.before.maxTokens).toBe(1024);
    expect(result.before.thinkingType).toBe("enabled");
    expect(result.before.thinkingBudgetTokens).toBe(512);

    expect(result.after.maxTokens).toBe(64000);
    expect(result.after.thinkingType).toBe("enabled");
    expect(result.after.thinkingBudgetTokens).toBe(32000);
  });

  it("returns applied=false when already compliant", () => {
    const body = {
      model: "claude-test",
      max_tokens: 64000,
      thinking: { type: "enabled", budget_tokens: 32000 },
    };

    const result = rectifyThinkingBudget(body);

    expect(result.applied).toBe(false);
  });
});
