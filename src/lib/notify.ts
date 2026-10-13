import { toast } from "sonner";
import { ClientApiError } from "@/lib/apiClient";

export function notifyError(e: unknown, retry?: () => void) {
  const err = e instanceof ClientApiError ? e : null;
  if (err?.status === 400 && err.details.length) return; // shown inline on the form
  if (err?.status === 401) return; // redirecting to /login
  const retryable = !err || err.status >= 500 || err.status === 0;
  toast.error(err?.message ?? "Something went wrong", {
    description: err?.requestId ? `Ref: ${err.requestId.slice(0, 8)}` : undefined,
    action: retry && retryable ? { label: "Retry", onClick: retry } : undefined,
  });
}