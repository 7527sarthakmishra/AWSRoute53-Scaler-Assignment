import { NextResponse } from "next/server";
import { serverDb } from "@/lib/server-store";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = (body.email || "admin@example.com").trim().toLowerCase();
    const user = serverDb.getUser();
    return NextResponse.json({
      token: "demo-session-token-" + Date.now(),
      user: {
        id: user.id,
        email: email || user.email,
        name: user.name,
      },
    });
  } catch {
    return NextResponse.json({ detail: "Invalid credentials" }, { status: 400 });
  }
}
