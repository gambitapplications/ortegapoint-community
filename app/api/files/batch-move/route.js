import { NextResponse } from "next/server";
import { decodeRoutePath } from "@/lib/path-utils";
import { batchMoveItems } from "@/lib/store";

const ITEM_TYPES = new Set(["file", "folder", "note"]);

function normalizePayloadItem(item) {
  if (!item || typeof item !== "object") {
    throw new Error("Each item must be an object");
  }
  if (!ITEM_TYPES.has(item.type)) {
    throw new Error("Each item needs a valid type");
  }
  if (typeof item.path !== "string") {
    throw new Error("Each item needs a path");
  }
  if (item.type === "note" && typeof item.id !== "string") {
    throw new Error("Notes need an id");
  }

  return {
    type: item.type,
    path: decodeRoutePath(item.path),
    id: item.id || ""
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || !Array.isArray(body.items)) {
      return NextResponse.json({ error: "items must be an array" }, { status: 400 });
    }
    if (typeof body.destination !== "string") {
      return NextResponse.json({ error: "destination must be a string" }, { status: 400 });
    }

    const items = body.items.map(normalizePayloadItem);
    const destination = decodeRoutePath(body.destination);
    const result = batchMoveItems(items, destination);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Invalid batch move request" }, { status: 400 });
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
