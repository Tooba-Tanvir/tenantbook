export type BookingStatus = "CONFIRMED" | "PENDING" | "CANCELLED";

export type Booking = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  userId: string;
  user?: { id: string; name: string; email?: string };
};

export type BookingInput = {
  title: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
};