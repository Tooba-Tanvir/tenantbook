"use client";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO } from "date-fns";
import { ClientApiError } from "@/lib/apiClient";
import { notifyError } from "@/lib/notify";
import type { Booking, BookingInput } from "@/lib/types";

const schema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(120, "Max 120 characters"),
    startsAt: z.string().min(1, "Start is required"),
    endsAt: z.string().min(1, "End is required"),
    status: z.enum(["CONFIRMED", "PENDING", "CANCELLED"]),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: "End must be after start",
    path: ["endsAt"],
  });
type FormValues = z.infer<typeof schema>;

const input = "w-full rounded-lg border px-3 py-2 text-sm bg-transparent";
const toLocal = (iso: string) => format(parseISO(iso), "yyyy-MM-dd'T'HH:mm");

export default function BookingForm(props: {
  initial?: Booking;
  submitLabel: string;
  submit: (payload: BookingInput, idempotencyKey: string) => Promise<unknown>;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: props.initial?.title ?? "",
      startsAt: props.initial ? toLocal(props.initial.startsAt) : "",
      endsAt: props.initial ? toLocal(props.initial.endsAt) : "",
      status: props.initial?.status ?? "CONFIRMED",
    },
  });

  // Same payload = same key (safe retries). Edited payload = new key.
  const attempt = useRef<{ sig: string; key: string } | null>(null);
  const keyFor = (p: BookingInput) => {
    const sig = JSON.stringify(p);
    if (attempt.current?.sig !== sig) attempt.current = { sig, key: crypto.randomUUID() };
    return attempt.current.key;
  };

  const onSubmit = async (v: FormValues) => {
    const payload: BookingInput = {
      title: v.title,
      startsAt: new Date(v.startsAt).toISOString(),
      endsAt: new Date(v.endsAt).toISOString(),
      status: v.status,
    };
    try {
      await props.submit(payload, keyFor(payload));
    } catch (e) {
      if (e instanceof ClientApiError && e.details.length) {
        e.details.forEach((d) => {
          if (d.path in v) setError(d.path as keyof FormValues, { message: d.message });
        });
      }
      notifyError(e, () => handleSubmit(onSubmit)());
    }
  };

  const Err = ({ name }: { name: keyof FormValues }) =>
    errors[name] ? <p className="mt-1 text-xs text-red-600">{errors[name]?.message}</p> : null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label className="mb-1 block text-sm font-medium">Title</label>
        <input {...register("title")} className={input} placeholder="e.g. Dental checkup" />
        <Err name="title" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Starts</label>
          <input type="datetime-local" {...register("startsAt")} className={input} />
          <Err name="startsAt" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Ends</label>
          <input type="datetime-local" {...register("endsAt")} className={input} />
          <Err name="endsAt" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Status</label>
        <select {...register("status")} className={input}>
          <option value="CONFIRMED">Confirmed</option>
          <option value="PENDING">Pending</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
      <button
        disabled={isSubmitting}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? "Saving..." : props.submitLabel}
      </button>
    </form>
  );
}