import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/server-store";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; record_id: string }> },
) {
  const { id, record_id } = await params;
  const zoneId = parseInt(id, 10);
  const recordId = parseInt(record_id, 10);
  try {
    const body = await request.json();
    const updated = serverDb.updateRecord(zoneId, recordId, {
      ttl: body.ttl,
      values: body.values,
    });
    if (!updated) {
      return NextResponse.json({ detail: "Record not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ detail: "Failed to update record" }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; record_id: string }> },
) {
  const { id, record_id } = await params;
  const zoneId = parseInt(id, 10);
  const recordId = parseInt(record_id, 10);
  const success = serverDb.deleteRecord(zoneId, recordId);
  if (!success) {
    return NextResponse.json({ detail: "Record not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
