import { NextResponse } from "next/server";
import { decodeRoutePath } from "@/lib/path-utils";
import { rotateFileBy } from "@/lib/store";

export async function POST(request) {
  try {
    const body = await request.json();
    const targetPath = decodeRoutePath(String(body.path || ""));
    const delta = Number.isFinite(Number(body.delta)) ? Number(body.delta) : 90;
    if (!targetPath) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }
    const degrees = rotateFileBy(targetPath, delta);
    return NextResponse.json({ ok: true, degrees });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Rotate failed" }, { status: 400 });
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
