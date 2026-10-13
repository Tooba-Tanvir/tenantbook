"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import BookingForm from "@/components/BookingForm";
import { useCreateBooking } from "@/lib/bookings";

export default function NewBookingPage() {
  const router = useRouter();
  const create = useCreateBooking();
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-xl font-semibold">New booking</h1>
      <BookingForm
        submitLabel="Create booking"
        submit={async (input, key) => {
          const res = await create.mutateAsync({ input, key });
          toast.success("Booking created");
          router.push(`/bookings/${res.data.id}`);
        }}
      />
    </div>
  );
}