# Anthropic API Rectifier Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement an automatic rectifier system that fixes Anthropic API request compatibility issues by detecting specific errors and retrying with corrected parameters.

**Architecture:** The rectifier is a middleware system that intercepts API errors from Anthropic-compatible providers, detects thinking-related compatibility issues (signature and budget errors), modifies the request body, and retries once with the same provider.

**Tech Stack:** TypeScript, Cloudflare Workers, Hono, KV storage, Vitest

---

## Overview

The Rectifier system has two main components:
1. **Thinking Signature Rectifier** - Fixes errors related to thinking block signatures
2. **Thinking Budget Rectifier** - Fixes errors related to thinking budget constraints

Each rectifier:
- Detects specific error patterns in API error messages
- Modifies the request body to fix compatibility issues
- Retries the request once with the same provider
- Logs detailed information using structured log codes [RECT-XXX]

---

## Task 1: Define Rectifier Types

**Files:**
- Create: `src/types/rectifier.ts`

**Step 1: Write the type definitions**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/types/rectifier.ts
git commit -m "feat(rectifier): add type definitions for rectifier system"
```

---

## Task 2: Implement Thinking Signature Detection

**Files:**
- Create: `src/utils/rectifier/thinking-signature.ts`
- Test: `src/__tests__/utils/rectifier/thinking-signature.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { shouldRectifyThinkingSignature } from "../../../utils/rectifier/thinking-signature";
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

const signatureDisabledConfig: RectifierConfig = {
  enabled: true,
  requestThinkingSignature: false,
  requestThinkingBudget: true,
};

describe("shouldRectifyThinkingSignature", () => {
  it("returns false when rectifier is disabled", () => {
    expect(
      shouldRectifyThinkingSignature(
        "Invalid signature in thinking block",
        disabledConfig,
      ),
    ).toBe(false);
  });

  it("returns false when signature rectifier is disabled", () => {
    expect(
      shouldRectifyThinkingSignature(
        "Invalid signature in thinking block",
        signatureDisabledConfig,
      ),
    ).toBe(false);
  });

  it("returns false for null error message", () => {
    expect(shouldRectifyThinkingSignature(null, enabledConfig)).toBe(false);
  });

  it("returns false for undefined error message", () => {
    expect(shouldRectifyThinkingSignature(undefined, enabledConfig)).toBe(false);
  });

  // Scenario 1: Invalid signature in thinking block
  it("detects invalid signature in thinking block", () => {
    expect(
      shouldRectifyThinkingSignature(
        "messages.1.content.0: Invalid `signature` in `thinking` block",
        enabledConfig,
      ),
    ).toBe(true);
  });

  // Scenario 2: Must start with thinking block
  it("detects 'must start with a thinking block' error", () => {
    expect(
      shouldRectifyThinkingSignature(
        "Assistant message must start with a thinking block",
        enabledConfig,
      ),
    ).toBe(true);
  });

  // Scenario 3: Expected thinking but found tool_use
  it("detects expected thinking but found tool_use", () => {
    expect(
      shouldRectifyThinkingSignature(
        "Expected `thinking` or `redacted_thinking`, but found `tool_use`",
        enabledConfig,
      ),
    ).toBe(true);
  });

  // Scenario 4: Signature field required
  it("detects signature field required error", () => {
    expect(
      shouldRectifyThinkingSignature(
        "signature: Field required",
        enabledConfig,
      ),
    ).toBe(true);
  });

  // Scenario 5: Extra inputs not permitted (signature)
  it("detects signature extra inputs not permitted", () => {
    expect(
      shouldRectifyThinkingSignature(
        "xxx.signature: Extra inputs are not permitted",
        enabledConfig,
      ),
    ).toBe(true);
  });

  // Scenario 6: Cannot be modified
  it("detects thinking cannot be modified error", () => {
    expect(
      shouldRectifyThinkingSignature(
        "thinking or redacted_thinking blocks cannot be modified",
        enabledConfig,
      ),
    ).toBe(true);
  });

  // Scenario 7: Illegal request
  it("detects illegal request (Chinese)", () => {
    expect(
      shouldRectifyThinkingSignature("非法请求", enabledConfig),
    ).toBe(true);
  });

  it("detects illegal request (English)", () => {
    expect(
      shouldRectifyThinkingSignature("illegal request", enabledConfig),
    ).toBe(true);
  });

  it("detects invalid request", () => {
    expect(
      shouldRectifyThinkingSignature("invalid request", enabledConfig),
    ).toBe(true);
  });

  // Non-matching errors
  it("returns false for unrelated errors", () => {
    expect(
      shouldRectifyThinkingSignature("Rate limit exceeded", enabledConfig),
    ).toBe(false);
  });

  it("returns false for generic network errors", () => {
    expect(
      shouldRectifyThinkingSignature("Connection timeout", enabledConfig),
    ).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- src/__tests__/utils/rectifier/thinking-signature.test.ts
```
Expected: FAIL with "shouldRectifyThinkingSignature is not defined"

**Step 3: Write minimal implementation**

```typescript
import type { RectifierConfig } from "../../types/rectifier";

/**
 * Check if an error message indicates a thinking signature issue that should be rectified.
 *
 * Detection scenarios:
 * 1. Invalid signature in thinking block
 * 2. Must start with a thinking block
 * 3. Expected thinking/redacted_thinking but found tool_use
 * 4. Signature field required
 * 5. Signature extra inputs not permitted
 * 6. Thinking blocks cannot be modified
 * 7. Illegal/invalid request (catch-all)
 */
export function shouldRectifyThinkingSignature(
  errorMessage: string | null | undefined,
  config: RectifierConfig,
): boolean {
  // Check master switch
  if (!config.enabled) {
    return false;
  }

  // Check signature rectifier switch
  if (!config.requestThinkingSignature) {
    return false;
  }

  if (!errorMessage) {
    return false;
  }

  const lower = errorMessage.toLowerCase();

  // Scenario 1: Invalid signature in thinking block
  if (
    lower.includes("invalid") &&
    lower.includes("signature") &&
    lower.includes("thinking") &&
    lower.includes("block")
  ) {
    return true;
  }

  // Scenario 2: Must start with thinking block
  if (lower.includes("must start with a thinking block")) {
    return true;
  }

  // Scenario 3: Expected thinking/redacted_thinking, found tool_use
  if (
    lower.includes("expected") &&
    (lower.includes("thinking") || lower.includes("redacted_thinking")) &&
    lower.includes("found") &&
    lower.includes("tool_use")
  ) {
    return true;
  }

  // Scenario 4: Signature field required
  if (lower.includes("signature") && lower.includes("field required")) {
    return true;
  }

  // Scenario 5: Signature extra inputs not permitted
  if (
    lower.includes("signature") &&
    lower.includes("extra inputs are not permitted")
  ) {
    return true;
  }

  // Scenario 6: Thinking blocks cannot be modified
  if (
    (lower.includes("thinking") || lower.includes("redacted_thinking")) &&
    lower.includes("cannot be modified")
  ) {
    return true;
  }

  // Scenario 7: Illegal request (catch-all)
  if (
    lower.includes("非法请求") ||
    lower.includes("illegal request") ||
    lower.includes("invalid request")
  ) {
    return true;
  }

  return false;
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- src/__tests__/utils/rectifier/thinking-signature.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/rectifier/thinking-signature.ts src/__tests__/utils/rectifier/thinking-signature.test.ts
git commit -m "feat(rectifier): implement thinking signature error detection"
```

---

## Task 3: Implement Thinking Signature Rectification Algorithm

**Files:**
- Modify: `src/utils/rectifier/thinking-signature.ts`
- Test: `src/__tests__/utils/rectifier/thinking-signature.test.ts`

**Step 1: Add the failing test for rectifyAnthropicRequest**

Add to the existing test file:

```typescript
import { describe, it, expect } from "vitest";
import {
  shouldRectifyThinkingSignature,
  rectifyAnthropicRequest,
} from "../../../utils/rectifier/thinking-signature";

// ... existing tests for shouldRectifyThinkingSignature ...

describe("rectifyAnthropicRequest", () => {
  it("removes thinking blocks from messages", () => {
    const body = {
      model: "claude-test",
      messages: [
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "analysis", signature: "abc123" },
            { type: "text", text: "hello" },
          ],
        },
      ],
    };

    const result = rectifyAnthropicRequest(body);

    expect(result.applied).toBe(true);
    expect(result.removedThinkingBlocks).toBe(1);
    expect(result.removedRedactedThinkingBlocks).toBe(0);
    expect(result.removedSignatureFields).toBe(0);
    expect(body.messages[0].content).toHaveLength(1);
    expect(body.messages[0].content[0].type).toBe("text");
  });

  it("removes redacted_thinking blocks from messages", () => {
    const body = {
      model: "claude-test",
      messages: [
        {
          role: "assistant",
          content: [
            { type: "redacted_thinking", data: "encrypted" },
            { type: "text", text: "hello" },
          ],
        },
      ],
    };

    const result = rectifyAnthropicRequest(body);

    expect(result.applied).toBe(true);
    expect(result.removedThinkingBlocks).toBe(0);
    expect(result.removedRedactedThinkingBlocks).toBe(1);
    expect(body.messages[0].content).toHaveLength(1);
  });

  it("removes signature fields from non-thinking blocks", () => {
    const body = {
      model: "claude-test",
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "hello", signature: "sig1" },
            { type: "tool_use", id: "tool1", name: "search", input: {}, signature: "sig2" },
          ],
        },
      ],
    };

    const result = rectifyAnthropicRequest(body);

    expect(result.applied).toBe(true);
    expect(result.removedSignatureFields).toBe(2);
    expect(body.messages[0].content[0].signature).toBeUndefined();
    expect(body.messages[0].content[1].signature).toBeUndefined();
  });

  it("removes top-level thinking when assistant has tool_use without thinking prefix", () => {
    const body = {
      model: "claude-test",
      thinking: { type: "enabled", budget_tokens: 1024 },
      messages: [
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "tool1", name: "search", input: {} },
          ],
        },
      ],
    };

    const result = rectifyAnthropicRequest(body);

    expect(result.applied).toBe(true);
    expect(body.thinking).toBeUndefined();
  });

  it("keeps top-level thinking when assistant starts with thinking block", () => {
    const body = {
      model: "claude-test",
      thinking: { type: "enabled", budget_tokens: 1024 },
      messages: [
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "analysis", signature: "sig" },
            { type: "tool_use", id: "tool1", name: "search", input: {} },
          ],
        },
      ],
    };

    const result = rectifyAnthropicRequest(body);

    // The thinking block will be removed, but top-level thinking should remain
    // because after rectification there's no tool_use
    expect(body.thinking).toBeDefined();
  });

  it("handles multiple messages", () => {
    const body = {
      model: "claude-test",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "analysis", signature: "sig1" },
            { type: "text", text: "Response", signature: "sig2" },
          ],
        },
      ],
    };

    const result = rectifyAnthropicRequest(body);

    expect(result.applied).toBe(true);
    expect(result.removedThinkingBlocks).toBe(1);
    expect(result.removedSignatureFields).toBe(1);
  });

  it("returns applied=false when no changes needed", () => {
    const body = {
      model: "claude-test",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
      ],
    };

    const result = rectifyAnthropicRequest(body);

    expect(result.applied).toBe(false);
    expect(result.removedThinkingBlocks).toBe(0);
    expect(result.removedSignatureFields).toBe(0);
  });

  it("handles body without messages", () => {
    const body = {
      model: "claude-test",
      max_tokens: 1024,
    };

    const result = rectifyAnthropicRequest(body);

    expect(result.applied).toBe(false);
  });

  it("handles messages without content array", () => {
    const body = {
      model: "claude-test",
      messages: [
        {
          role: "user",
          content: "simple string content",
        },
      ],
    };

    const result = rectifyAnthropicRequest(body);

    expect(result.applied).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- src/__tests__/utils/rectifier/thinking-signature.test.ts
```
Expected: FAIL - rectifyAnthropicRequest not defined

**Step 3: Implement rectifyAnthropicRequest**

Add to `src/utils/rectifier/thinking-signature.ts`:

```typescript
import type { RectifyResult } from "../../types/rectifier";

/**
 * Rectify an Anthropic API request by removing thinking-related blocks
 * and signature fields that cause compatibility issues with third-party providers.
 */
export function rectifyAnthropicRequest(body: Record<string, any>): RectifyResult {
  const result: RectifyResult = {
    applied: false,
    removedThinkingBlocks: 0,
    removedRedactedThinkingBlocks: 0,
    removedSignatureFields: 0,
  };

  const messages = body.messages;
  if (!Array.isArray(messages)) {
    return result;
  }

  // Process each message's content
  for (const msg of messages) {
    const content = msg.content;
    if (!Array.isArray(content)) {
      continue;
    }

    const newContent: any[] = [];
    let contentModified = false;

    for (const block of content) {
      const blockType = block?.type;

      // Remove thinking blocks
      if (blockType === "thinking") {
        result.removedThinkingBlocks++;
        result.applied = true;
        contentModified = true;
        continue;
      }

      // Remove redacted_thinking blocks
      if (blockType === "redacted_thinking") {
        result.removedRedactedThinkingBlocks++;
        result.applied = true;
        contentModified = true;
        continue;
      }

      // Remove signature field from non-thinking blocks
      if (block?.signature !== undefined) {
        const { signature, ...blockWithoutSignature } = block;
        newContent.push(blockWithoutSignature);
        result.removedSignatureFields++;
        result.applied = true;
        contentModified = true;
        continue;
      }

      newContent.push(block);
    }

    if (contentModified) {
      msg.content = newContent;
    }
  }

  // Check if we should remove top-level thinking field
  if (shouldRemoveTopLevelThinking(body)) {
    delete body.thinking;
    result.applied = true;
  }

  return result;
}

/**
 * Determine if the top-level thinking field should be removed.
 *
 * Conditions (all must be met):
 * 1. thinking.type === "enabled"
 * 2. Last assistant message exists
 * 3. First content block of last assistant is not thinking/redacted_thinking
 * 4. The message contains tool_use block
 */
function shouldRemoveTopLevelThinking(body: Record<string, any>): boolean {
  const thinking = body.thinking;
  if (!thinking || typeof thinking !== "object") {
    return false;
  }

  // Only remove if type is "enabled"
  if (thinking.type !== "enabled") {
    return false;
  }

  const messages = body.messages;
  if (!Array.isArray(messages)) {
    return false;
  }

  // Find last assistant message
  const assistantMessages = messages.filter((m) => m?.role === "assistant");
  const lastAssistant = assistantMessages[assistantMessages.length - 1];

  if (!lastAssistant) {
    return false;
  }

  const content = lastAssistant.content;
  if (!Array.isArray(content) || content.length === 0) {
    return false;
  }

  // Check if first block is thinking/redacted_thinking
  const firstBlockType = content[0]?.type;
  if (firstBlockType === "thinking" || firstBlockType === "redacted_thinking") {
    return false;
  }

  // Check if message contains tool_use
  const hasToolUse = content.some((block) => block?.type === "tool_use");
  return hasToolUse;
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test -- src/__tests__/utils/rectifier/thinking-signature.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/rectifier/thinking-signature.ts src/__tests__/utils/rectifier/thinking-signature.test.ts
git commit -m "feat(rectifier): implement thinking signature rectification algorithm"
```

---

## Task 4: Implement Thinking Budget Detection

**Files:**
- Create: `src/utils/rectifier/thinking-budget.ts`
- Test: `src/__tests__/utils/rectifier/thinking-budget.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { shouldRectifyThinkingBudget } from "../../../utils/rectifier/thinking-budget";
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
```

**Step 2: Run test to verify it fails**

```bash
npm test -- src/__tests__/utils/rectifier/thinking-budget.test.ts
```
Expected: FAIL

**Step 3: Write the implementation**

```typescript
import type { RectifierConfig } from "../../types/rectifier";

/**
 * Constants for budget rectification
 */
const MAX_THINKING_BUDGET = 32000;
const MAX_TOKENS_VALUE = 64000;
const MIN_MAX_TOKENS_FOR_BUDGET = MAX_THINKING_BUDGET + 1; // 32001

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

  // Must reference budget_tokens
  const hasBudgetTokens =
    lower.includes("budget_tokens") || lower.includes("budget tokens");

  // Must reference thinking
  const hasThinking = lower.includes("thinking");

  // Must have 1024 constraint
  const has1024Constraint =
    lower.includes(">= 1024") ||
    lower.includes("greater than or equal to 1024") ||
    (lower.includes("1024") && lower.includes("input should be"));

  return hasBudgetTokens && hasThinking && has1024Constraint;
}

export { MAX_THINKING_BUDGET, MAX_TOKENS_VALUE, MIN_MAX_TOKENS_FOR_BUDGET };
```

**Step 4: Run test to verify it passes**

```bash
npm test -- src/__tests__/utils/rectifier/thinking-budget.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/rectifier/thinking-budget.ts src/__tests__/utils/rectifier/thinking-budget.test.ts
git commit -m "feat(rectifier): implement thinking budget error detection"
```

---

## Task 5: Implement Thinking Budget Rectification Algorithm

**Files:**
- Modify: `src/utils/rectifier/thinking-budget.ts`
- Test: `src/__tests__/utils/rectifier/thinking-budget.test.ts`

**Step 1: Add the failing test for rectifyThinkingBudget**

Add to the existing test file:

```typescript
import {
  shouldRectifyThinkingBudget,
  rectifyThinkingBudget,
} from "../../../utils/rectifier/thinking-budget";

// ... existing tests for shouldRectifyThinkingBudget ...

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
    };

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
    };

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
    };

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
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- src/__tests__/utils/rectifier/thinking-budget.test.ts
```
Expected: FAIL

**Step 3: Implement rectifyThinkingBudget**

Add to `src/utils/rectifier/thinking-budget.ts`:

```typescript
import type {
  BudgetRectifyResult,
  BudgetRectifySnapshot,
} from "../../types/rectifier";

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
    thinkingType: isValidThinking
      ? String(thinking.type || "")
      : undefined,
    thinkingBudgetTokens: isValidThinking
      ? typeof thinking.budget_tokens === "number"
        ? thinking.budget_tokens
        : undefined
      : undefined,
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test -- src/__tests__/utils/rectifier/thinking-budget.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/rectifier/thinking-budget.ts src/__tests__/utils/rectifier/thinking-budget.test.ts
git commit -m "feat(rectifier): implement thinking budget rectification algorithm"
```

---

## Task 6: Add Rectifier Index Export

**Files:**
- Create: `src/utils/rectifier/index.ts`

**Step 1: Create the index file**

```typescript
/**
 * Rectifier module exports
 */

// Types
export type {
  RectifierConfig,
  RectifyResult,
  BudgetRectifyResult,
  BudgetRectifySnapshot,
} from "../../types/rectifier";

// Thinking signature rectifier
export {
  shouldRectifyThinkingSignature,
  rectifyAnthropicRequest,
} from "./thinking-signature";

// Thinking budget rectifier
export {
  shouldRectifyThinkingBudget,
  rectifyThinkingBudget,
  MAX_THINKING_BUDGET,
  MAX_TOKENS_VALUE,
  MIN_MAX_TOKENS_FOR_BUDGET,
} from "./thinking-budget";
```

**Step 2: Commit**

```bash
git add src/utils/rectifier/index.ts
git commit -m "feat(rectifier): add rectifier module index exports"
```

---

## Task 7: Add Rectifier Configuration to Types

**Files:**
- Modify: `src/types.ts`

**Step 1: Add RectifierConfig to AppConfig**

Add import and modify AppConfig interface in `src/types.ts`:

```typescript
import type { RectifierConfig } from "./types/rectifier";

// ... existing interfaces ...

/**
 * Application configuration
 */
export interface AppConfig {
  debug: boolean;
  providers: ProviderConfig[];
  allowedTokens: string[];
  tokenConfigs: TokenConfig[];
  cooldownDuration: number;
  anthropicPrimaryDisabled: boolean;
  rectifier: RectifierConfig;
}
```

**Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat(rectifier): add rectifier config to AppConfig type"
```

---

## Task 8: Implement Rectifier Config Persistence

**Files:**
- Modify: `src/config.ts`
- Test: `src/__tests__/config.test.ts`

**Step 1: Add KV key and default config**

Add to `src/config.ts`:

```typescript
import type { RectifierConfig } from "./types/rectifier";

const RECTIFIER_KV_KEY = "rectifier_config";

const defaultRectifierConfig: RectifierConfig = {
  enabled: true,
  requestThinkingSignature: true,
  requestThinkingBudget: true,
};
```

**Step 2: Modify loadConfig to include rectifier config**

Update the `loadConfig` function to load rectifier config:

```typescript
export async function loadConfig(env: Bindings): Promise<AppConfig> {
  const debug = env.DEBUG === "true";
  let providers: ProviderConfig[] = [];
  let tokenConfigs: TokenConfig[] = [];
  let cooldownDuration = parseInt(env.COOLDOWN_DURATION || "300", 10);
  let anthropicDisabledJson: string | null = null;
  let rectifierConfig: RectifierConfig = { ...defaultRectifierConfig };

  try {
    const [configJson, tokensJson, cooldownJson, adJson, rectifierJson] =
      await Promise.all([
        env.CONFIG_KV.get(KV_KEY),
        env.CONFIG_KV.get(TOKENS_KV_KEY),
        env.CONFIG_KV.get(COOLDOWN_KV_KEY),
        env.CONFIG_KV.get(ANTHROPIC_DISABLED_KV_KEY),
        env.CONFIG_KV.get(RECTIFIER_KV_KEY),
      ]);

    // ... existing provider/token/cooldown/ad loading ...

    if (rectifierJson) {
      try {
        const parsed = JSON.parse(rectifierJson);
        rectifierConfig = {
          enabled: parsed.enabled ?? defaultRectifierConfig.enabled,
          requestThinkingSignature:
            parsed.requestThinkingSignature ??
            defaultRectifierConfig.requestThinkingSignature,
          requestThinkingBudget:
            parsed.requestThinkingBudget ??
            defaultRectifierConfig.requestThinkingBudget,
        };
      } catch (e) {
        console.error("[Config] Failed to parse rectifier config:", e);
      }
    }
  } catch (e) {
    console.error("[Config] Failed to load config from KV:", e);
  }

  const allowedTokens = tokenConfigs.map((tc) => tc.token);
  const anthropicPrimaryDisabled = anthropicDisabledJson === "true";

  if (debug) {
    console.log(
      `[Config] Loaded ${providers.length} providers. Allowed tokens: ${allowedTokens.length}. Cooldown: ${cooldownDuration}s. Debug: ${debug}. Rectifier: ${rectifierConfig.enabled}`,
    );
  }

  return {
    debug,
    providers,
    allowedTokens,
    tokenConfigs,
    cooldownDuration,
    anthropicPrimaryDisabled,
    rectifier: rectifierConfig,
  };
}
```

**Step 3: Add saveRectifierConfig function**

```typescript
export async function saveRectifierConfig(
  env: Bindings,
  config: RectifierConfig,
): Promise<void> {
  await env.CONFIG_KV.put(RECTIFIER_KV_KEY, JSON.stringify(config));
}
```

**Step 4: Add getRawRectifierConfig helper**

```typescript
export async function getRawRectifierConfig(
  env: Bindings,
): Promise<RectifierConfig> {
  const val = await env.CONFIG_KV.get(RECTIFIER_KV_KEY);
  if (val) {
    try {
      const parsed = JSON.parse(val);
      return {
        enabled: parsed.enabled ?? defaultRectifierConfig.enabled,
        requestThinkingSignature:
          parsed.requestThinkingSignature ??
          defaultRectifierConfig.requestThinkingSignature,
        requestThinkingBudget:
          parsed.requestThinkingBudget ??
          defaultRectifierConfig.requestThinkingBudget,
      };
    } catch (e) {
      console.error("[Config] Failed to parse rectifier config:", e);
    }
  }
  return { ...defaultRectifierConfig };
}
```

**Step 5: Add tests for rectifier config**

Add to `src/__tests__/config.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadConfig,
  saveRectifierConfig,
  getRawRectifierConfig,
} from "../config";
import type { Bindings } from "../types";

describe("rectifier config", () => {
  const createMockEnv = (rectifierJson: string | null = null): Bindings => ({
    DEBUG: "false",
    ADMIN_TOKEN: "test-token",
    CONFIG_KV: {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === "rectifier_config") return Promise.resolve(rectifierJson);
        return Promise.resolve(null);
      }),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ keys: [] }),
      getWithMetadata: vi.fn().mockResolvedValue({ value: null, metadata: null }),
    } as unknown as KVNamespace,
  });

  it("uses default rectifier config when none stored", async () => {
    const env = createMockEnv(null);
    const config = await loadConfig(env);

    expect(config.rectifier.enabled).toBe(true);
    expect(config.rectifier.requestThinkingSignature).toBe(true);
    expect(config.rectifier.requestThinkingBudget).toBe(true);
  });

  it("loads stored rectifier config", async () => {
    const stored = JSON.stringify({
      enabled: false,
      requestThinkingSignature: false,
      requestThinkingBudget: false,
    });
    const env = createMockEnv(stored);
    const config = await loadConfig(env);

    expect(config.rectifier.enabled).toBe(false);
    expect(config.rectifier.requestThinkingSignature).toBe(false);
    expect(config.rectifier.requestThinkingBudget).toBe(false);
  });

  it("merges partial rectifier config with defaults", async () => {
    const stored = JSON.stringify({ enabled: false });
    const env = createMockEnv(stored);
    const config = await loadConfig(env);

    expect(config.rectifier.enabled).toBe(false);
    expect(config.rectifier.requestThinkingSignature).toBe(true);
    expect(config.rectifier.requestThinkingBudget).toBe(true);
  });

  it("saves rectifier config to KV", async () => {
    const env = createMockEnv();
    const rectifierConfig = {
      enabled: false,
      requestThinkingSignature: false,
      requestThinkingBudget: false,
    };

    await saveRectifierConfig(env, rectifierConfig);

    expect(env.CONFIG_KV.put).toHaveBeenCalledWith(
      "rectifier_config",
      JSON.stringify(rectifierConfig),
    );
  });

  it("getRawRectifierConfig returns parsed config", async () => {
    const stored = JSON.stringify({ enabled: false });
    const env = createMockEnv(stored);

    const config = await getRawRectifierConfig(env);

    expect(config.enabled).toBe(false);
    expect(config.requestThinkingSignature).toBe(true);
    expect(config.requestThinkingBudget).toBe(true);
  });
});
```

**Step 6: Run tests**

```bash
npm test -- src/__tests__/config.test.ts
```
Expected: PASS

**Step 7: Commit**

```bash
git add src/config.ts src/__tests__/config.test.ts
git commit -m "feat(rectifier): add rectifier config persistence in KV"
```

---

## Task 9: Add Admin API Endpoints for Rectifier Config

**Files:**
- Modify: `src/admin.ts`

**Step 1: Add getRectifierConfig and postRectifierConfig handlers**

Add to `src/admin.ts`:

```typescript
import { getRawRectifierConfig, saveRectifierConfig } from "./config";
import type { RectifierConfig } from "./types/rectifier";

/**
 * Get rectifier configuration
 */
export async function getRectifierConfig(c: Context<{ Bindings: Bindings }>) {
  const config = await getRawRectifierConfig(c.env);
  return c.json(config);
}

/**
 * Update rectifier configuration
 */
export async function postRectifierConfig(c: Context<{ Bindings: Bindings }>) {
  try {
    const body = await c.req.json();

    const config: RectifierConfig = {
      enabled: body.enabled ?? true,
      requestThinkingSignature: body.requestThinkingSignature ?? true,
      requestThinkingBudget: body.requestThinkingBudget ?? true,
    };

    await saveRectifierConfig(c.env, config);

    return c.json({ success: true, config });
  } catch (error: any) {
    return c.json(
      {
        error: "Failed to save rectifier config",
        message: error.message,
      },
      400,
    );
  }
}
```

**Step 2: Export the new handlers**

Ensure the new functions are exported from `src/admin.ts`.

**Step 3: Add routes in index.ts**

Modify `src/index.ts` to add the new routes:

```typescript
import {
  // ... existing imports ...
  getRectifierConfig,
  postRectifierConfig,
} from "./admin";

// Add routes
app.get("/admin/rectifier", authMiddleware, getRectifierConfig);
app.post("/admin/rectifier", authMiddleware, postRectifierConfig);
```

**Step 4: Commit**

```bash
git add src/admin.ts src/index.ts
git commit -m "feat(rectifier): add admin API endpoints for rectifier config"
```

---

## Task 10: Integrate Rectifier into Provider Request Flow

**Files:**
- Modify: `src/utils/provider.ts`
- Test: `src/__tests__/utils/provider.test.ts`

**Step 1: Modify tryProvider to support rectification**

Update `tryProvider` function signature and implementation:

```typescript
import {
  shouldRectifyThinkingSignature,
  rectifyAnthropicRequest,
  shouldRectifyThinkingBudget,
  rectifyThinkingBudget,
} from "./rectifier";

/**
 * Attempt a request to a specific fallback provider.
 * Handles model mapping, header filtering, authentication, format conversion, and rectification.
 */
export async function tryProvider(
  provider: ProviderConfig,
  body: any,
  originalHeaders: Record<string, string>,
  config: AppConfig,
  options?: {
    rectifierRetried?: boolean;
    budgetRectifierRetried?: boolean;
  },
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    // ... existing setup code ...

    const response = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Check for rectifiable errors on non-OK responses
    if (!response.ok && provider.format !== "openai") {
      const errorText = await response.text();

      // Try to extract error message
      let errorMessage: string | undefined;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage =
          errorJson.error?.message ||
          errorJson.message ||
          errorJson.error?.type ||
          errorText;
      } catch {
        errorMessage = errorText;
      }

      // Check if we should apply rectification
      const rectifierConfig = config.rectifier;

      // Thinking Signature Rectifier
      if (
        !options?.rectifierRetried &&
        shouldRectifyThinkingSignature(errorMessage, rectifierConfig)
      ) {
        const rectifiedBody = { ...requestBody };
        const result = rectifyAnthropicRequest(rectifiedBody);

        if (result.applied) {
          // Retry with rectified body
          return tryProvider(
            provider,
            rectifiedBody,
            originalHeaders,
            config,
            {
              ...options,
              rectifierRetried: true,
            },
          );
        }
      }

      // Thinking Budget Rectifier
      if (
        !options?.budgetRectifierRetried &&
        shouldRectifyThinkingBudget(errorMessage, rectifierConfig)
      ) {
        const rectifiedBody = { ...requestBody };
        const result = rectifyThinkingBudget(rectifiedBody);

        if (result.applied) {
          // Retry with rectified body
          return tryProvider(
            provider,
            rectifiedBody,
            originalHeaders,
            config,
            {
              ...options,
              budgetRectifierRetried: true,
            },
          );
        }
      }

      // Return the original error response
      return new Response(errorText, {
        status: response.status,
        headers: cleanHeaders(response.headers),
      });
    }

    // ... rest of existing code ...
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw error;
  }
}
```

**Step 2: Add tests for rectification in tryProvider**

Add tests to `src/__tests__/utils/provider.test.ts`:

```typescript
import {
  shouldRectifyThinkingSignature,
  rectifyAnthropicRequest,
} from "../../utils/rectifier";

describe("rectification", () => {
  it("retries with rectified body on thinking signature error", async () => {
    // First call returns error, second call succeeds
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createErrorResponse(400, {
          error: {
            message: "Invalid `signature` in `thinking` block",
          },
        }),
      )
      .mockResolvedValueOnce(createSuccessResponse());

    globalThis.fetch = mockFetch;

    const bodyWithThinking = {
      ...validMessageRequest,
      messages: [
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "analysis", signature: "abc" },
            { type: "text", text: "Hello" },
          ],
        },
      ],
    };

    const configWithRectifier: AppConfig = {
      ...defaultConfig,
      rectifier: {
        enabled: true,
        requestThinkingSignature: true,
        requestThinkingBudget: true,
      },
    };

    const result = await tryProvider(
      validProvider,
      bodyWithThinking,
      validHeaders,
      configWithRectifier,
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);

    // Second call should have rectified body (no thinking block)
    const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondCallBody.messages[0].content).toHaveLength(1);
    expect(secondCallBody.messages[0].content[0].type).toBe("text");
  });

  it("does not retry if rectifier is disabled", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createErrorResponse(400, {
        error: {
          message: "Invalid `signature` in `thinking` block",
        },
      }),
    );

    globalThis.fetch = mockFetch;

    const bodyWithThinking = {
      ...validMessageRequest,
      messages: [
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "analysis", signature: "abc" },
          ],
        },
      ],
    };

    const configWithDisabledRectifier: AppConfig = {
      ...defaultConfig,
      rectifier: {
        enabled: false,
        requestThinkingSignature: true,
        requestThinkingBudget: true,
      },
    };

    const result = await tryProvider(
      validProvider,
      bodyWithThinking,
      validHeaders,
      configWithDisabledRectifier,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });

  it("retries with rectified body on budget error", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createErrorResponse(400, {
          error: {
            message:
              "thinking.budget_tokens: Input should be greater than or equal to 1024",
          },
        }),
      )
      .mockResolvedValueOnce(createSuccessResponse());

    globalThis.fetch = mockFetch;

    const bodyWithLowBudget = {
      ...validMessageRequest,
      thinking: { type: "enabled", budget_tokens: 512 },
      max_tokens: 1024,
    };

    const configWithRectifier: AppConfig = {
      ...defaultConfig,
      rectifier: {
        enabled: true,
        requestThinkingSignature: true,
        requestThinkingBudget: true,
      },
    };

    const result = await tryProvider(
      validProvider,
      bodyWithLowBudget,
      validHeaders,
      configWithRectifier,
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);

    // Second call should have rectified budget
    const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondCallBody.thinking.budget_tokens).toBe(32000);
    expect(secondCallBody.max_tokens).toBe(64000);
  });

  it("only retries once on rectification", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createErrorResponse(400, {
        error: {
          message: "Invalid `signature` in `thinking` block",
        },
      }),
    );

    globalThis.fetch = mockFetch;

    const bodyWithThinking = {
      ...validMessageRequest,
      messages: [
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "analysis", signature: "abc" },
          ],
        },
      ],
    };

    const configWithRectifier: AppConfig = {
      ...defaultConfig,
      rectifier: {
        enabled: true,
        requestThinkingSignature: true,
        requestThinkingBudget: true,
      },
    };

    const result = await tryProvider(
      validProvider,
      bodyWithThinking,
      validHeaders,
      configWithRectifier,
    );

    // Should only try twice: original + one retry
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });
});
```

**Step 3: Run tests**

```bash
npm test -- src/__tests__/utils/provider.test.ts
```
Expected: PASS

**Step 4: Commit**

```bash
git add src/utils/provider.ts src/__tests__/utils/provider.test.ts
git commit -m "feat(rectifier): integrate rectifier into provider request flow"
```

---

## Task 11: Update Test Fixtures with Rectifier Config

**Files:**
- Modify: `src/__tests__/fixtures/requests.ts` (or wherever default AppConfig is defined)

**Step 1: Update test fixtures to include rectifier config**

Add rectifier config to all AppConfig usages in test files. Search for usages:

```bash
mgrep "AppConfig" src/__tests__
```

Update all test files that create AppConfig objects to include the rectifier field.

**Step 2: Commit**

```bash
git add src/__tests__/
git commit -m "chore(rectifier): update test fixtures with rectifier config"
```

---

## Task 12: Run Full Test Suite

**Step 1: Run all tests**

```bash
npm test
```
Expected: All 314+ tests PASS

**Step 2: Run type check**

```bash
npx tsc --noEmit
```
Expected: No type errors

**Step 3: Commit any fixes**

```bash
git add .
git commit -m "fix(rectifier): fix any test or type issues"
```

---

## Summary

The Anthropic API Rectifier implementation adds:

1. **Type definitions** (`src/types/rectifier.ts`) - RectifierConfig, RectifyResult, BudgetRectifyResult
2. **Signature rectifier** (`src/utils/rectifier/thinking-signature.ts`) - Detects and fixes thinking signature errors
3. **Budget rectifier** (`src/utils/rectifier/thinking-budget.ts`) - Detects and fixes thinking budget errors
4. **Config persistence** (`src/config.ts`) - Stores rectifier config in KV
5. **Admin API** (`src/admin.ts`) - Endpoints to get/set rectifier config
6. **Integration** (`src/utils/provider.ts`) - Automatic retry with rectification on compatible errors

The rectifier only activates for:
- Anthropic format providers (not OpenAI format)
- Specific error patterns matching known compatibility issues
- When enabled in configuration (default: enabled)

Each rectifier only retries once to prevent infinite loops.
