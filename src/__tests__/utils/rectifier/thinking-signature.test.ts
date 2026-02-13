import { describe, it, expect } from "vitest";
import {
  shouldRectifyThinkingSignature,
  rectifyAnthropicRequest,
} from "../../../utils/rectifier/thinking-signature";
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
      shouldRectifyThinkingSignature("\u975e\u6cd5\u8bf7\u6c42", enabledConfig),
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
    // because after removal the first block is now tool_use (but the check happens before removal)
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

    const result = rectifyAnthropicRequest(body as any);

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
