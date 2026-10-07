import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/server-store";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const zoneId = parseInt(id, 10);
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search") || "";
  const type = searchParams.get("type") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("page_size") || "10", 10);

  const result = serverDb.listRecords(zoneId, search, type, page, pageSize);
  return NextResponse.json(result);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const zoneId = parseInt(id, 10);
  try {
    const body = await request.json();
    if (!body.name || !body.type || !body.values || !body.values.length) {
      return NextResponse.json(
        { detail: "name, type, and values are required" },
        { status: 422 },
      );
    }
    const record = serverDb.createRecord(zoneId, {
      name: body.name,
      type: body.type,
      ttl: body.ttl || 300,
      values: Array.isArray(body.values) ? body.values : [body.values],
    });
    if (!record) {
      return NextResponse.json({ detail: "Hosted zone not found" }, { status: 404 });
    }
    return NextResponse.json(record, { status: 201 });
  } catch {
    return NextResponse.json({ detail: "Failed to create DNS record" }, { status: 400 });
  }
}
