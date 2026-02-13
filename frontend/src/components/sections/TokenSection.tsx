import { useState } from "react";
import { useTokens, useSaveTokens } from "@/hooks/use-api";
import { toast } from "sonner";
import { Plus, Trash2, ChevronRight, Copy, Check } from "lucide-react";
import type { TokenConfig } from "@/lib/types";

export function TokenSection() {
  const { data: tokens = [], isLoading } = useTokens();
  const { mutate: saveTokens } = useSaveTokens();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTokenValue, setNewTokenValue] = useState("");
  const [newTokenNote, setNewTokenNote] = useState("");
  const [expandedTokenIndex, setExpandedTokenIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const generateToken = () =>
    "sk-cc-" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  const handleShowAdd = () => {
    setNewTokenValue(generateToken());
    setNewTokenNote("");
    setShowAddForm(true);
  };

  const handleAddToken = () => {
    const tokenVal = newTokenValue.trim() || generateToken();
    const noteVal = newTokenNote.trim();
    if (noteVal && !/^[a-zA-Z0-9 -]*$/.test(noteVal)) {
      toast.error("Note must contain only English letters, numbers, spaces, and hyphens");
      return;
    }
    const updated = [...tokens, { token: tokenVal, note: noteVal }];
    saveTokens(updated, {
      onSuccess: () => { toast.success("Token added"); setShowAddForm(false); },
      onError: () => toast.error("Failed to save tokens"),
    });
  };

  const handleDeleteToken = (index: number) => {
    if (!confirm("Delete this token? Clients using it will lose access.")) return;
    const updated = tokens.filter((_: TokenConfig, i: number) => i !== index);
    saveTokens(updated, {
      onSuccess: () => toast.success("Token deleted"),
      onError: () => toast.error("Failed to delete token"),
    });
  };

  const handleCopyConfig = (token: string, index: number) => {
    const config = `export ANTHROPIC_CUSTOM_HEADERS="x-ccf-api-key: ${token}"\nexport ANTHROPIC_BASE_URL="${window.location.origin}"`;
    navigator.clipboard.writeText(config);
    setCopiedIndex(index);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (isLoading) {
    return (
      <section>
        <div className="mb-4 flex items-center justify-between border-b-2 border-gray-200 pb-2">
          <h2 className="text-lg font-semibold text-gray-900">Access Tokens</h2>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-16 rounded-lg bg-gray-200" />
          <div className="h-16 rounded-lg bg-gray-200" />
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between border-b-2 border-gray-200 pb-2">
        <h2 className="text-lg font-semibold text-gray-900">Access Tokens</h2>
        <button onClick={handleShowAdd}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
          <Plus className="h-3.5 w-3.5" /> Add Token
        </button>
      </div>

      {showAddForm && (
        <div className="mb-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium text-gray-700">Token</label>
            <input type="text" value={newTokenValue} onChange={(e) => setNewTokenValue(e.target.value)} placeholder="sk-cc-..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <p className="mt-1 text-xs text-gray-500">Leave empty to auto-generate</p>
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium text-gray-700">Note (optional)</label>
            <input type="text" value={newTokenNote} onChange={(e) => setNewTokenNote(e.target.value)} placeholder="e.g. dev-machine-john"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <p className="mt-1 text-xs text-gray-500">English letters, numbers, spaces, and hyphens only</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddToken} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Save Token</button>
            <button onClick={() => setShowAddForm(false)} className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200">Cancel</button>
          </div>
        </div>
      )}

      {tokens.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
          No tokens configured. Anyone can access this proxy.
        </div>
      ) : (
        <div className="space-y-2">
          {tokens.map((tc: TokenConfig, i: number) => (
            <div key={tc.token} className="rounded-lg border-l-4 border-l-green-500 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <button onClick={() => setExpandedTokenIndex(expandedTokenIndex === i ? null : i)} className="flex-shrink-0 text-gray-400 hover:text-gray-600">
                    <ChevronRight className={`h-4 w-4 transition-transform ${expandedTokenIndex === i ? "rotate-90" : ""}`} />
                  </button>
                  <code className="truncate text-sm text-gray-800">{tc.token}</code>
                  {tc.note && <span className="ml-2 text-xs text-gray-500">({tc.note})</span>}
                </div>
                <button onClick={() => handleDeleteToken(i)} className="ml-2 flex-shrink-0 rounded p-1 text-red-500 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {expandedTokenIndex === i && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <p className="mb-2 text-xs text-gray-500">Configure Claude Code to use this proxy with this token:</p>
                  <div className="relative rounded-md bg-gray-50 p-3 font-mono text-xs text-gray-700">
                    <pre className="whitespace-pre-wrap break-all">{`export ANTHROPIC_CUSTOM_HEADERS="x-ccf-api-key: ${tc.token}"\nexport ANTHROPIC_BASE_URL="${window.location.origin}"`}</pre>
                    <button onClick={() => handleCopyConfig(tc.token, i)} className="absolute right-2 top-2 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600">
                      {copiedIndex === i ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
