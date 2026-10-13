import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { randomUUID } from "crypto";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "IDEMPOTENCY_KEY_REUSED"
  | "INTERNAL_ERROR";

export type ErrorDetail = { path: string; message: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: ErrorDetail[]
  ) {
    super(message);
  }
}

function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: ErrorDetail[]
) {
  return NextResponse.json(
    { error: { code, message, details, requestId } },
    { status }
  );
}

// Har route handler ko is mein wrap karein
export function handle<C = unknown>(
  fn: (req: Request, ctx: C) => Promise<Response>
) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const requestId = randomUUID();
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ZodError) {
        const details = e.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        }));
        return errorResponse(400, "VALIDATION_ERROR", "Request validation failed", requestId, details);
      }
      if (e instanceof ApiError) {
        return errorResponse(e.status, e.code, e.message, requestId, e.details);
      }
      console.error(`[${requestId}]`, e);
      return errorResponse(500, "INTERNAL_ERROR", "Something went wrong", requestId);
    }
  };
}