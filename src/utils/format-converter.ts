/**
 * Bidirectional format conversion between Anthropic Messages API and OpenAI Chat Completions API.
 */

/**
 * Normalize Anthropic content to a string.
 * Handles both string content and array of content blocks.
 */
function normalizeContentToString(
  content: string | Array<{ type: string; text?: string }>,
): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join("");
  }
  return "";
}

/**
 * Convert an Anthropic Messages API request body to OpenAI Chat Completions format.
 */
export function convertAnthropicToOpenAI(body: any): any {
  const messages: any[] = [];

  // Extract system prompt → system message
  if (body.system) {
    const systemText =
      typeof body.system === "string"
        ? body.system
        : normalizeContentToString(body.system);
    messages.push({ role: "system", content: systemText });
  }

  // Convert messages
  if (body.messages) {
    for (const msg of body.messages) {
      // Handle tool_result content blocks (Anthropic user messages with tool results)
      if (msg.role === "user" && Array.isArray(msg.content)) {
        const toolResults = msg.content.filter(
          (block: any) => block.type === "tool_result",
        );
        const otherBlocks = msg.content.filter(
          (block: any) => block.type !== "tool_result",
        );

        // Emit non-tool content as a user message
        if (otherBlocks.length > 0) {
          messages.push({
            role: "user",
            content: normalizeContentToString(otherBlocks),
          });
        }

        // Emit each tool_result as a separate tool message
        for (const tr of toolResults) {
          messages.push({
            role: "tool",
            tool_call_id: tr.tool_use_id,
            content:
              typeof tr.content === "string"
                ? tr.content
                : normalizeContentToString(tr.content || ""),
          });
        }
        continue;
      }

      // Handle assistant messages with tool_use content blocks
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        const toolUseBlocks = msg.content.filter(
          (block: any) => block.type === "tool_use",
        );
        const textBlocks = msg.content.filter(
          (block: any) => block.type === "text",
        );

        const converted: any = { role: "assistant" };

        if (textBlocks.length > 0) {
          converted.content = normalizeContentToString(textBlocks);
        } else {
          converted.content = null;
        }

        if (toolUseBlocks.length > 0) {
          converted.tool_calls = toolUseBlocks.map((block: any) => ({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          }));
        }

        messages.push(converted);
        continue;
      }

      // Standard text message
      const content =
        typeof msg.content === "string"
          ? msg.content
          : normalizeContentToString(msg.content);
      messages.push({ role: msg.role, content });
    }
  }

  const result: any = {
    model: body.model,
    messages,
  };

  // Map compatible parameters
  if (body.max_tokens !== undefined) result.max_tokens = body.max_tokens;
  if (body.temperature !== undefined) result.temperature = body.temperature;
  if (body.top_p !== undefined) result.top_p = body.top_p;
  if (body.stream !== undefined) result.stream = body.stream;
  if (body.stop_sequences !== undefined) result.stop = body.stop_sequences;

  // Convert tools
  if (body.tools) {
    result.tools = body.tools.map((tool: any) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));
  }

  // Convert tool_choice
  if (body.tool_choice) {
    if (body.tool_choice.type === "auto") {
      result.tool_choice = "auto";
    } else if (body.tool_choice.type === "any") {
      result.tool_choice = "required";
    } else if (body.tool_choice.type === "tool") {
      result.tool_choice = {
        type: "function",
        function: { name: body.tool_choice.name },
      };
    }
  }

  // Enable stream_options for usage in streaming mode
  if (body.stream) {
    result.stream_options = { include_usage: true };
  }

  return result;
}

// Map OpenAI finish_reason to Anthropic stop_reason
const FINISH_REASON_MAP: Record<string, string> = {
  stop: "end_turn",
  length: "max_tokens",
  tool_calls: "tool_use",
  content_filter: "end_turn",
};

/**
 * Convert an OpenAI Chat Completions response to Anthropic Messages API format.
 */
export function convertOpenAIResponseToAnthropic(openaiResponse: any): any {
  const choice = openaiResponse.choices?.[0];
  const message = choice?.message;

  // Build content array
  const content: any[] = [];

  if (message?.content) {
    content.push({ type: "text", text: message.content });
  }

  if (message?.tool_calls) {
    for (const tc of message.tool_calls) {
      let parsedInput;
      try {
        parsedInput = JSON.parse(tc.function.arguments);
      } catch {
        parsedInput = tc.function.arguments;
      }
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input: parsedInput,
      });
    }
  }

  // If no content at all, add empty text block
  if (content.length === 0) {
    content.push({ type: "text", text: "" });
  }

  const stopReason =
    FINISH_REASON_MAP[choice?.finish_reason] || "end_turn";

  return {
    id: openaiResponse.id || "msg_converted",
    type: "message",
    role: "assistant",
    content,
    model: openaiResponse.model || "",
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: openaiResponse.usage?.prompt_tokens || 0,
      output_tokens: openaiResponse.usage?.completion_tokens || 0,
    },
  };
}

/**
 * Convert an OpenAI streaming response (SSE) to Anthropic streaming SSE format.
 * Returns a new ReadableStream that emits Anthropic-format SSE events.
 */
export function convertOpenAIStreamToAnthropic(
  stream: ReadableStream<Uint8Array>,
  model: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let started = false;
  let buffer = "";
  let contentBlockIndex = 0;
  let finishReason: string | null = null;
  let streamUsage: { prompt_tokens?: number; completion_tokens?: number } | null = null;

  // Track tool call accumulation
  const activeToolCalls: Map<
    number,
    { id: string; name: string; arguments: string }
  > = new Map();
  let inTextBlock = false;

  function formatSSE(event: string, data: any): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  function emitMessageStart(controller: TransformStreamDefaultController<Uint8Array>): void {
    const msgStart = {
      type: "message_start",
      message: {
        id: "msg_converted",
        type: "message",
        role: "assistant",
        content: [],
        model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    };
    controller.enqueue(encoder.encode(formatSSE("message_start", msgStart)));
    started = true;
  }

  function emitContentBlockStart(
    controller: TransformStreamDefaultController<Uint8Array>,
    type: string,
    extra?: any,
  ): void {
    const blockStart: any = {
      type: "content_block_start",
      index: contentBlockIndex,
      content_block: type === "text"
        ? { type: "text", text: "" }
        : { type: "tool_use", id: extra?.id || "", name: extra?.name || "", input: {} },
    };
    controller.enqueue(encoder.encode(formatSSE("content_block_start", blockStart)));
  }

  function emitContentBlockStop(controller: TransformStreamDefaultController<Uint8Array>): void {
    controller.enqueue(
      encoder.encode(
        formatSSE("content_block_stop", {
          type: "content_block_stop",
          index: contentBlockIndex,
        }),
      ),
    );
    contentBlockIndex++;
  }

  function processChunk(
    data: string,
    controller: TransformStreamDefaultController<Uint8Array>,
  ): void {
    if (data === "[DONE]") {
      // Close any open text block
      if (inTextBlock) {
        emitContentBlockStop(controller);
        inTextBlock = false;
      }

      // Emit accumulated tool call blocks
      for (const [, tc] of activeToolCalls) {
        emitContentBlockStart(controller, "tool_use", { id: tc.id, name: tc.name });
        // Emit the full arguments as a single input_json_delta
        const inputDelta = {
          type: "content_block_delta",
          index: contentBlockIndex,
          delta: {
            type: "input_json_delta",
            partial_json: tc.arguments,
          },
        };
        controller.enqueue(encoder.encode(formatSSE("content_block_delta", inputDelta)));
        emitContentBlockStop(controller);
      }

      // Emit message_delta with stop_reason
      const stopReason = FINISH_REASON_MAP[finishReason || "stop"] || "end_turn";
      const msgDelta: any = {
        type: "message_delta",
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: streamUsage?.completion_tokens || 0 },
      };
      controller.enqueue(encoder.encode(formatSSE("message_delta", msgDelta)));

      // Emit message_stop
      controller.enqueue(
        encoder.encode(
          formatSSE("message_stop", { type: "message_stop" }),
        ),
      );
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    if (!started) {
      emitMessageStart(controller);
    }

    const choice = parsed.choices?.[0];
    if (!choice) {
      // Handle usage-only chunks (some providers send usage separately)
      if (parsed.usage) {
        streamUsage = parsed.usage;
      }
      return;
    }

    const delta = choice.delta;

    // Capture finish_reason
    if (choice.finish_reason) {
      finishReason = choice.finish_reason;
    }

    // Capture usage if present
    if (parsed.usage) {
      streamUsage = parsed.usage;
    }

    // Handle text content
    if (delta?.content !== undefined && delta.content !== null) {
      if (!inTextBlock) {
        emitContentBlockStart(controller, "text");
        inTextBlock = true;
      }
      if (delta.content !== "") {
        const textDelta = {
          type: "content_block_delta",
          index: contentBlockIndex,
          delta: { type: "text_delta", text: delta.content },
        };
        controller.enqueue(encoder.encode(formatSSE("content_block_delta", textDelta)));
      }
    }

    // Handle tool call deltas
    if (delta?.tool_calls) {
      // Close text block if open
      if (inTextBlock) {
        emitContentBlockStop(controller);
        inTextBlock = false;
      }

      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!activeToolCalls.has(idx)) {
          activeToolCalls.set(idx, {
            id: tc.id || "",
            name: tc.function?.name || "",
            arguments: "",
          });
        }
        const existing = activeToolCalls.get(idx)!;
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.name = tc.function.name;
        if (tc.function?.arguments) {
          existing.arguments += tc.function.arguments;
        }
      }
    }
  }

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      const lines = buffer.split("\n");
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6);
          processChunk(data, controller);
        }
      }
    },
    flush(controller) {
      // Process any remaining data in buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith("data: ")) {
          processChunk(trimmed.slice(6), controller);
        }
      }
    },
  });

  return stream.pipeThrough(transform);
}
