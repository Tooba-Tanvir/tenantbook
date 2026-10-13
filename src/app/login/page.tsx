"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ClientApiError } from "@/lib/apiClient";
import { notifyError } from "@/lib/notify";

const input = "w-full rounded-lg border px-3 py-2 text-sm bg-transparent";

export default function LoginPage() {
  const router = useRouter();
  const [f, setF] = useState({ orgSlug: "lahore-dental", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.orgSlug || !f.email || !f.password) return setError("All fields are required");
    setBusy(true); setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: f });
      router.push("/bookings");
    } catch (err) {
      if (err instanceof ClientApiError && err.status === 401) setError("Invalid organization, email or password");
      else notifyError(err);
    } finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-xl border p-6">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <input className={input} placeholder="Organization slug" value={f.orgSlug} onChange={(e) => setF({ ...f, orgSlug: e.target.value })} />
        <input className={input} type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input className={input} type="password" placeholder="Password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm text-white disabled:opacity-50">
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}