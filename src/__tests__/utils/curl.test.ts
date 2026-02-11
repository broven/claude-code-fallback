import { describe, it, expect } from 'vitest';
import { buildCurlCommand } from '../../utils/curl';

describe('buildCurlCommand', () => {
  it('builds a basic POST curl command with headers and JSON body', () => {
    const url = 'https://my-proxy.workers.dev/v1/messages';
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': 'sk-ant-test-key',
    };
    const body = { model: 'claude-sonnet-4-20250514', stream: true };

    const result = buildCurlCommand(url, headers, body);

    expect(result).toContain("curl -X POST 'https://my-proxy.workers.dev/v1/messages'");
    expect(result).toContain("-H 'content-type: application/json'");
    expect(result).toContain("-H 'x-api-key: sk-ant-test-key'");
    expect(result).toContain("-d '");
    expect(result).toContain('"model":"claude-sonnet-4-20250514"');
    expect(result).toContain('"stream":true');
  });

  it('excludes hop-by-hop and internal headers', () => {
    const url = 'https://proxy.dev/v1/messages';
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': 'sk-test',
      'host': 'proxy.dev',
      'connection': 'keep-alive',
      'content-length': '123',
      'cf-connecting-ip': '1.2.3.4',
      'cf-ray': 'abc123',
    };
    const body = { model: 'test' };

    const result = buildCurlCommand(url, headers, body);

    expect(result).toContain("-H 'content-type: application/json'");
    expect(result).toContain("-H 'x-api-key: sk-test'");
    // hop-by-hop and CF internal headers should be excluded
    expect(result).not.toContain('host:');
    expect(result).not.toContain('connection:');
    expect(result).not.toContain('content-length:');
    expect(result).not.toContain('cf-connecting-ip');
    expect(result).not.toContain('cf-ray');
  });

  it('handles single quotes in header values by escaping them', () => {
    const url = 'https://proxy.dev/v1/messages';
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-custom': "it's a value",
    };
    const body = { model: 'test' };

    const result = buildCurlCommand(url, headers, body);

    // Single quotes should be escaped for shell safety
    expect(result).toContain("x-custom");
    expect(result).not.toContain("it's"); // raw unescaped single quote should not appear inside a single-quoted string
  });

  it('produces a single-line command that can be copy-pasted', () => {
    const url = 'https://proxy.dev/v1/messages';
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    const body = { model: 'test', messages: [{ role: 'user', content: 'hello' }] };

    const result = buildCurlCommand(url, headers, body);

    // Should not contain literal newlines (it's a one-liner)
    expect(result).not.toMatch(/\n/);
    // Should start with curl
    expect(result).toMatch(/^curl /);
  });
});
