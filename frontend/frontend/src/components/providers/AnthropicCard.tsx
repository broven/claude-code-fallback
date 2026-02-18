import type { ProviderState } from "@/lib/types";
import { CircuitBreakerBadge } from "@/components/providers/CircuitBreakerBadge";

interface AnthropicCardProps {
  disabled: boolean;
  providerState?: ProviderState;
  onToggle: (enabled: boolean) => void;
  onResetCb: () => void;
}

export function AnthropicCard({ disabled, providerState, onToggle, onResetCb }: AnthropicCardProps) {
  return (
    <div className={`rounded-lg border-l-4 border-l-amber-500 bg-white p-4 shadow-sm ${disabled ? "opacity-55" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-semibold text-white">
              1
            </span>
            <span className={`text-base font-semibold ${disabled ? "text-gray-400 line-through" : "text-gray-900"}`}>
              Anthropic API
            </span>
            <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-medium text-white">PRIMARY</span>
          </div>
          <p className="mt-1 text-xs text-gray-500 break-all">https://api.anthropic.com/v1/messages</p>
          {providerState && <CircuitBreakerBadge state={providerState} onReset={onResetCb} />}
        </div>
        <label className="relative inline-flex cursor-pointer items-center" title={disabled ? "Enable" : "Disable"}>
          <input
            type="checkbox"
            className="peer sr-only"
            checked={!disabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <div className="peer h-5 w-9 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-green-500 peer-checked:after:translate-x-full"></div>
        </label>
      </div>
    </div>
  );
}
