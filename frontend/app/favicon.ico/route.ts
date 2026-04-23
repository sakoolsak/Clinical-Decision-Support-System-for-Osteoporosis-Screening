import { NextResponse } from "next/server";

export function GET() {
  // Prevent 404 noise in dev logs when browser requests favicon.ico.
  return new NextResponse(null, { status: 204 });
}
