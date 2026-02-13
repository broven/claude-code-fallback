import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useValidateToken } from "@/hooks/use-api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Login() {
  const [token, setToken] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const { mutate: validateToken, isPending } = useValidateToken();

  useEffect(() => {
    const savedToken = localStorage.getItem("admin_token");
    if (savedToken) {
      validateToken(savedToken, {
        onSuccess: () => navigate("/admin"),
        onError: () => localStorage.removeItem("admin_token"),
      });
    }

    const params = new URLSearchParams(location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      setToken(urlToken);
      handleLogin(urlToken);
    }
  }, []);

  const handleLogin = (tokenToUse: string = token) => {
    if (!tokenToUse) return;
    validateToken(tokenToUse, {
      onSuccess: () => {
        localStorage.setItem("admin_token", tokenToUse);
        toast.success("Login successful");
        navigate("/admin");
      },
      onError: () => {
        toast.error("Invalid token. Please try again.");
      },
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Claude Code Fallback</h1>
          <p className="mt-2 text-sm text-gray-600">Enter your admin token to continue</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
          <div className="space-y-2">
            <label htmlFor="token" className="block text-sm font-medium text-gray-700">Admin Token</label>
            <input
              id="token" type="password" autoComplete="current-password" required
              className="block w-full rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              placeholder="Enter admin token" value={token} onChange={(e) => setToken(e.target.value)} disabled={isPending}
            />
          </div>
          <button type="submit" disabled={isPending}
            className="flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
            {isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Validating...</>) : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
