/**
 * Mock implementation of Cloudflare KV Namespace
 */

export function createMockKV(initialData: Record<string, string> = {}): KVNamespace {
  const store = new Map<string, string>(Object.entries(initialData));

  return {
    get: async (key: string, options?: KVNamespaceGetOptions<'text'> | 'text'): Promise<string | null> => {
      const value = store.get(key);
      return value ?? null;
    },
    put: async (key: string, value: string): Promise<void> => {
      store.set(key, value);
    },
    delete: async (key: string): Promise<void> => {
      store.delete(key);
    },
    list: async (): Promise<KVNamespaceListResult<unknown, string>> => {
      return {
        keys: Array.from(store.keys()).map((name) => ({ name })),
        list_complete: true,
        cacheStatus: null,
      };
    },
    getWithMetadata: async <T = unknown>(key: string): Promise<KVNamespaceGetWithMetadataResult<string, T>> => {
      return {
        value: store.get(key) ?? null,
        metadata: null,
        cacheStatus: null,
      };
    },
  } as unknown as KVNamespace;
}

/**
 * Create mock bindings for testing
 */
export function createMockBindings(options: {
  debug?: boolean;
  adminToken?: string;
  kvData?: Record<string, string>;
} = {}) {
  const { debug = false, adminToken = 'test-token-123', kvData = {} } = options;

  return {
    DEBUG: debug ? 'true' : 'false',
    ADMIN_TOKEN: adminToken,
    CONFIG_KV: createMockKV(kvData),
  };
}
