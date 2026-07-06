import { NextResponse } from "next/server";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function jsonOk<T>(data: T): NextResponse<{ ok: true; data: T }> {
  return NextResponse.json({ ok: true, data });
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  return NextResponse.json(
    { ok: false, error: { code: "INTERNAL", message } },
    { status: 500 }
  );
}
