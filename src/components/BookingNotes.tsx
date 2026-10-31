"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useBookingNote, type SaveStatus } from "@/lib/useBookingNote";

const statusLabel: Record<SaveStatus, string> = {
  loading: "Loading...",
  saved: "All changes saved",
  saving: "Saving...",
  unsaved: "Unsaved changes",
  conflict: "Conflict",
  error: "Could not save",
};
const statusDot: Record<SaveStatus, string> = {
  loading: "bg-zinc-400",
  saved: "bg-green-500",
  saving: "bg-blue-500 animate-pulse",
  unsaved: "bg-amber-500",
  conflict: "bg-red-500",
  error: "bg-red-500",
};

const initials = (name: string) =>
  name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export default function BookingNotes({ bookingId }: { bookingId: string }) {
  const n = useBookingNote(bookingId);

  const prev = useRef(n.conn);
  useEffect(() => {
    if (prev.current !== "connected" && n.conn === "connected") toast.success("Back online. Notes synced.");
    prev.current = n.conn;
  }, [n.conn]);

  const names = Object.values(n.typing);
  const typingText =
    names.length === 0 ? "" : names.length === 1 ? `${names[0]} is typing...` : `${names.slice(0, 2).join(" and ")} are typing...`;
  const shown = n.viewers.slice(0, 4);

  return (
    <section className="mt-8">
      {n.conn !== "connected" && (
        <div
          role="status"
          className={`fixed inset-x-0 top-0 z-40 px-4 py-2 text-center text-sm text-white ${
            n.conn === "offline" ? "bg-red-600" : "bg-amber-600"
          }`}
        >
          {n.conn === "offline"
            ? "You're offline. Your edits stay on this page and will sync when you're back."
            : "Connection lost. Reconnecting..."}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Notes</h2>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2" aria-label="People viewing this booking">
            {shown.map((v) => (
              <span
                key={v.userId}
                title={v.userId === n.me ? `${v.name} (you)` : v.name}
                style={{ backgroundColor: v.color }}
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-medium text-white dark:border-zinc-900"
              >
                {initials(v.name)}
              </span>
            ))}
            {n.viewers.length > shown.length && (
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-zinc-300 text-xs dark:border-zinc-900">
                +{n.viewers.length - shown.length}
              </span>
            )}
          </div>
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className={`h-2 w-2 rounded-full ${statusDot[n.status]}`} />
            {statusLabel[n.status]}
          </span>
        </div>
      </div>

      {n.conflict && (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-medium">
            {n.conflict.by ? `${n.conflict.by} changed` : "Someone changed"} this note while you were editing.
          </p>
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs opacity-80">{n.conflict.content || "(empty)"}</p>
          <div className="mt-2 flex gap-2">
            <button onClick={n.loadTheirs} className="rounded border border-red-300 bg-white px-3 py-1 text-xs">
              Load their version
            </button>
            <button onClick={n.keepMine} className="rounded bg-red-600 px-3 py-1 text-xs text-white">
              Keep mine (overwrite)
            </button>
          </div>
        </div>
      )}

      <textarea
        value={n.content}
        onChange={(e) => n.setContent(e.target.value)}
        disabled={n.status === "loading"}
        rows={8}
        maxLength={20000}
        placeholder="Add notes for this booking..."
        className="mt-3 w-full rounded-lg border bg-transparent p-3 text-sm"
      />
      <p className="mt-1 min-h-5 text-xs text-zinc-500">{typingText}</p>
    </section>
  );
}