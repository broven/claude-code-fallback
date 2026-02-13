import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { TokenSection } from "@/components/sections/TokenSection";
import { ProviderSection } from "@/components/sections/ProviderSection";
import { SettingsSection } from "@/components/sections/SettingsSection";
import { JsonEditorSection } from "@/components/sections/JsonEditorSection";

export default function Dashboard() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    navigate("/admin/login");
  };

  return (
    <div className="mx-auto min-h-screen max-w-4xl bg-gray-50 px-4 py-6 sm:px-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Claude Code Fallback Proxy</h1>
          <p className="text-sm text-gray-500">Admin Panel</p>
        </div>
        <button onClick={handleLogout}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
      <div className="space-y-8">
        <TokenSection />
        <ProviderSection />
        <SettingsSection />
        <JsonEditorSection />
      </div>
    </div>
  );
}
