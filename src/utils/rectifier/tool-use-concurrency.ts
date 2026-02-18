import type { RectifierConfig } from "../../types/rectifier";

/**
 * Check if an error message indicates orphaned tool_use blocks (missing tool_result).
 *
 * Detects: "tool_use ids were found without tool_result blocks"
 */
export function shouldRectifyToolUseConcurrency(
  errorMessage: string | null | undefined,
  config: RectifierConfig,
): boolean {
  if (!config.enabled) return false;
  if (!config.requestToolUseConcurrency) return false;
  if (!errorMessage) return false;

  const lower = errorMessage.toLowerCase();
  return (
    lower.includes("tool_use") &&
    lower.includes("without") &&
    lower.includes("tool_result")
  );
}

/**
 * Result of tool-use concurrency rectification.
 */
export interface ToolUseConcurrencyResult {
  applied: boolean;
  insertedToolResultIds: string[];
}

/**
 * Parse orphaned tool_use IDs from the Anthropic error message.
 * Example: "...without `tool_result` blocks immediately after: tool_abc, tool_def."
 */
export function parseOrphanedToolUseIds(
  errorMessage: string,
): string[] {
  // Pattern: after colon, comma-separated tool IDs ending with period
  const match = errorMessage.match(
    /without\s+`?tool_result`?\s+blocks?\s+immediately\s+after:\s*(.+?)\.?\s*(?:Each|$)/i,
  );
  if (!match) return [];

  return match[1]
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Rectify orphaned tool_use blocks by inserting dummy tool_result blocks.
 *
 * Strategy:
 * 1. Parse orphaned tool_use IDs from the error message
 * 2. For each assistant message containing orphaned tool_use blocks,
 *    ensure the next user message has corresponding tool_result blocks
 * 3. If no next user message exists, insert one
 */
export function rectifyToolUseConcurrency(
  body: Record<string, any>,
  errorMessage: string,
): ToolUseConcurrencyResult {
  const orphanedIds = parseOrphanedToolUseIds(errorMessage);
  if (orphanedIds.length === 0) {
    return { applied: false, insertedToolResultIds: [] };
  }

  const messages = body.messages;
  if (!Array.isArray(messages)) {
    return { applied: false, insertedToolResultIds: [] };
  }

  const insertedIds: string[] = [];

  // Walk messages and find assistant messages with orphaned tool_use
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg?.role !== "assistant" || !Array.isArray(msg.content)) continue;

    // Collect tool_use IDs in this assistant message
    const toolUseIds = msg.content
      .filter((b: any) => b?.type === "tool_use" && b?.id)
      .map((b: any) => b.id as string);

    // Find which ones are orphaned
    const orphanedHere = toolUseIds.filter((id: string) =>
      orphanedIds.includes(id),
    );
    if (orphanedHere.length === 0) continue;

    // Check if next message is a user message
    const next = messages[i + 1];
    if (next?.role === "user") {
      // Collect existing tool_result IDs in the next message
      const existingResultIds = new Set(
        (Array.isArray(next.content) ? next.content : [])
          .filter((b: any) => b?.type === "tool_result")
          .map((b: any) => b.tool_use_id as string),
      );

      // Add missing tool_result blocks
      const missing = orphanedHere.filter(
        (id: string) => !existingResultIds.has(id),
      );
      if (missing.length > 0) {
        if (!Array.isArray(next.content)) {
          next.content = typeof next.content === "string"
            ? [{ type: "text", text: next.content }]
            : [];
        }
        const newResults = missing.map((id: string) => ({
          type: "tool_result" as const,
          tool_use_id: id,
          content: "Tool execution was interrupted due to concurrent request.",
          is_error: true,
        }));
        next.content.unshift(...newResults);
        insertedIds.push(...missing);
      }
    } else {
      // No user message after assistant — insert one
      const toolResults = orphanedHere.map((id: string) => ({
        type: "tool_result",
        tool_use_id: id,
        content: "Tool execution was interrupted due to concurrent request.",
        is_error: true,
      }));
      messages.splice(i + 1, 0, {
        role: "user",
        content: toolResults,
      });
      insertedIds.push(...orphanedHere);
      i++; // skip the inserted message
    }
  }

  return {
    applied: insertedIds.length > 0,
    insertedToolResultIds: insertedIds,
  };
}
