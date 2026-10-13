"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";

export default function BookingsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 pb-10">
      <header className="flex items-center justify-between py-4">
        <Link href="/bookings" className="text-lg font-semibold">TenantBook</Link>
        <button
          className="text-sm text-zinc-500 underline"
          onClick={async () => { await api("/api/auth/logout", { method: "POST" }); router.push("/login"); }}
        >
          Log out
        </button>
      </header>
      {children}
    </div>
  );
}