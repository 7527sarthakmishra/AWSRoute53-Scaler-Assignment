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

  let bindContent = `$ORIGIN ${zone.name}\n$TTL 300\n; Zone export for ${zone.name}\n`;
  for (const r of records.items) {
    for (const val of r.values) {
      bindContent += `${r.name}\t${r.ttl}\tIN\t${r.type}\t${val}\n`;
    }
  }

  return new NextResponse(bindContent, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="hosted-zone-${zoneId}.zone"`,
    },
  });
}
