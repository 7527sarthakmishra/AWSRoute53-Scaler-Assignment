import { NextResponse } from "next/server";
import { serverDb } from "@/lib/server-store";

export async function GET() {
  const user = serverDb.getUser();
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
  });
}
