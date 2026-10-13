"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useState } from "react";
import { ClientApiError } from "@/lib/apiClient";

// Retry only network failures and 5xx. Never retry 4xx.
const shouldRetry = (count: number, err: unknown) =>
  err instanceof ClientApiError && (err.status >= 500 || err.status === 0) && count < 3;
const retryDelay = (n: number) => Math.min(1000 * 2 ** n, 8000);

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: shouldRetry, retryDelay, refetchOnWindowFocus: false },
          mutations: { retry: shouldRetry, retryDelay },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}