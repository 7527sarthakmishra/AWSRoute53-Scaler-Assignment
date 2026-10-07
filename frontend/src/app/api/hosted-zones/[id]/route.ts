import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/server-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const zoneId = parseInt(id, 10);
  const zone = serverDb.getZone(zoneId);
  if (!zone) {
    return NextResponse.json({ detail: "Hosted zone not found" }, { status: 404 });
  }
  return NextResponse.json(zone);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const zoneId = parseInt(id, 10);
  try {
    const body = await request.json();
    const zone = serverDb.updateZone(zoneId, body.comment);
    if (!zone) {
      return NextResponse.json({ detail: "Hosted zone not found" }, { status: 404 });
    }
    return NextResponse.json(zone);
  } catch {
    return NextResponse.json({ detail: "Failed to update hosted zone" }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const zoneId = parseInt(id, 10);
  const success = serverDb.deleteZone(zoneId);
  if (!success) {
    return NextResponse.json({ detail: "Hosted zone not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
