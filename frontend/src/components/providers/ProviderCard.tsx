import { GripVertical, Pencil, Trash2 } from "lucide-react";
import type { ProviderConfig, ProviderState } from "@/lib/types";
import { CircuitBreakerBadge } from "./CircuitBreakerBadge";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ProviderCardProps {
  provider: ProviderConfig;
  index: number;
  providerState?: ProviderState;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onResetCb: () => void;
}

export function ProviderCard({ provider, index, providerState, onToggle, onEdit, onDelete, onResetCb }: ProviderCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: provider.name });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const mappingCount = provider.modelMapping ? Object.keys(provider.modelMapping).length : 0;

  return (
    <div ref={setNodeRef} style={style}
      className={`rounded-lg border-l-4 border-l-blue-500 bg-white p-4 shadow-sm ${provider.disabled ? "opacity-55" : ""} ${isDragging ? "ring-2 ring-blue-500" : ""}`}>
      <div className="flex items-center gap-2">
        <button {...attributes} {...listeners} className="flex-shrink-0 cursor-grab touch-none text-gray-300 hover:text-gray-500 active:cursor-grabbing" aria-label="Drag to reorder">
          <GripVertical className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-semibold text-white">{index + 2}</span>
            <span className={`text-base font-semibold ${provider.disabled ? "text-gray-400 line-through" : "text-gray-900"}`}>{provider.name}</span>
          </div>
          <p className="mt-1 break-all text-xs text-gray-500">{provider.baseUrl}</p>
          {provider.format === "openai" && <p className="mt-0.5 text-xs text-gray-400">Format: OpenAI</p>}
          {mappingCount > 0 && <p className="text-xs text-gray-400">Mappings: {mappingCount}</p>}
          {providerState && <CircuitBreakerBadge state={providerState} onReset={onResetCb} />}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <label className="relative inline-flex cursor-pointer items-center" title={provider.disabled ? "Enable" : "Disable"}>
            <input type="checkbox" className="peer sr-only" checked={!provider.disabled} onChange={(e) => onToggle(e.target.checked)} />
            <div className="peer h-5 w-9 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-green-500 peer-checked:after:translate-x-full"></div>
          </label>
          <button onClick={onEdit} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600" title="Edit"><Pencil className="h-4 w-4" /></button>
          <button onClick={onDelete} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
