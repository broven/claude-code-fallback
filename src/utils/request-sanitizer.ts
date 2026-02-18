/**
 * Sanitize request body before forwarding to Anthropic API
 * Removes invalid or internal-only fields that may cause API errors
 */
export function sanitizeAnthropicRequest(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sanitized = { ...body };

  // Sanitize messages array
  if (Array.isArray(sanitized.messages)) {
    sanitized.messages = sanitized.messages.map((message: any) => {
      if (!message || typeof message !== 'object') {
        return message;
      }

      const sanitizedMessage = { ...message };

      // Sanitize content array
      if (Array.isArray(sanitizedMessage.content)) {
        sanitizedMessage.content = sanitizedMessage.content
          .map((content: any) => {
            if (!content || typeof content !== 'object') {
              return content;
            }

            // Handle thinking blocks
            if (content.type === 'thinking') {
              const sanitizedThinking = { ...content };
              // Remove invalid 'signature' field from thinking blocks
              delete sanitizedThinking.signature;
              return sanitizedThinking;
            }

            return content;
          })
          .filter((content: any) => content !== null); // Remove null entries
      }

      return sanitizedMessage;
    });
  }

  return sanitized;
}
