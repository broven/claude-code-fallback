import { describe, it, expect } from 'vitest';
import {
  filterHeaders,
  filterHeadersDebugOption,
  cleanRequestHeaders,
  cleanHeaders,
} from '../../utils/headers';

describe('filterHeaders', () => {
  describe('basic functionality', () => {
    it('removes specified headers (case-insensitive)', () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Api-Key': 'secret',
        Authorization: 'Bearer token',
      };

      const result = filterHeaders(headers, ['x-api-key', 'authorization']);

      expect(result).toEqual({
        'Content-Type': 'application/json',
      });
    });

    it('preserves headers not in exclusion list', () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'value',
        Accept: 'application/json',
      };

      const result = filterHeaders(headers, ['authorization']);

      expect(result).toEqual(headers);
    });

    it('handles empty headers object', () => {
      const result = filterHeaders({}, ['x-api-key']);

      expect(result).toEqual({});
    });

    it('handles empty exclusion list', () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Api-Key': 'secret',
      };

      const result = filterHeaders(headers, []);

      expect(result).toEqual(headers);
    });

    it('handles case variations in exclusion keys', () => {
      const headers = {
        'X-API-KEY': 'value1',
        'x-api-key': 'value2',
        'X-Api-Key': 'value3',
      };

      const result = filterHeaders(headers, ['X-API-KEY']);

      expect(result).toEqual({});
    });
  });

  describe('edge cases', () => {
    it('handles headers with empty string values', () => {
      const headers = {
        'Content-Type': '',
        'X-Empty': '',
      };

      const result = filterHeaders(headers, ['content-type']);

      expect(result).toEqual({
        'X-Empty': '',
      });
    });

    it('handles special characters in header names', () => {
      const headers = {
        'X-Special_Header': 'value',
        'X-Another-Header': 'value2',
      };

      const result = filterHeaders(headers, ['x-special_header']);

      expect(result).toEqual({
        'X-Another-Header': 'value2',
      });
    });

    it('preserves header value types', () => {
      const headers = {
        'Content-Length': '100',
        'X-Number': '42',
      };

      const result = filterHeaders(headers, []);

      expect(result['Content-Length']).toBe('100');
      expect(result['X-Number']).toBe('42');
    });
  });
});

describe('filterHeadersDebugOption', () => {
  it('removes debug skip header', () => {
    const headers = {
      'Content-Type': 'application/json',
      'x-ccfallback-debug-skip-anthropic': '1',
      'X-Api-Key': 'secret',
    };

    const result = filterHeadersDebugOption(headers);

    expect(result).toEqual({
      'Content-Type': 'application/json',
      'X-Api-Key': 'secret',
    });
  });

  it('preserves all headers when debug header not present', () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Api-Key': 'secret',
    };

    const result = filterHeadersDebugOption(headers);

    expect(result).toEqual(headers);
  });

  it('handles case variations of debug header', () => {
    const headers = {
      'X-CCFALLBACK-DEBUG-SKIP-ANTHROPIC': '1',
      'Content-Type': 'application/json',
    };

    const result = filterHeadersDebugOption(headers);

    expect(result).toEqual({
      'Content-Type': 'application/json',
    });
  });
});

describe('cleanRequestHeaders', () => {
  it('removes current and legacy debug skip headers', () => {
    const headers = {
      'content-type': 'application/json',
      'x-ccf-debug-skip-anthropic': '1',
      'x-ccfallback-debug-skip-anthropic': '1',
      'anthropic-version': '2023-06-01',
    };

    const result = cleanRequestHeaders(headers);

    expect(result['x-ccf-debug-skip-anthropic']).toBeUndefined();
    expect(result['x-ccfallback-debug-skip-anthropic']).toBeUndefined();
    expect(result['anthropic-version']).toBe('2023-06-01');
  });
});

describe('cleanHeaders', () => {
  function createHeaders(obj: Record<string, string>): Headers {
    const headers = new Headers();
    for (const [key, value] of Object.entries(obj)) {
      headers.set(key, value);
    }
    return headers;
  }

  describe('hop-by-hop header removal', () => {
    it('removes content-length header', () => {
      const headers = createHeaders({
        'content-type': 'application/json',
        'content-length': '1234',
      });

      const result = cleanHeaders(headers);

      expect(result['content-length']).toBeUndefined();
      expect(result['content-type']).toBe('application/json');
    });

    it('removes content-encoding header', () => {
      const headers = createHeaders({
        'content-type': 'application/json',
        'content-encoding': 'gzip',
      });

      const result = cleanHeaders(headers);

      expect(result['content-encoding']).toBeUndefined();
      expect(result['content-type']).toBe('application/json');
    });

    it('removes transfer-encoding header', () => {
      const headers = createHeaders({
        'content-type': 'application/json',
        'transfer-encoding': 'chunked',
      });

      const result = cleanHeaders(headers);

      expect(result['transfer-encoding']).toBeUndefined();
    });

    it('removes connection header', () => {
      const headers = createHeaders({
        'content-type': 'application/json',
        connection: 'keep-alive',
      });

      const result = cleanHeaders(headers);

      expect(result['connection']).toBeUndefined();
    });

    it('removes keep-alive header', () => {
      const headers = createHeaders({
        'content-type': 'application/json',
        'keep-alive': 'timeout=5',
      });

      const result = cleanHeaders(headers);

      expect(result['keep-alive']).toBeUndefined();
    });

    it('removes te header', () => {
      const headers = createHeaders({
        'content-type': 'application/json',
        te: 'trailers',
      });

      const result = cleanHeaders(headers);

      expect(result['te']).toBeUndefined();
    });

    it('removes trailer header', () => {
      const headers = createHeaders({
        'content-type': 'application/json',
        trailer: 'Expires',
      });

      const result = cleanHeaders(headers);

      expect(result['trailer']).toBeUndefined();
    });

    it('removes upgrade header', () => {
      const headers = createHeaders({
        'content-type': 'application/json',
        upgrade: 'websocket',
      });

      const result = cleanHeaders(headers);

      expect(result['upgrade']).toBeUndefined();
    });

    it('removes host header', () => {
      const headers = createHeaders({
        'content-type': 'application/json',
        host: 'api.anthropic.com',
      });

      const result = cleanHeaders(headers);

      expect(result['host']).toBeUndefined();
    });

    it('removes all unsafe headers at once', () => {
      const headers = createHeaders({
        'content-type': 'application/json',
        'content-length': '1234',
        'content-encoding': 'gzip',
        'transfer-encoding': 'chunked',
        connection: 'keep-alive',
        'keep-alive': 'timeout=5',
        te: 'trailers',
        trailer: 'Expires',
        upgrade: 'websocket',
        host: 'api.anthropic.com',
      });

      const result = cleanHeaders(headers);

      expect(Object.keys(result)).toEqual(['content-type']);
    });
  });

  describe('safe headers preservation', () => {
    it('preserves x-api-key header', () => {
      const headers = createHeaders({
        'x-api-key': 'secret-key',
      });

      const result = cleanHeaders(headers);

      expect(result['x-api-key']).toBe('secret-key');
    });

    it('preserves authorization header', () => {
      const headers = createHeaders({
        authorization: 'Bearer token',
      });

      const result = cleanHeaders(headers);

      expect(result['authorization']).toBe('Bearer token');
    });

    it('preserves anthropic-version header', () => {
      const headers = createHeaders({
        'anthropic-version': '2023-06-01',
      });

      const result = cleanHeaders(headers);

      expect(result['anthropic-version']).toBe('2023-06-01');
    });

    it('preserves custom headers', () => {
      const headers = createHeaders({
        'x-custom-header': 'custom-value',
        'ccr-request-id': '123456',
      });

      const result = cleanHeaders(headers);

      expect(result['x-custom-header']).toBe('custom-value');
      expect(result['ccr-request-id']).toBe('123456');
    });
  });

  describe('edge cases', () => {
    it('handles empty headers', () => {
      const headers = new Headers();

      const result = cleanHeaders(headers);

      expect(result).toEqual({});
    });

    it('returns plain object (not Headers instance)', () => {
      const headers = createHeaders({
        'content-type': 'application/json',
      });

      const result = cleanHeaders(headers);

      expect(result).toBeInstanceOf(Object);
      expect(result).not.toBeInstanceOf(Headers);
    });
  });
});
