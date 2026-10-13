"use client";
import { useState } from "react";
import Link from "next/link";
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, format, parseISO,
} from "date-fns";
import { useBookings } from "@/lib/bookings";
import StatusBadge from "@/components/StatusBadge";
import { notifyError } from "@/lib/notify";
import type { Booking } from "@/lib/types";

const chip: Record<string, string> = {
  CONFIRMED: "bg-green-100 text-green-800",
  PENDING: "bg-amber-100 text-amber-800",
  CANCELLED: "bg-zinc-200 text-zinc-500 line-through",
};

export default function BookingsPage() {
  const [month, setMonth] = useState(() => new Date());
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [status, setStatus] = useState("");

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const { data, isLoading, isError, error, refetch } = useBookings({
    from: gridStart, to: gridEnd, status: status || undefined,
  });
  const bookings: Booking[] = data?.data ?? [];
  const onDay = (d: Date) => bookings.filter((b) => isSameDay(parseISO(b.startsAt), d));

  if (isError) notifyError(error, () => refetch());

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setMonth(subMonths(month, 1))} className="rounded border px-3 py-1.5 text-sm">&lt;</button>
        <button onClick={() => setMonth(new Date())} className="rounded border px-3 py-1.5 text-sm">Today</button>
        <button onClick={() => setMonth(addMonths(month, 1))} className="rounded border px-3 py-1.5 text-sm">&gt;</button>
        <h1 className="mx-2 text-lg font-semibold">{format(month, "MMMM yyyy")}</h1>

        <select value={status} onChange={(e) => setStatus(e.target.value)} className="ml-auto rounded border bg-transparent px-2 py-1.5 text-sm">
          <option value="">All statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="PENDING">Pending</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <div className="hidden overflow-hidden rounded border text-sm md:flex">
          {(["calendar", "list"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 capitalize ${view === v ? "bg-blue-600 text-white" : ""}`}>{v}</button>
          ))}
        </div>
        <Link href="/bookings/new" className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white">+ New booking</Link>
      </div>

      {isLoading && <p className="mt-8 text-center text-sm text-zinc-500">Loading bookings...</p>}
      {isError && (
        <div className="mt-8 text-center text-sm">
          Could not load bookings. <button onClick={() => refetch()} className="underline">Try again</button>
        </div>
      )}
      {!isLoading && !isError && bookings.length === 0 && (
        <p className="mt-8 text-center text-sm text-zinc-500">No bookings this month.</p>
      )}

      {/* Desktop calendar grid */}
      {!isLoading && view === "calendar" && (
        <div className="mt-4 hidden grid-cols-7 overflow-hidden rounded-lg border md:grid">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="border-b bg-zinc-50 p-2 text-center text-xs font-medium dark:bg-zinc-900">{d}</div>
          ))}
          {days.map((d) => (
            <div key={d.toISOString()} className={`min-h-28 border-b border-r p-1.5 ${isSameMonth(d, month) ? "" : "opacity-40"}`}>
              <div className={`mb-1 text-xs ${isSameDay(d, new Date()) ? "font-bold text-blue-600" : ""}`}>{format(d, "d")}</div>
              <div className="space-y-1">
                {onDay(d).slice(0, 3).map((b) => (
                  <Link key={b.id} href={`/bookings/${b.id}`} className={`block truncate rounded px-1.5 py-0.5 text-xs ${chip[b.status]}`}>
                    {format(parseISO(b.startsAt), "HH:mm")} {b.title}
                  </Link>
                ))}
                {onDay(d).length > 3 && <p className="text-xs text-zinc-500">+{onDay(d).length - 3} more</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agenda list: always on mobile, optional on desktop */}
      {!isLoading && (
        <div className={`mt-4 space-y-4 ${view === "calendar" ? "md:hidden" : ""}`}>
          {days.filter((d) => onDay(d).length > 0).map((d) => (
            <section key={d.toISOString()}>
              <h2 className="mb-1 text-sm font-semibold text-zinc-500">{format(d, "EEEE, d MMM")}</h2>
              <ul className="space-y-2">
                {onDay(d).map((b) => (
                  <li key={b.id}>
                    <Link href={`/bookings/${b.id}`} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium">{b.title}</p>
                        <p className="text-xs text-zinc-500">
                          {format(parseISO(b.startsAt), "HH:mm")} - {format(parseISO(b.endsAt), "HH:mm")}
                          {b.user && ` · ${b.user.name}`}
                        </p>
                      </div>
                      <StatusBadge status={b.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}