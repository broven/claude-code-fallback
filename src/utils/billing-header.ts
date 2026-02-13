
/**
 * Strips the 'cch' parameter from the x-anthropic-billing-header in system messages.
 * The cch parameter changes frequently (cache miss), so removing it improves prompt caching.
 *
 * Input format example:
 * "x-anthropic-billing-header: cc_version=2.1.38.713; cc_entrypoint=sdk-ts; cch=90d92;"
 *
 * Target output:
 * "x-anthropic-billing-header: cc_version=2.1.38.713; cc_entrypoint=sdk-ts; "
 */
export function stripBillingHeaderCch(body: any): void {
  if (!body || !body.system || !Array.isArray(body.system)) {
    return;
  }

  for (const block of body.system) {
    if (block.type === 'text' && typeof block.text === 'string') {
      if (block.text.includes('x-anthropic-billing-header')) {
        // Regex to match cch=...; pattern
        // It looks for cch= followed by non-semicolon chars, then a semicolon
        // We replace it with an empty string
        block.text = block.text.replace(/cch=[^;]+;\s*/g, '');
      }
    }
  }
}
