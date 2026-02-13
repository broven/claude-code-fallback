import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { ProviderConfig, TokenConfig, ProviderState, TestProviderResponse, RectifierConfig } from '@/lib/types';

// --- Providers ---
export function useProviders() {
  return useQuery<ProviderConfig[]>({
    queryKey: ['providers'],
    queryFn: async () => {
      const { data } = await api.get('/admin/config');
      return data;
    },
  });
}

export function useSaveProviders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (providers: ProviderConfig[]) => {
      const { data } = await api.post('/admin/config', providers);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}

// --- Tokens ---
export function useTokens() {
  return useQuery<TokenConfig[]>({
    queryKey: ['tokens'],
    queryFn: async () => {
      const { data } = await api.get('/admin/tokens');
      return data;
    },
  });
}

export function useSaveTokens() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tokens: TokenConfig[]) => {
      const { data } = await api.post('/admin/tokens', tokens);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tokens'] });
    },
  });
}

// --- Settings ---
export function useSettings() {
  return useQuery<{ cooldownDuration: number }>({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await api.get('/admin/settings');
      return data;
    },
  });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: { cooldownDuration: number }) => {
      const { data } = await api.post('/admin/settings', settings);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

// --- Anthropic Status ---
export function useAnthropicStatus() {
  return useQuery<{ disabled: boolean }>({
    queryKey: ['anthropicStatus'],
    queryFn: async () => {
      const { data } = await api.get('/admin/anthropic-status');
      return data;
    },
  });
}

export function useSaveAnthropicStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (disabled: boolean) => {
      const { data } = await api.post('/admin/anthropic-status', { disabled });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anthropicStatus'] });
    },
  });
}

// --- Provider States (Circuit Breaker) ---
export function useProviderStates() {
  return useQuery<Record<string, ProviderState>>({
    queryKey: ['providerStates'],
    queryFn: async () => {
      const { data } = await api.get('/admin/provider-states');
      return data;
    },
    refetchInterval: 3000,
  });
}

export function useResetProviderState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.post(`/admin/provider-states/${encodeURIComponent(name)}/reset`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providerStates'] });
    },
  });
}

// --- Test Provider ---
export function useTestProvider() {
  return useMutation<TestProviderResponse, Error, ProviderConfig>({
    mutationFn: async (provider) => {
      const { data } = await api.post('/admin/test-provider', provider);
      return data;
    },
  });
}

// --- Rectifier ---
export function useRectifierConfig() {
  return useQuery<RectifierConfig>({
    queryKey: ['rectifier'],
    queryFn: async () => {
      const { data } = await api.get('/admin/rectifier');
      return data;
    },
  });
}

export function useSaveRectifierConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: RectifierConfig) => {
      const { data } = await api.post('/admin/rectifier', config);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rectifier'] });
    },
  });
}

// --- Auth ---
export function useValidateToken() {
  return useMutation({
    mutationFn: async (token: string) => {
      const { data } = await api.get('/admin/config', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return data;
    },
  });
}
