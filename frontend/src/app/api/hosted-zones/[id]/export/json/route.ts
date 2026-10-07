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
  const records = serverDb.listRecords(zoneId, "", "", 1, 1000);
  const data = {
    zone,
    records: records.items,
  };
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="hosted-zone-${zoneId}.json"`,
    },
  });
}
