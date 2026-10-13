"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import BookingForm from "@/components/BookingForm";
import { useBooking, useUpdateBooking } from "@/lib/bookings";

export default function EditBookingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, isError } = useBooking(id);
  const update = useUpdateBooking(id);

  if (isLoading) return <p className="text-sm text-zinc-500">Loading...</p>;
  if (isError || !data) return <p className="text-sm">Booking not found. <Link href="/bookings" className="underline">Back</Link></p>;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-xl font-semibold">Edit booking</h1>
      <BookingForm
        initial={data.data}
        submitLabel="Save changes"
        submit={async (input) => {
          await update.mutateAsync(input);
          toast.success("Booking updated");
          router.push(`/bookings/${id}`);
        }}
      />
    </div>
  );
}