"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { useBooking, useDeleteBooking } from "@/lib/bookings";
import { notifyError } from "@/lib/notify";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useBooking(id);
  const del = useDeleteBooking();
  const [confirm, setConfirm] = useState(false);

  if (isLoading) return <p className="text-sm text-zinc-500">Loading...</p>;
  if (isError || !data) {
    const notFound = (error as { status?: number })?.status === 404;
    return (
      <div className="text-center text-sm">
        {notFound ? "Booking not found." : "Could not load booking."}{" "}
        {!notFound && <button onClick={() => refetch()} className="underline">Try again</button>}
        <div className="mt-3"><Link href="/bookings" className="underline">Back to bookings</Link></div>
      </div>
    );
  }
  const b = data.data;

  const doDelete = () => {
    setConfirm(false);
    del.mutate(id, {
      onSuccess: () => { toast.success("Booking deleted"); router.push("/bookings"); },
      onError: (e) => notifyError(e, () => doDelete()), // already rolled back
    });
  };

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 border-b py-3 text-sm">
      <span className="text-zinc-500">{label}</span><span className="text-right">{value}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/bookings" className="text-sm text-zinc-500 underline">&larr; Back</Link>
      <div className="mt-3 flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold">{b.title}</h1>
        <StatusBadge status={b.status} />
      </div>
      <div className="mt-4">
        {row("Starts", format(parseISO(b.startsAt), "EEE d MMM yyyy, HH:mm"))}
        {row("Ends", format(parseISO(b.endsAt), "EEE d MMM yyyy, HH:mm"))}
        {row("Booked by", b.user?.name ?? "-")}
      </div>
      <div className="mt-6 flex gap-2">
        <Link href={`/bookings/${id}/edit`} className="flex-1 rounded-lg border px-4 py-2.5 text-center text-sm">Edit</Link>
        <button onClick={() => setConfirm(true)} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm text-white">Delete</button>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Delete booking?"
        message={`"${b.title}" will be permanently removed.`}
        onConfirm={doDelete}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}