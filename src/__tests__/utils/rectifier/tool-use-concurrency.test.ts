import { describe, it, expect } from "vitest";
import {
  shouldRectifyToolUseConcurrency,
  parseOrphanedToolUseIds,
  rectifyToolUseConcurrency,
} from "../../../utils/rectifier/tool-use-concurrency";
import type { RectifierConfig } from "../../../types/rectifier";

const enabledConfig: RectifierConfig = {
  enabled: true,
  requestThinkingSignature: true,
  requestThinkingBudget: true,
  requestToolUseConcurrency: true,
};

const disabledConfig: RectifierConfig = {
  enabled: false,
  requestThinkingSignature: true,
  requestThinkingBudget: true,
  requestToolUseConcurrency: true,
};

const featureDisabledConfig: RectifierConfig = {
  enabled: true,
  requestThinkingSignature: true,
  requestThinkingBudget: true,
  requestToolUseConcurrency: false,
};

describe("shouldRectifyToolUseConcurrency", () => {
  it("detects orphaned tool_use error", () => {
    const msg =
      'messages.1: `tool_use` ids were found without `tool_result` blocks immediately after: tool_abc, tool_def. Each `tool_use` block must have a corresponding `tool_result` block in the next message.';
    expect(shouldRectifyToolUseConcurrency(msg, enabledConfig)).toBe(true);
  });

  it("returns false when master switch is off", () => {
    expect(
      shouldRectifyToolUseConcurrency("tool_use without tool_result", disabledConfig),
    ).toBe(false);
  });

  it("returns false when feature is off", () => {
    expect(
      shouldRectifyToolUseConcurrency("tool_use without tool_result", featureDisabledConfig),
    ).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(shouldRectifyToolUseConcurrency(null, enabledConfig)).toBe(false);
    expect(shouldRectifyToolUseConcurrency(undefined, enabledConfig)).toBe(false);
  });

  it("returns false for unrelated errors", () => {
    expect(
      shouldRectifyToolUseConcurrency("Rate limit exceeded", enabledConfig),
    ).toBe(false);
  });
});

describe("parseOrphanedToolUseIds", () => {
  it("parses comma-separated tool IDs", () => {
    const msg =
      'messages.1: `tool_use` ids were found without `tool_result` blocks immediately after: tool_abc, tool_def. Each `tool_use` block must have a corresponding `tool_result` block in the next message.';
    expect(parseOrphanedToolUseIds(msg)).toEqual(["tool_abc", "tool_def"]);
  });

  it("parses single tool ID", () => {
    const msg =
      'messages.3: `tool_use` ids were found without `tool_result` blocks immediately after: tool_xyz. Each `tool_use` block must have a corresponding `tool_result` block.';
    expect(parseOrphanedToolUseIds(msg)).toEqual(["tool_xyz"]);
  });

  it("returns empty array for non-matching message", () => {
    expect(parseOrphanedToolUseIds("some other error")).toEqual([]);
  });
});

describe("rectifyToolUseConcurrency", () => {
  const errorMsg =
    'messages.1: `tool_use` ids were found without `tool_result` blocks immediately after: tool_abc, tool_def. Each `tool_use` block must have a corresponding `tool_result` block in the next message.';

  it("inserts tool_result into existing next user message", () => {
    const body = {
      messages: [
        { role: "user", content: "hello" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Let me help" },
            { type: "tool_use", id: "tool_abc", name: "read", input: {} },
            { type: "tool_use", id: "tool_def", name: "write", input: {} },
          ],
        },
        { role: "user", content: [{ type: "text", text: "continue" }] },
      ],
    };

    const result = rectifyToolUseConcurrency(body, errorMsg);
    expect(result.applied).toBe(true);
    expect(result.insertedToolResultIds).toEqual(["tool_abc", "tool_def"]);

    const userMsg = body.messages[2];
    expect(userMsg.content).toHaveLength(3);
    expect(userMsg.content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "tool_abc",
      is_error: true,
    });
    expect(userMsg.content[1]).toMatchObject({
      type: "tool_result",
      tool_use_id: "tool_def",
      is_error: true,
    });
  });

  it("creates new user message when no next message exists", () => {
    const body = {
      messages: [
        { role: "user", content: "hello" },
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "tool_abc", name: "read", input: {} },
            { type: "tool_use", id: "tool_def", name: "write", input: {} },
          ],
        },
      ],
    };

    const result = rectifyToolUseConcurrency(body, errorMsg);
    expect(result.applied).toBe(true);
    expect(body.messages).toHaveLength(3);
    expect(body.messages[2].role).toBe("user");
    expect(body.messages[2].content).toHaveLength(2);
    expect(body.messages[2].content[0].type).toBe("tool_result");
  });

  it("skips tool_use IDs that already have tool_result", () => {
    const body = {
      messages: [
        { role: "user", content: "hello" },
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "tool_abc", name: "read", input: {} },
            { type: "tool_use", id: "tool_def", name: "write", input: {} },
          ],
        },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tool_abc", content: "done" },
          ],
        },
      ],
    };

    const result = rectifyToolUseConcurrency(body, errorMsg);
    expect(result.applied).toBe(true);
    expect(result.insertedToolResultIds).toEqual(["tool_def"]);
    expect(body.messages[2].content).toHaveLength(2);
  });

  it("returns applied=false when no orphaned IDs found", () => {
    const body = { messages: [{ role: "user", content: "hello" }] };
    const result = rectifyToolUseConcurrency(body, "some other error");
    expect(result.applied).toBe(false);
  });
});