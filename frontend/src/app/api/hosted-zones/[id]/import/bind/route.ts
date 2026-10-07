import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/server-store";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const zoneId = parseInt(id, 10);
  try {
    const body = await request.json();
    const content = body.content || "";
    const replaceExisting = Boolean(body.replace_existing);
    const result = serverDb.importBind(zoneId, content, replaceExisting);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ detail: "Failed to import BIND file" }, { status: 400 });
  }
}
