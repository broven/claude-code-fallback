import { useState, useEffect } from "react";
import { useSettings, useSaveSettings } from "@/hooks/use-api";
import { toast } from "sonner";

export function SettingsSection() {
  const { data: settings, isLoading } = useSettings();
  const { mutate: saveSettings } = useSaveSettings();
  const [cooldown, setCooldown] = useState(300);

  useEffect(() => {
    if (settings) {
      setCooldown(settings.cooldownDuration);
    }
  }, [settings]);

  const handleSave = () => {
    saveSettings(
      { cooldownDuration: cooldown },
      {
        onSuccess: () => toast.success("Settings saved!"),
        onError: () => toast.error("Failed to save settings"),
      }
    );
  };

  if (isLoading) {
    return (
      <section>
        <div className="mb-4 flex items-center justify-between border-b-2 border-gray-200 pb-2">
          <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
        </div>
        <div className="animate-pulse h-32 rounded-lg bg-gray-200" />
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between border-b-2 border-gray-200 pb-2">
        <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
      </div>
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Max Circuit Breaker Cooldown (seconds)
          </label>
          <p className="mb-2 text-xs text-gray-500">
            Maximum cooldown duration after repeated failures. Actual cooldown scales with consecutive failures: 3+ = 30s, 5+ = 60s, 10+ = up to this value (default: 300s).
          </p>
          <input
            type="number"
            value={cooldown}
            onChange={(e) => setCooldown(parseInt(e.target.value, 10) || 0)}
            min={0}
            step={1}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={handleSave}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          Save Settings
        </button>
      </div>
    </section>
  );
}
