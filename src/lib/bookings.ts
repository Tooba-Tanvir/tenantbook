"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { Booking, BookingInput } from "@/lib/types";

export function useBookings(p: { from: Date; to: Date; status?: string }) {
  const qs = new URLSearchParams({
    from: p.from.toISOString(),
    to: p.to.toISOString(),
    pageSize: "100",
  });
  if (p.status) qs.set("status", p.status);
  return useQuery({
    queryKey: ["bookings", qs.toString()],
    queryFn: () => api<{ data: Booking[]; total: number }>(`/api/bookings?${qs}`),
  });
}

export function useBooking(id: string) {
  return useQuery({
    queryKey: ["booking", id],
    queryFn: () => api<{ data: Booking }>(`/api/bookings/${id}`),
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    // the key is part of the variables, so automatic retries reuse the same key
    mutationFn: ({ input, key }: { input: BookingInput; key: string }) =>
      api<{ data: Booking }>("/api/bookings", { method: "POST", body: input, idempotencyKey: key }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
}

export function useUpdateBooking(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<BookingInput>) =>
      api<{ data: Booking }>(`/api/bookings/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["booking", id] });
    },
  });
}

export function useDeleteBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/bookings/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["bookings"] });
      const snapshot = qc.getQueriesData<{ data: Booking[]; total: number }>({ queryKey: ["bookings"] });
      qc.setQueriesData<{ data: Booking[]; total: number }>({ queryKey: ["bookings"] }, (old) =>
        old ? { ...old, data: old.data.filter((b) => b.id !== id) } : old
      );
      return { snapshot };
    },
    onError: (_e, _id, ctx) => ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data)), // rollback
    onSettled: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
}