"use client";
export default function ConfirmDialog(props: {
  open: boolean; title: string; message: string; confirmLabel?: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">{props.title}</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{props.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={props.onCancel} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
          <button onClick={props.onConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white">
            {props.confirmLabel ?? "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}