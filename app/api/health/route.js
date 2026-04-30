import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureStorageRoot } from "@/lib/store";

export async function GET() {
  try {
    ensureStorageRoot();
    getDb();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
