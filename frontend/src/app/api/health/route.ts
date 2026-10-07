import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", app: "Route 53 Clone Next.js API" });
}
