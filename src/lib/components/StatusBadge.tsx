const styles: Record<string, string> = {
  CONFIRMED: "bg-green-100 text-green-800",
  PENDING: "bg-amber-100 text-amber-800",
  CANCELLED: "bg-zinc-200 text-zinc-600 line-through",
};
export default function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? ""}`}>{status}</span>;
}