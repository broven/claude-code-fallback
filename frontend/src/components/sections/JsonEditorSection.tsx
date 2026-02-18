import { useState } from "react";
import { useProviders, useSaveProviders } from "@/hooks/use-api";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";

export function JsonEditorSection() {
  const { data: providers = [] } = useProviders();
  const { mutate: saveProviders } = useSaveProviders();
  const [isOpen, setIsOpen] = useState(false);
  const [jsonValue, setJsonValue] = useState("");

  const handleToggle = () => {
    if (!isOpen) {
      setJsonValue(JSON.stringify(providers, null, 2));
    }
    setIsOpen(!isOpen);
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(jsonValue);
      setJsonValue(JSON.stringify(parsed, null, 2));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("Invalid JSON: " + msg);
    }
  };

  const handleSave = () => {
    try {
      const parsed = JSON.parse(jsonValue);
      saveProviders(parsed, {
        onSuccess: () => toast.success("Configuration saved!"),
        onError: () => toast.error("Failed to save configuration"),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("Invalid JSON: " + msg);
    }
  };

  return (
    <section>
      <div
        className="mb-4 flex cursor-pointer items-center justify-between border-b-2 border-gray-200 pb-2"
        onClick={handleToggle}
      >
        <h2 className="flex items-center gap-1 text-lg font-semibold text-gray-900">
          <ChevronRight className={`h-5 w-5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
          JSON Editor
        </h2>
      </div>

      {isOpen && (
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <textarea
            value={jsonValue}
            onChange={(e) => setJsonValue(e.target.value)}
            className="h-72 w-full resize-y rounded-md border border-gray-300 p-3 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            spellCheck={false}
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSave}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Save Configuration
            </button>
            <button
              onClick={handleFormat}
              className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
            >
              Format JSON
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
