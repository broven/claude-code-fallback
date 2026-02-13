import { useState, useEffect } from "react";
import { X, Plus, Trash2, Eye, EyeOff, Loader2, CheckCircle, XCircle } from "lucide-react";
import type { ProviderConfig, ModelTestResult } from "@/lib/types";
import { CLAUDE_MODELS } from "@/lib/types";
import { useTestProvider } from "@/hooks/use-api";

interface ProviderModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (provider: ProviderConfig) => void;
  provider?: ProviderConfig;
}

interface KVPair {
  key: string;
  value: string;
}

export function ProviderModal({ open, onClose, onSave, provider }: ProviderModalProps) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [format, setFormat] = useState<"anthropic" | "openai">("anthropic");
  const [retry, setRetry] = useState("0");
  const [showApiKey, setShowApiKey] = useState(false);
  const [modelMappings, setModelMappings] = useState<KVPair[]>([]);
  const [customHeaders, setCustomHeaders] = useState<KVPair[]>([]);
  const { mutate: testProvider, isPending: isTesting, data: testResults, reset: resetTest } = useTestProvider();

  useEffect(() => {
    if (open) {
      if (provider) {
        setName(provider.name);
        setBaseUrl(provider.baseUrl);
        setApiKey(provider.apiKey);
        setFormat(provider.format || "anthropic");
        setRetry(provider.retry?.toString() || "0");
        setModelMappings(
          provider.modelMapping
            ? Object.entries(provider.modelMapping).map(([key, value]) => ({ key, value }))
            : []
        );
        setCustomHeaders(
          provider.headers
            ? Object.entries(provider.headers).map(([key, value]) => ({ key, value }))
            : []
        );
      } else {
        setName("");
        setBaseUrl("");
        setApiKey("");
        setFormat("anthropic");
        setRetry("0");
        setModelMappings([]);
        setCustomHeaders([]);
      }
      setShowApiKey(false);
      resetTest();
    }
  }, [open, provider, resetTest]);

  const buildProvider = (): ProviderConfig | null => {
    if (!name.trim() || !baseUrl.trim() || !apiKey.trim()) return null;
    const p: ProviderConfig = { name: name.trim(), baseUrl: baseUrl.trim(), apiKey: apiKey.trim() };
    if (format !== "anthropic") p.format = format;
    const retryCount = parseInt(retry, 10);
    if (!isNaN(retryCount) && retryCount > 0) p.retry = retryCount;

    const mapping: Record<string, string> = {};
    let hasMapping = false;
    modelMappings.forEach((m) => {
      if (m.key && m.value) { mapping[m.key] = m.value; hasMapping = true; }
    });
    if (hasMapping) p.modelMapping = mapping;

    const hdrs: Record<string, string> = {};
    let hasHeaders = false;
    customHeaders.forEach((h) => {
      if (h.key && h.value) { hdrs[h.key] = h.value; hasHeaders = true; }
    });
    if (hasHeaders) p.headers = hdrs;

    return p;
  };

  const handleSave = () => {
    const p = buildProvider();
    if (!p) return;
    onSave(p);
  };

  const handleTest = () => {
    const p = buildProvider();
    if (!p) return;
    testProvider(p);
  };

  const handleSuggestMappings = () => {
    if (!testResults?.results) return;
    const newMappings = [...modelMappings];
    testResults.results.forEach((r: ModelTestResult) => {
      if (r.success || r.hasMappingConfigured) return;
      if (newMappings.some((m) => m.key === r.model)) return;
      newMappings.push({ key: r.model, value: "" });
    });
    setModelMappings(newMappings);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="max-h-[90vh] w-[90%] max-w-[600px] overflow-y-auto rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-lg font-semibold">{provider ? "Edit Provider" : "Add Provider"}</h3>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. openrouter"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          {/* Base URL */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Base URL *</label>
            <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="e.g. https://openrouter.ai/api/v1/chat/completions"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          {/* API Key */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">API Key *</label>
            <div className="relative">
              <input type={showApiKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <button type="button" onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Format */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">API Format</label>
            <select value={format} onChange={(e) => setFormat(e.target.value as "anthropic" | "openai")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="anthropic">Anthropic Messages API</option>
              <option value="openai">OpenAI Chat Completions</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">Select the API format this provider accepts.</p>
          </div>

          {/* Retry Count */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Retry Count</label>
            <input type="number" min="0" max="10" value={retry} onChange={(e) => setRetry(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <p className="mt-1 text-xs text-gray-500">Number of times to retry failed requests (network or server errors) before failing over.</p>
          </div>

          {/* Model Mappings */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Model Mapping</label>
            <p className="mb-2 text-xs text-gray-500">Map Anthropic model names to provider-specific names.</p>
            <div className="space-y-2">
              {modelMappings.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={m.key} onChange={(e) => { const updated = [...modelMappings]; updated[i].key = e.target.value; setModelMappings(updated); }}
                    className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm">
                    <option value="">-- Select model --</option>
                    {CLAUDE_MODELS.map((cm) => <option key={cm.id} value={cm.id}>{cm.label}</option>)}
                  </select>
                  <input type="text" value={m.value} onChange={(e) => { const updated = [...modelMappings]; updated[i].value = e.target.value; setModelMappings(updated); }}
                    placeholder="Target model" className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                  <button onClick={() => setModelMappings(modelMappings.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setModelMappings([...modelMappings, { key: "", value: "" }])}
              className="mt-1 text-xs text-blue-600 hover:underline">
              <Plus className="mr-0.5 inline h-3 w-3" /> Add mapping
            </button>
          </div>

          {/* Custom Headers */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Custom Headers</label>
            <p className="mb-2 text-xs text-gray-500">Additional headers to send with requests.</p>
            <div className="space-y-2">
              {customHeaders.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="text" value={h.key} onChange={(e) => { const updated = [...customHeaders]; updated[i].key = e.target.value; setCustomHeaders(updated); }}
                    placeholder="Header name" className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                  <input type="text" value={h.value} onChange={(e) => { const updated = [...customHeaders]; updated[i].value = e.target.value; setCustomHeaders(updated); }}
                    placeholder="Header value" className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                  <button onClick={() => setCustomHeaders(customHeaders.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setCustomHeaders([...customHeaders, { key: "", value: "" }])}
              className="mt-1 text-xs text-blue-600 hover:underline">
              <Plus className="mr-0.5 inline h-3 w-3" /> Add header
            </button>
          </div>

          {/* Test Results */}
          {isTesting && (
            <div className="flex items-center gap-2 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              <Loader2 className="h-4 w-4 animate-spin" /> Testing models...
            </div>
          )}
          {testResults?.results && (
            <div className="space-y-1">
              {testResults.results.map((r: ModelTestResult) => (
                <div key={r.model} className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm ${r.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                  {r.success ? <CheckCircle className="h-4 w-4 flex-shrink-0" /> : <XCircle className="h-4 w-4 flex-shrink-0" />}
                  <span className="font-medium">{r.label}</span>
                  <span className="ml-auto text-xs opacity-75">
                    {r.success ? (r.mappedTo ? `mapped to ${r.mappedTo}` : "OK") : (r.error || "Failed")}
                  </span>
                </div>
              ))}
              {testResults.suggestion && (
                <div className="rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                  {testResults.suggestion}{" "}
                  <button onClick={handleSuggestMappings} className="font-semibold underline">Add mappings</button>
                </div>
              )}
            </div>
          )}
          {testResults?.error && !testResults.results && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              <XCircle className="h-4 w-4" /> {testResults.error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-4">
          <button onClick={handleTest} disabled={isTesting || !name.trim() || !baseUrl.trim() || !apiKey.trim()}
            className="rounded-md border border-blue-500 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
            Test Connection
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200">
              Cancel
            </button>
            <button onClick={handleSave} disabled={!name.trim() || !baseUrl.trim() || !apiKey.trim()}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
