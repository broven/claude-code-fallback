import { useState, useEffect } from "react";
import type { ProviderState } from "@/lib/types";
import { RotateCcw } from "lucide-react";

interface CircuitBreakerBadgeProps {
  state: ProviderState;
  onReset: () => void;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "recovering...";
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min}m ${sec}s`;
  return `${sec}s`;
}

export function CircuitBreakerBadge({ state, onReset }: CircuitBreakerBadgeProps) {
  const [now, setNow] = useState(Date.now());

  const inCooldown = state.cooldownUntil && state.cooldownUntil > now;

  useEffect(() => {
    if (!inCooldown) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [inCooldown]);

  if (inCooldown) {
    const remaining = state.cooldownUntil! - now;
    return (
      <div className="mt-1.5 space-y-0.5">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs text-red-800">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          In Cooldown
          <span className="tabular-nums">{formatCountdown(remaining)}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onReset(); }}
            className="ml-1 rounded p-0.5 hover:bg-red-200"
            title="Reset circuit breaker"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
        <div className="text-[11px] text-gray-500">
          {state.consecutiveFailures} consecutive failures
        </div>
      </div>
    );
  }

  if (state.consecutiveFailures > 0) {
    return (
      <div className="mt-1.5 space-y-0.5">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs text-green-800">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          Healthy
        </div>
        <div className="text-[11px] text-gray-500">
          {state.consecutiveFailures} consecutive failures
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs text-green-800">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        Healthy
      </div>
    </div>
  );
}
