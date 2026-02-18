import type { RectifierConfig, RectifyResult } from "../../types/rectifier";

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
    lower.includes("\u975e\u6cd5\u8bf7\u6c42") ||
    lower.includes("illegal request") ||
    lower.includes("invalid request")
  ) {
    return true;
  }

  return false;
}

/**
 * Rectify an Anthropic API request by removing thinking-related blocks
 * and signature fields that cause compatibility issues with third-party providers.
 */
export function rectifyAnthropicRequest(
  body: Record<string, any>,
): RectifyResult {
  const result: RectifyResult = {
    applied: false,
    removedThinkingBlocks: 0,
    removedRedactedThinkingBlocks: 0,
    removedSignatureFields: 0,
  };

  // Check top-level thinking removal BEFORE modifying content
  const shouldRemoveThinking = shouldRemoveTopLevelThinking(body);

  // Process system messages if they are an array of blocks
  if (Array.isArray(body.system)) {
    const { modified, newContent } = processContentBlocks(body.system, result);
    if (modified) {
      body.system = newContent;
    }
  }

  const messages = body.messages;
  if (Array.isArray(messages)) {
    // Process each message's content
    for (const msg of messages) {
      const content = msg.content;
      if (!Array.isArray(content)) {
        continue;
      }

      const { modified, newContent } = processContentBlocks(content, result);
      if (modified) {
        msg.content = newContent;
      }
    }
  }

  // Remove top-level thinking field if determined earlier
  if (shouldRemoveThinking) {
    delete body.thinking;
    result.applied = true;
  }

  return result;
}

/**
 * Helper to process a list of content blocks and remove prohibited items
 */
function processContentBlocks(
  content: any[],
  result: RectifyResult,
): { modified: boolean; newContent: any[] } {
  const newContent: any[] = [];
  let modified = false;

  for (const block of content) {
    const blockType = block?.type;

    // Remove thinking blocks
    if (blockType === "thinking") {
      result.removedThinkingBlocks++;
      result.applied = true;
      modified = true;
      continue;
    }

    // Remove redacted_thinking blocks
    if (blockType === "redacted_thinking") {
      result.removedRedactedThinkingBlocks++;
      result.applied = true;
      modified = true;
      continue;
    }

    // Remove signature field from non-thinking blocks
    if (block?.signature !== undefined) {
      const { signature, ...blockWithoutSignature } = block;
      newContent.push(blockWithoutSignature);
      result.removedSignatureFields++;
      result.applied = true;
      modified = true;
      continue;
    }

    newContent.push(block);
  }

  return { modified, newContent };
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
