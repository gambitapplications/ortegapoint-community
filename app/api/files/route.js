import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { formatBytes, getMaxUploadBytes, getStorageRoot } from "@/lib/config";
import { decodeRoutePath } from "@/lib/path-utils";
import { getFilePreview, getFileRotation, saveUploadedFile, saveUploadedStream } from "@/lib/store";

const HEIC_EXTENSIONS = new Set([".heic", ".heif"]);
const JPEG_EXTENSIONS = new Set([".jpg", ".jpeg"]);
const ROTATABLE_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

async function processImageBuffer(absolute, name, ext, rotation) {
  const isHeic = HEIC_EXTENSIONS.has(ext);
  let buffer;
  if (isHeic) {
    const { default: heicConvert } = await import("heic-convert");
    buffer = Buffer.from(await heicConvert({
      buffer: fs.readFileSync(absolute),
      format: "JPEG",
      quality: 0.82
    }));
  } else {
    buffer = fs.readFileSync(absolute);
  }

  const { default: sharp } = await import("sharp");
  let pipeline = sharp(buffer).rotate();
  if (rotation) {
    pipeline = pipeline.rotate(rotation);
  }

  if (isHeic) {
    return {
      buffer: await pipeline.jpeg({ quality: 82 }).toBuffer(),
      mime: "image/jpeg",
      name: name.replace(/\.(heic|heif)$/i, ".jpg")
    };
  }
  if (ext === ".png") {
    return { buffer: await pipeline.png().toBuffer(), mime: "image/png", name };
  }
  if (ext === ".webp") {
    return { buffer: await pipeline.webp({ quality: 90 }).toBuffer(), mime: "image/webp", name };
  }
  return { buffer: await pipeline.jpeg({ quality: 92 }).toBuffer(), mime: "image/jpeg", name };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawPath = searchParams.get("path") || "";
  const mode = searchParams.get("mode") || "download";
  const targetPath = decodeRoutePath(rawPath);

  try {
    const preview = getFilePreview(targetPath);
    const absolute = path.resolve(getStorageRoot(), targetPath);
    const ext = path.extname(preview.name).toLowerCase();
    const rotation = getFileRotation(targetPath);
    const isHeic = HEIC_EXTENSIONS.has(ext);
    const isRotatable = ROTATABLE_IMAGE_EXTENSIONS.has(ext);

    // Process through sharp when:
    //  - HEIC + inline view (browsers can't render HEIC)
    //  - Any rotatable image with stored rotation (bake the rotation into pixels)
    //  - JPEG inline with EXIF orientation (already handled below with a fast-path)
    // HEIC download with rotation=0 falls through — serves the original HEIC bytes.
    const needsProcess = (isHeic && mode === "inline")
      || (isRotatable && rotation > 0)
      || (mode === "inline" && JPEG_EXTENSIONS.has(ext));

    if (needsProcess) {
      // Fast path: inline JPEG with no stored rotation and no EXIF rotation — serve raw.
      if (!isHeic && rotation === 0 && JPEG_EXTENSIONS.has(ext)) {
        const input = fs.readFileSync(absolute);
        const { default: sharp } = await import("sharp");
        const meta = await sharp(input).metadata();
        if (!meta.orientation || meta.orientation === 1) {
          return new NextResponse(input, {
            headers: {
              "Content-Type": preview.mimeType,
              "Content-Disposition": `inline; filename="${preview.name}"`
            }
          });
        }
      }

      const result = await processImageBuffer(absolute, preview.name, ext, rotation);
      return new NextResponse(result.buffer, {
        headers: {
          "Content-Type": result.mime,
          "Content-Disposition": `${mode === "inline" ? "inline" : "attachment"}; filename="${result.name}"`,
          "Cache-Control": "private, no-store"
        }
      });
    }

    const buffer = fs.readFileSync(absolute);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": preview.mimeType,
        "Content-Disposition": `${mode === "inline" ? "inline" : "attachment"}; filename="${preview.name}"`
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
}

// Streaming single-file upload. Client PUTs the raw bytes with ?path=... &name=...
// in the query string. Body is the file itself — never fully buffered in memory,
// so multi-GB uploads are safe.
export async function PUT(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawFolder = searchParams.get("path") || "";
    const rawName = searchParams.get("name") || "";
    if (!rawName) {
      return NextResponse.json({ error: "Missing file name" }, { status: 400 });
    }
    if (!request.body) {
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }

    const folderPath = decodeRoutePath(rawFolder);
    const maxBytes = getMaxUploadBytes();
    const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > 0 && contentLength > maxBytes) {
      return NextResponse.json({
        error: `File is ${formatBytes(contentLength)} — the limit is ${formatBytes(maxBytes)} per file`
      }, { status: 413 });
    }

    const savedPath = await saveUploadedStream(folderPath, rawName, request.body, contentLength || undefined);
    return NextResponse.json({ ok: true, file: savedPath });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Upload failed" }, { status: 400 });
  }
}

// Multipart upload kept for server-action fallback. Buffered — not for big files.
export async function POST(request) {
  try {
    const formData = await request.formData();
    const currentPath = decodeRoutePath(String(formData.get("currentPath") || ""));
    const uploads = formData.getAll("file");

    if (uploads.length === 0) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const saved = [];
    for (const upload of uploads) {
      if (!upload || typeof upload === "string") continue;
      const uploadedPath = await saveUploadedFile(currentPath, upload);
      saved.push(uploadedPath);
    }

    if (saved.length === 0) {
      return NextResponse.json({ error: "No valid files were uploaded" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, files: saved });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Upload failed" }, { status: 400 });
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
