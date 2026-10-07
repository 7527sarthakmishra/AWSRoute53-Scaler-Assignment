import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/server-store";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("page_size") || "10", 10);

  const result = serverDb.listZones(search, page, pageSize);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ detail: "Zone name is required" }, { status: 422 });
    }
    const zone = serverDb.createZone({
      name: body.name,
      comment: body.comment,
      private_zone: body.private_zone,
    });
    return NextResponse.json(zone, { status: 201 });
  } catch {
    return NextResponse.json({ detail: "Failed to create hosted zone" }, { status: 400 });
  }
}
