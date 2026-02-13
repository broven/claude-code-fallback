import { useState, useCallback } from "react";
import {
  useProviders,
  useSaveProviders,
  useAnthropicStatus,
  useSaveAnthropicStatus,
  useProviderStates,
  useResetProviderState,
} from "@/hooks/use-api";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { ProviderConfig } from "@/lib/types";
import { ProviderCard } from "@/components/providers/ProviderCard";
import { AnthropicCard } from "@/components/providers/AnthropicCard";
import { ProviderModal } from "@/components/providers/ProviderModal";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

export function ProviderSection() {
  const { data: providers = [], isLoading } = useProviders();
  const { mutate: saveProviders } = useSaveProviders();
  const { data: anthropicStatus } = useAnthropicStatus();
  const { mutate: saveAnthropicStatus } = useSaveAnthropicStatus();
  const { data: providerStates = {} } = useProviderStates();
  const { mutate: resetProviderState } = useResetProviderState();
  const [modalOpen, setModalOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | undefined>(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const anthropicDisabled = anthropicStatus?.disabled ?? false;

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = providers.findIndex((p: ProviderConfig) => p.name === active.id);
      const newIndex = providers.findIndex((p: ProviderConfig) => p.name === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove([...providers], oldIndex, newIndex);
      saveProviders(reordered, {
        onSuccess: () => toast.success("Provider order updated"),
        onError: () => toast.error("Failed to reorder providers"),
      });
    },
    [providers, saveProviders]
  );

  const handleToggleProvider = (index: number, enabled: boolean) => {
    const updated = providers.map((p: ProviderConfig, i: number) =>
      i === index ? { ...p, disabled: !enabled } : p
    );
    saveProviders(updated, {
      onSuccess: () => toast.success(enabled ? "Provider enabled" : "Provider disabled"),
      onError: () => toast.error("Failed to update provider"),
    });
  };

  const handleDeleteProvider = (index: number) => {
    if (!confirm("Delete this provider?")) return;
    const updated = providers.filter((_: ProviderConfig, i: number) => i !== index);
    saveProviders(updated, {
      onSuccess: () => toast.success("Provider deleted"),
      onError: () => toast.error("Failed to delete provider"),
    });
  };

  const handleEditProvider = (index: number) => {
    setEditIndex(index);
    setModalOpen(true);
  };

  const handleAddProvider = () => {
    setEditIndex(undefined);
    setModalOpen(true);
  };

  const handleSaveProvider = (provider: ProviderConfig) => {
    let updated: ProviderConfig[];
    if (editIndex !== undefined) {
      updated = providers.map((p: ProviderConfig, i: number) => (i === editIndex ? provider : p));
    } else {
      updated = [...providers, provider];
    }
    saveProviders(updated, {
      onSuccess: () => {
        toast.success(editIndex !== undefined ? "Provider updated" : "Provider added");
        setModalOpen(false);
      },
      onError: () => toast.error("Failed to save provider"),
    });
  };

  const handleToggleAnthropic = (enabled: boolean) => {
    saveAnthropicStatus(!enabled, {
      onSuccess: () => toast.success(enabled ? "Anthropic API enabled" : "Anthropic API disabled"),
      onError: () => toast.error("Failed to update Anthropic status"),
    });
  };

  const handleResetCb = (name: string) => {
    resetProviderState(name, {
      onSuccess: () => toast.success(`Circuit breaker reset for ${name}`),
      onError: () => toast.error("Failed to reset circuit breaker"),
    });
  };

  if (isLoading) {
    return (
      <section>
        <div className="mb-4 flex items-center justify-between border-b-2 border-gray-200 pb-2">
          <h2 className="text-lg font-semibold text-gray-900">Fallback Providers</h2>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-24 rounded-lg bg-gray-200" />
          <div className="h-24 rounded-lg bg-gray-200" />
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between border-b-2 border-gray-200 pb-2">
        <h2 className="text-lg font-semibold text-gray-900">Fallback Providers</h2>
        <button
          onClick={handleAddProvider}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" /> Add Provider
        </button>
      </div>

      {/* Anthropic Primary (fixed, always first) */}
      <AnthropicCard
        disabled={anthropicDisabled}
        providerState={providerStates["anthropic-primary"]}
        onToggle={handleToggleAnthropic}
        onResetCb={() => handleResetCb("anthropic-primary")}
      />

      {/* Fallback Providers (draggable) */}
      {providers.length === 0 ? (
        <div className="mt-2 rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
          No fallback providers configured. Add one to get started.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={providers.map((p: ProviderConfig) => p.name)} strategy={verticalListSortingStrategy}>
            <div className="mt-2 space-y-2">
              {providers.map((provider: ProviderConfig, index: number) => (
                <ProviderCard
                  key={provider.name}
                  provider={provider}
                  index={index}
                  providerState={providerStates[provider.name]}
                  onToggle={(enabled) => handleToggleProvider(index, enabled)}
                  onEdit={() => handleEditProvider(index)}
                  onDelete={() => handleDeleteProvider(index)}
                  onResetCb={() => handleResetCb(provider.name)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Provider Modal */}
      <ProviderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveProvider}
        provider={editIndex !== undefined ? providers[editIndex] : undefined}
      />
    </section>
  );
}
