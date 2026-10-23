"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export type Sub = { plan: "FREE" | "PRO" | "BUSINESS"; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean };
export type InvoiceRow = { id: string; number: string | null; amountPaid: number; currency: string; status: string; hostedInvoiceUrl: string | null; pdfUrl: string | null; createdAt: string };

// waitFor: keep polling every 2s (max ~30s) until the webhook has changed the DB
export function useSubscription(waitFor?: (s: Sub) => boolean) {
  return useQuery({
    queryKey: ["subscription"],
    queryFn: async () => (await api<{ data: Sub }>("/api/billing/subscription")).data,
    refetchInterval: (q) => (waitFor && q.state.data && !waitFor(q.state.data) && q.state.dataUpdateCount < 15 ? 2000 : false),
  });
}

export const useInvoices = () =>
  useQuery({ queryKey: ["invoices"], queryFn: () => api<{ data: InvoiceRow[] }>("/api/billing/invoices") });

export function useCheckout() {
  return useMutation({
    mutationFn: (plan: "PRO" | "BUSINESS") =>
      api<{ url: string }>("/api/billing/checkout", { method: "POST", body: { plan }, idempotencyKey: crypto.randomUUID() }),
    onSuccess: ({ url }) => { window.location.href = url; },
  });
}

export function useChangePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (plan: "PRO" | "BUSINESS") => api<{ target: string }>("/api/billing/change-plan", { method: "POST", body: { plan } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription"] }),
  });
}

export function usePortal() {
  return useMutation({
    mutationFn: () => api<{ url: string }>("/api/billing/portal", { method: "POST" }),
    onSuccess: ({ url }) => { window.location.href = url; },
  });
}