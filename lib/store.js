import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getDb } from "@/lib/db";
import { formatBytes, getMaxUploadBytes, getStorageRoot } from "@/lib/config";
import { getBaseName, getParentPath, joinDisplayPath } from "@/lib/path-utils";

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".json", ".js", ".ts", ".tsx", ".jsx", ".css", ".html"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".heic", ".heif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);
const MAX_TEXT_PREVIEW_LENGTH = 20000;
const MAX_TABLE_PREVIEW_ROWS = 20;
const MAX_TABLE_PREVIEW_COLUMNS = 12;

function nowIso() {
  return new Date().toISOString();
}

function normalizeFolderPath(folderPath = "") {
  const cleaned = folderPath.replace(/^\/+|\/+$/g, "");
  if (!cleaned) {
    return "";
  }

  const parts = cleaned.split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) {
    throw new Error("Invalid folder path");
  }

  return parts.join("/");
}

export function ensureStorageRoot() {
  const root = getStorageRoot();
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function resolveAbsolute(folderPath = "") {
  const root = ensureStorageRoot();
  const normalized = normalizeFolderPath(folderPath);
  const absolute = path.resolve(root, normalized);
  const relative = path.relative(path.resolve(root), absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path escaped storage root");
  }
  return absolute;
}

function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) {
    if (ext === ".svg") return "image/svg+xml";
    if (ext === ".heic") return "image/heic";
    if (ext === ".heif") return "image/heif";
    return `image/${ext.replace(".", "") === "jpg" ? "jpeg" : ext.replace(".", "")}`;
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return ext === ".mov" ? "video/quicktime" : `video/${ext.replace(".", "")}`;
  }
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".csv") return "text/csv";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".xls") return "application/vnd.ms-excel";
  if (ext === ".md" || ext === ".markdown" || ext === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function getPreviewKind(fileName, note = false) {
  if (note) return "note";
  const ext = path.extname(fileName).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (ext === ".pdf") return "pdf";
  if (ext === ".csv") return "csv";
  if (ext === ".xlsx") return "spreadsheet";
  if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  if (ext === ".xls") return "spreadsheet-fallback";
  return "download";
}

function sortItems(items) {
  return items.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function assertPathDoesNotExist(targetPath, message) {
  if (fs.existsSync(targetPath)) {
    throw new Error(message);
  }
}

function ensureValidFileName(name, label) {
  const trimmed = (name || "").trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error(`${label} cannot include path separators`);
  }
  return trimmed;
}

function ensureDirectoryExists(folderPath = "") {
  const absolute = resolveAbsolute(folderPath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    throw new Error("Destination folder does not exist");
  }
  return absolute;
}

function decodeXmlEntities(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function createUniqueNoteFileName(folderPath, baseName, ignoreId = "") {
  const db = getDb();
  const safeBase = (baseName || "note").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || "note";
  let attempt = 0;

  while (true) {
    const candidate = `${attempt === 0 ? safeBase : `${safeBase}-${attempt}`}.md`;
    const existing = db.prepare(`
      SELECT id
      FROM notes
      WHERE folder_path = ?
        AND file_name = ?
        AND deleted_at IS NULL
      LIMIT 1
    `).get(folderPath, candidate);
    if (!existing || existing.id === ignoreId) {
      return candidate;
    }
    attempt += 1;
  }
}

function parseDelimitedPreview(content, delimiter = ",") {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        value += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(value);
      value = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  const limitedRows = rows.slice(0, MAX_TABLE_PREVIEW_ROWS);
  const columnCount = limitedRows.reduce((max, current) => Math.max(max, current.length), 0);
  return {
    rows: limitedRows.map((current) => current.slice(0, MAX_TABLE_PREVIEW_COLUMNS)),
    truncated: rows.length > MAX_TABLE_PREVIEW_ROWS || columnCount > MAX_TABLE_PREVIEW_COLUMNS
  };
}

function getZipEntry(filePath, entryPath) {
  return execFileSync("unzip", ["-p", filePath, entryPath], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  });
}

function parseSharedStrings(sharedStringsXml = "") {
  const sharedStrings = [];
  const itemRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let itemMatch = itemRegex.exec(sharedStringsXml);
  while (itemMatch) {
    const textMatches = [...itemMatch[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)];
    sharedStrings.push(decodeXmlEntities(textMatches.map((match) => match[1]).join("")));
    itemMatch = itemRegex.exec(sharedStringsXml);
  }
  return sharedStrings;
}

function getFirstWorksheetMeta(filePath) {
  const workbookXml = getZipEntry(filePath, "xl/workbook.xml");
  const relsXml = getZipEntry(filePath, "xl/_rels/workbook.xml.rels");
  const sheetMatch = workbookXml.match(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/);
  if (!sheetMatch) {
    throw new Error("Workbook sheet metadata was not found");
  }

  const rels = {};
  const relationshipRegex = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
  let relationshipMatch = relationshipRegex.exec(relsXml);
  while (relationshipMatch) {
    rels[relationshipMatch[1]] = relationshipMatch[2];
    relationshipMatch = relationshipRegex.exec(relsXml);
  }

  const target = rels[sheetMatch[2]];
  if (!target) {
    throw new Error("Workbook relationship was not found");
  }

  const normalizedTarget = target.startsWith("/") ? target.slice(1) : path.posix.join("xl", target.replace(/^\.?\//, ""));
  return {
    sheetName: decodeXmlEntities(sheetMatch[1]),
    sheetPath: normalizedTarget
  };
}

function columnLabelToIndex(label = "") {
  return [...label].reduce((value, char) => (value * 26) + (char.charCodeAt(0) - 64), 0) - 1;
}

function extractWorksheetCells(sheetXml, sharedStrings) {
  const rows = new Map();
  const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
  let cellMatch = cellRegex.exec(sheetXml);

  while (cellMatch) {
    const attrs = cellMatch[1];
    const body = cellMatch[2];
    const refMatch = attrs.match(/\br="([A-Z]+)(\d+)"/);
    if (!refMatch) {
      cellMatch = cellRegex.exec(sheetXml);
      continue;
    }

    const colIndex = columnLabelToIndex(refMatch[1]);
    const rowIndex = Number(refMatch[2]) - 1;
    const typeMatch = attrs.match(/\bt="([^"]+)"/);
    const valueMatch = body.match(/<v>([\s\S]*?)<\/v>/);
    const inlineMatch = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);

    let value = "";
    if (typeMatch?.[1] === "s" && valueMatch) {
      value = sharedStrings[Number(valueMatch[1])] || "";
    } else if (typeMatch?.[1] === "inlineStr" && inlineMatch) {
      value = decodeXmlEntities(inlineMatch[1]);
    } else if (valueMatch) {
      value = decodeXmlEntities(valueMatch[1]);
    }

    if (rowIndex < MAX_TABLE_PREVIEW_ROWS && colIndex < MAX_TABLE_PREVIEW_COLUMNS) {
      if (!rows.has(rowIndex)) {
        rows.set(rowIndex, []);
      }
      rows.get(rowIndex)[colIndex] = value;
    }

    cellMatch = cellRegex.exec(sheetXml);
  }

  const materialized = [];
  for (let rowIndex = 0; rowIndex < MAX_TABLE_PREVIEW_ROWS; rowIndex += 1) {
    if (!rows.has(rowIndex)) {
      continue;
    }
    const row = rows.get(rowIndex);
    materialized.push(Array.from({ length: Math.min(Math.max(row.length, 1), MAX_TABLE_PREVIEW_COLUMNS) }, (_, colIndex) => row[colIndex] || ""));
  }
  return materialized;
}

function getSpreadsheetPreview(filePath) {
  try {
    const { sheetName, sheetPath } = getFirstWorksheetMeta(filePath);
    let sharedStrings = [];

    try {
      sharedStrings = parseSharedStrings(getZipEntry(filePath, "xl/sharedStrings.xml"));
    } catch {
      sharedStrings = [];
    }

    const sheetXml = getZipEntry(filePath, sheetPath);
    const rows = extractWorksheetCells(sheetXml, sharedStrings);
    return {
      sheetName,
      rows,
      truncated: /<row\b[^>]*r="2[1-9]"/.test(sheetXml) || /<c\b[^>]*r="[M-Z]/.test(sheetXml)
    };
  } catch {
    return null;
  }
}

export function listFolderTree(folderPath = "", maxDepth = 4, currentDepth = 0) {
  if (currentDepth >= maxDepth) {
    return [];
  }
  try {
    const absolute = resolveAbsolute(folderPath);
    const entries = fs.readdirSync(absolute, { withFileTypes: true });
    const folders = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => {
        const nextPath = normalizeFolderPath(path.posix.join(folderPath, entry.name));
        return {
          name: entry.name,
          path: nextPath,
          children: listFolderTree(nextPath, maxDepth, currentDepth + 1)
        };
      });

    return folders.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export function listFolderContents(folderPath = "") {
  const normalized = normalizeFolderPath(folderPath);
  const absolute = resolveAbsolute(normalized);
  const entries = fs.readdirSync(absolute, { withFileTypes: true }).filter((e) => !e.name.startsWith("."));
  const db = getDb();
  const noteRows = db.prepare(`
    SELECT id, title, file_name, updated_at, created_at, body
    FROM notes
    WHERE folder_path = ? AND deleted_at IS NULL
  `).all(normalized);

  const diskItems = entries.map((entry) => {
    const itemPath = normalizeFolderPath(path.posix.join(normalized, entry.name));
    if (entry.isDirectory()) {
      return {
        type: "folder",
        name: entry.name,
        path: itemPath,
        breadcrumbPath: joinDisplayPath(normalized, entry.name)
      };
    }

    const stats = fs.statSync(path.join(absolute, entry.name));
    return {
      type: "file",
      name: entry.name,
      path: itemPath,
      size: stats.size,
      updatedAt: stats.mtime.toISOString(),
      mimeType: getMimeType(entry.name),
      previewKind: getPreviewKind(entry.name),
      breadcrumbPath: joinDisplayPath(normalized, entry.name)
    };
  });

  const notes = noteRows.map((row) => ({
    id: row.id,
    type: "note",
    name: row.title,
    fileName: row.file_name,
    path: normalizeFolderPath(path.posix.join(normalized, row.file_name)),
    updatedAt: row.updated_at,
    previewKind: "note",
    breadcrumbPath: joinDisplayPath(normalized, row.title)
  }));

  return sortItems([...diskItems, ...notes]);
}

export function getFolderSnapshot(folderPath = "") {
  const normalized = normalizeFolderPath(folderPath);
  const contents = listFolderContents(normalized);
  const counts = {
    folder: 0,
    file: 0,
    note: 0
  };

  for (const item of contents) {
    counts[item.type] += 1;
  }

  return {
    path: normalized,
    name: getBaseName(normalized) || "Home",
    itemCount: contents.length,
    folderCount: counts.folder,
    fileCount: counts.file,
    noteCount: counts.note,
    items: contents.slice(0, 6)
  };
}

export function getFolderBreadcrumbs(folderPath = "") {
  const normalized = normalizeFolderPath(folderPath);
  const parts = normalized ? normalized.split("/") : [];
  const breadcrumbs = [{ name: "Home", path: "" }];
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    breadcrumbs.push({ name: part, path: current });
  }
  return breadcrumbs;
}

export function createFolder(parentPath, name) {
  const trimmedName = ensureValidFileName(name, "Folder name");
  const normalizedParent = normalizeFolderPath(parentPath);
  const target = resolveAbsolute(path.posix.join(normalizedParent, trimmedName));
  assertPathDoesNotExist(target, "A folder or file with that name already exists");
  fs.mkdirSync(target);
}

export async function saveUploadedStream(folderPath, fileName, webStream, sizeHint) {
  const normalizedFolder = normalizeFolderPath(folderPath);
  const cleanFileName = ensureValidFileName(fileName, "File name");
  const maxBytes = getMaxUploadBytes();

  if (typeof sizeHint === "number" && sizeHint > maxBytes) {
    throw new Error(`"${fileName}" is ${formatBytes(sizeHint)} — the limit is ${formatBytes(maxBytes)} per file`);
  }

  const relativePath = path.posix.join(normalizedFolder, cleanFileName);
  const targetFile = resolveAbsolute(relativePath);
  assertPathDoesNotExist(targetFile, "A file or folder with that name already exists");

  const parentDir = path.dirname(targetFile);
  fs.mkdirSync(parentDir, { recursive: true });

  const tempFile = `${targetFile}.part.${crypto.randomBytes(4).toString("hex")}`;
  let written = 0;
  let sizeExceeded = false;

  const source = Readable.fromWeb(webStream);
  const counter = new Readable({
    read() {}
  });

  source.on("data", (chunk) => {
    written += chunk.length;
    if (written > maxBytes && !sizeExceeded) {
      sizeExceeded = true;
      counter.destroy(new Error(`"${fileName}" exceeded the ${formatBytes(maxBytes)} limit`));
      source.destroy();
      return;
    }
    counter.push(chunk);
  });
  source.on("end", () => counter.push(null));
  source.on("error", (err) => counter.destroy(err));

  const sink = fs.createWriteStream(tempFile);
  try {
    await pipeline(counter, sink);
    fs.renameSync(tempFile, targetFile);
    return relativePath;
  } catch (err) {
    try { fs.unlinkSync(tempFile); } catch {}
    throw err;
  }
}

// Legacy buffered uploader — kept for compatibility with server actions that
// still accept a File. Uploads >~100 MB should use saveUploadedStream.
export async function saveUploadedFile(folderPath, file) {
  const normalizedFolder = normalizeFolderPath(folderPath);
  const cleanFileName = ensureValidFileName(file.name, "File name");
  const maxBytes = getMaxUploadBytes();
  if (typeof file.size === "number" && file.size > maxBytes) {
    throw new Error(`"${file.name}" is ${formatBytes(file.size)} — the limit is ${formatBytes(maxBytes)} per file`);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw new Error(`"${file.name}" is ${formatBytes(buffer.byteLength)} — the limit is ${formatBytes(maxBytes)} per file`);
  }
  const targetFile = resolveAbsolute(path.posix.join(normalizedFolder, cleanFileName));
  assertPathDoesNotExist(targetFile, "A file or folder with that name already exists");
  fs.writeFileSync(targetFile, buffer);
  return path.posix.join(normalizedFolder, cleanFileName);
}

export function createNote(folderPath, title, body = "") {
  const db = getDb();
  const normalizedFolder = normalizeFolderPath(folderPath);
  const cleanTitle = (title || "").trim();
  if (!cleanTitle) {
    throw new Error("Note title is required");
  }

  const id = crypto.randomUUID();
  const fileName = createUniqueNoteFileName(normalizedFolder, cleanTitle);
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO notes (id, folder_path, title, file_name, body, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, normalizedFolder, cleanTitle, fileName, body, timestamp, timestamp);

  return id;
}

export function getNote(id) {
  const db = getDb();
  return db.prepare(`
    SELECT id, folder_path, title, file_name, body, created_at, updated_at
    FROM notes
    WHERE id = ?
  `).get(id);
}

export function updateNote(id, title, body) {
  const db = getDb();
  const cleanTitle = (title || "").trim();
  if (!cleanTitle) {
    throw new Error("Note title is required");
  }
  const existing = getNote(id);
  if (!existing) {
    throw new Error("Note not found");
  }
  db.prepare(`
    UPDATE notes
    SET title = ?, body = ?, updated_at = ?
    WHERE id = ?
  `).run(cleanTitle, body || "", nowIso(), id);
}

const TRASH_DIRNAME = ".trash";

function getTrashRoot() {
  const trashRoot = path.join(getStorageRoot(), TRASH_DIRNAME);
  fs.mkdirSync(trashRoot, { recursive: true });
  return trashRoot;
}

function folderSize(absolute) {
  let total = 0;
  const stack = [absolute];
  while (stack.length) {
    const cur = stack.pop();
    const stat = fs.statSync(cur);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(cur)) stack.push(path.join(cur, entry));
    } else {
      total += stat.size;
    }
  }
  return total;
}

// Move an item to trash. Returns the trash record id.
export function trashItem(itemType, targetPath, id) {
  const normalizedPath = normalizeFolderPath(targetPath);
  const now = nowIso();
  const db = getDb();

  if (itemType === "note") {
    const note = getNote(id);
    if (!note) throw new Error("Note not found");
    const trashId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO trash (id, item_type, original_path, display_name, note_id, trashed_at)
      VALUES (?, 'note', ?, ?, ?, ?)
    `).run(trashId, note.folder_path, note.title, id, now);
    db.prepare("UPDATE notes SET deleted_at = ? WHERE id = ?").run(now, id);
    return trashId;
  }

  const absolute = resolveAbsolute(normalizedPath);
  if (!fs.existsSync(absolute)) throw new Error("Item not found");

  const stats = fs.statSync(absolute);
  const trashId = crypto.randomUUID();
  const trashRoot = getTrashRoot();
  const bucket = path.join(trashRoot, trashId);
  fs.mkdirSync(bucket, { recursive: true });
  const baseName = getBaseName(normalizedPath) || "item";
  const trashAbs = path.join(bucket, baseName);
  fs.renameSync(absolute, trashAbs);

  const trashRelative = path.posix.join(TRASH_DIRNAME, trashId, baseName);
  const sizeBytes = stats.isDirectory() ? folderSize(trashAbs) : stats.size;

  db.prepare(`
    INSERT INTO trash (id, item_type, original_path, display_name, trash_path, size_bytes, trashed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(trashId, stats.isDirectory() ? "folder" : "file", normalizedPath, baseName, trashRelative, sizeBytes, now);

  if (stats.isDirectory()) {
    const likePath = normalizedPath ? `${normalizedPath}/%` : "%";
    db.prepare(`
      UPDATE notes SET deleted_at = ?
      WHERE (folder_path = ? OR folder_path LIKE ?) AND deleted_at IS NULL
    `).run(now, normalizedPath, likePath);
  }

  return trashId;
}

export function listTrashed() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, item_type, original_path, display_name, trash_path, note_id, size_bytes, trashed_at
    FROM trash
    ORDER BY trashed_at DESC
  `).all();
  return rows.map((row) => ({
    id: row.id,
    type: "trashed",
    itemType: row.item_type,
    originalPath: row.original_path,
    name: row.display_name,
    trashPath: row.trash_path,
    noteId: row.note_id,
    size: row.size_bytes || 0,
    trashedAt: row.trashed_at
  }));
}

export function restoreTrashed(trashId) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM trash WHERE id = ?").get(trashId);
  if (!row) throw new Error("Trash record not found");

  const now = nowIso();

  if (row.item_type === "note") {
    const note = getNote(row.note_id);
    if (!note) {
      db.prepare("DELETE FROM trash WHERE id = ?").run(trashId);
      throw new Error("Original note no longer exists");
    }
    db.prepare("UPDATE notes SET deleted_at = NULL, updated_at = ? WHERE id = ?").run(now, row.note_id);
    db.prepare("DELETE FROM trash WHERE id = ?").run(trashId);
    return { type: "note", id: row.note_id, folderPath: row.original_path };
  }

  const trashAbs = path.join(getStorageRoot(), row.trash_path);
  if (!fs.existsSync(trashAbs)) {
    db.prepare("DELETE FROM trash WHERE id = ?").run(trashId);
    throw new Error("Trashed contents missing from disk");
  }

  const originalAbs = resolveAbsolute(row.original_path);
  fs.mkdirSync(path.dirname(originalAbs), { recursive: true });
  if (fs.existsSync(originalAbs)) {
    throw new Error(`Can't restore — something already exists at ${row.original_path}`);
  }
  fs.renameSync(trashAbs, originalAbs);
  try { fs.rmdirSync(path.dirname(trashAbs)); } catch {}

  if (row.item_type === "folder") {
    const likePath = row.original_path ? `${row.original_path}/%` : "%";
    db.prepare(`
      UPDATE notes SET deleted_at = NULL, updated_at = ?
      WHERE (folder_path = ? OR folder_path LIKE ?) AND deleted_at IS NOT NULL
    `).run(now, row.original_path, likePath);
  }

  db.prepare("DELETE FROM trash WHERE id = ?").run(trashId);
  return { type: row.item_type, path: row.original_path };
}

export function purgeTrashed(trashId) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM trash WHERE id = ?").get(trashId);
  if (!row) throw new Error("Trash record not found");

  if (row.item_type === "note") {
    db.prepare("DELETE FROM notes WHERE id = ?").run(row.note_id);
  } else if (row.trash_path) {
    const trashAbs = path.join(getStorageRoot(), row.trash_path);
    if (fs.existsSync(trashAbs)) {
      const stat = fs.statSync(trashAbs);
      if (stat.isDirectory()) fs.rmSync(trashAbs, { recursive: true, force: true });
      else fs.rmSync(trashAbs, { force: true });
    }
    const bucket = path.dirname(trashAbs);
    try { fs.rmdirSync(bucket); } catch {}

    if (row.item_type === "folder") {
      const likePath = row.original_path ? `${row.original_path}/%` : "%";
      db.prepare(`
        DELETE FROM notes
        WHERE (folder_path = ? OR folder_path LIKE ?) AND deleted_at IS NOT NULL
      `).run(row.original_path, likePath);
    }
  }

  db.prepare("DELETE FROM trash WHERE id = ?").run(trashId);
}

export function emptyTrash() {
  const rows = listTrashed();
  for (const row of rows) {
    try { purgeTrashed(row.id); } catch {}
  }
  return rows.length;
}

// Hard delete — kept for direct purge flows (not called from the normal UI
// delete action; that routes through trashItem).
export function deleteItem(itemType, targetPath, id) {
  const normalizedPath = normalizeFolderPath(targetPath);
  if (itemType === "note") {
    const db = getDb();
    db.prepare("DELETE FROM notes WHERE id = ?").run(id);
    return;
  }

  const absolute = resolveAbsolute(normalizedPath);
  if (!fs.existsSync(absolute)) return;

  const stats = fs.statSync(absolute);
  if (stats.isDirectory()) {
    fs.rmSync(absolute, { recursive: true, force: true });
    const db = getDb();
    const likePath = normalizedPath ? `${normalizedPath}/%` : "%";
    db.prepare(`
      DELETE FROM notes
      WHERE folder_path = ? OR folder_path LIKE ?
    `).run(normalizedPath, likePath);
    db.prepare("DELETE FROM file_rotations WHERE path LIKE ?").run(likePath);
  } else {
    fs.rmSync(absolute, { force: true });
    getDb().prepare("DELETE FROM file_rotations WHERE path = ?").run(normalizedPath);
  }
}

export function getDeleteTargetDetails(itemType, targetPath, id = "") {
  const normalizedPath = normalizeFolderPath(targetPath);

  if (itemType === "note") {
    const note = getNote(id);
    if (!note) {
      throw new Error("Note not found");
    }

    return {
      type: "note",
      label: note.title,
      requiresNameConfirmation: false
    };
  }

  const absolute = resolveAbsolute(normalizedPath);
  if (!fs.existsSync(absolute)) {
    throw new Error("Item not found");
  }

  const stats = fs.statSync(absolute);
  const resolvedType = stats.isDirectory() ? "folder" : "file";

  return {
    type: resolvedType,
    label: getBaseName(normalizedPath),
    requiresNameConfirmation: resolvedType === "folder"
  };
}

export function renameItem(itemType, targetPath, nextName, id) {
  const cleanName = ensureValidFileName(nextName, "New name");
  const normalizedPath = normalizeFolderPath(targetPath);

  if (itemType === "note") {
    const db = getDb();
    const existing = getNote(id);
    if (!existing) {
      throw new Error("Note not found");
    }
    db.prepare(`
      UPDATE notes
      SET title = ?, updated_at = ?
      WHERE id = ?
    `).run(cleanName, nowIso(), id);
    return;
  }

  const absolute = resolveAbsolute(normalizedPath);
  const parentPath = getParentPath(normalizedPath);
  const nextRelativePath = normalizeFolderPath(path.posix.join(parentPath, cleanName));
  const nextAbsolute = resolveAbsolute(nextRelativePath);
  assertPathDoesNotExist(nextAbsolute, "A file or folder with that name already exists");
  fs.renameSync(absolute, nextAbsolute);

  if (itemType === "file") {
    getDb().prepare("UPDATE file_rotations SET path = ? WHERE path = ?").run(nextRelativePath, normalizedPath);
  }

  if (itemType === "folder") {
    const db = getDb();
    const prefix = normalizedPath ? `${normalizedPath}/` : "";
    const nextPrefix = nextRelativePath ? `${nextRelativePath}/` : "";
    const rows = db.prepare(`
      SELECT id, folder_path
      FROM notes
      WHERE folder_path = ? OR folder_path LIKE ?
    `).all(normalizedPath, `${prefix}%`);

    const updateStatement = db.prepare(`
      UPDATE notes
      SET folder_path = ?
      WHERE id = ?
    `);

    for (const row of rows) {
      const updatedFolderPath = row.folder_path === normalizedPath
        ? nextRelativePath
        : row.folder_path.replace(prefix, nextPrefix);
      updateStatement.run(updatedFolderPath, row.id);
    }

    const rotationPrefix = normalizedPath ? `${normalizedPath}/` : "";
    const rotationNextPrefix = nextRelativePath ? `${nextRelativePath}/` : "";
    const rotationRows = db.prepare("SELECT path FROM file_rotations WHERE path LIKE ?").all(`${rotationPrefix}%`);
    const rotationUpdate = db.prepare("UPDATE file_rotations SET path = ? WHERE path = ?");
    for (const row of rotationRows) {
      rotationUpdate.run(row.path.replace(rotationPrefix, rotationNextPrefix), row.path);
    }
  }
}

export function moveItem(itemType, targetPath, destinationPath, id) {
  const normalizedTargetPath = normalizeFolderPath(targetPath);
  const normalizedDestinationPath = normalizeFolderPath(destinationPath);
  ensureDirectoryExists(normalizedDestinationPath);

  if (itemType === "note") {
    const db = getDb();
    const existing = getNote(id);
    if (!existing) {
      throw new Error("Note not found");
    }
    if (existing.folder_path === normalizedDestinationPath) {
      return;
    }

    const nextFileName = createUniqueNoteFileName(normalizedDestinationPath, existing.title, id);
    db.prepare(`
      UPDATE notes
      SET folder_path = ?, file_name = ?, updated_at = ?
      WHERE id = ?
    `).run(normalizedDestinationPath, nextFileName, nowIso(), id);
    return;
  }

  const absolute = resolveAbsolute(normalizedTargetPath);
  if (!fs.existsSync(absolute)) {
    throw new Error("Item not found");
  }

  const nextRelativePath = normalizeFolderPath(path.posix.join(normalizedDestinationPath, path.posix.basename(normalizedTargetPath)));
  if (normalizedTargetPath === nextRelativePath) {
    return;
  }

  if (itemType === "folder" && (normalizedDestinationPath === normalizedTargetPath || normalizedDestinationPath.startsWith(`${normalizedTargetPath}/`))) {
    throw new Error("A folder cannot be moved into itself");
  }

  const nextAbsolute = resolveAbsolute(nextRelativePath);
  assertPathDoesNotExist(nextAbsolute, "A file or folder with that name already exists in the destination");
  fs.renameSync(absolute, nextAbsolute);

  if (itemType === "file") {
    getDb().prepare("UPDATE file_rotations SET path = ? WHERE path = ?").run(nextRelativePath, normalizedTargetPath);
  }

  if (itemType === "folder") {
    const db = getDb();
    const prefix = normalizedTargetPath ? `${normalizedTargetPath}/` : "";
    const nextPrefix = nextRelativePath ? `${nextRelativePath}/` : "";
    const rows = db.prepare(`
      SELECT id, folder_path
      FROM notes
      WHERE folder_path = ? OR folder_path LIKE ?
    `).all(normalizedTargetPath, `${prefix}%`);
    const updateStatement = db.prepare(`
      UPDATE notes
      SET folder_path = ?
      WHERE id = ?
    `);

    for (const row of rows) {
      const updatedFolderPath = row.folder_path === normalizedTargetPath
        ? nextRelativePath
        : row.folder_path.replace(prefix, nextPrefix);
      updateStatement.run(updatedFolderPath, row.id);
    }

    const rotationRows = db.prepare("SELECT path FROM file_rotations WHERE path LIKE ?").all(`${prefix}%`);
    const rotationUpdate = db.prepare("UPDATE file_rotations SET path = ? WHERE path = ?");
    for (const row of rotationRows) {
      rotationUpdate.run(row.path.replace(prefix, nextPrefix), row.path);
    }
  }
}

export function batchMoveItems(items, destinationPath) {
  const moved = [];
  const failed = [];

  for (const item of items || []) {
    try {
      if (!item || typeof item !== "object") {
        throw new Error("Invalid item payload");
      }
      if (!["file", "folder", "note"].includes(item.type)) {
        throw new Error("Invalid item type");
      }
      if (typeof item.path !== "string") {
        throw new Error("Invalid item path");
      }
      if (item.type === "note" && typeof item.id !== "string") {
        throw new Error("Note id is required");
      }

      moveItem(item.type, item.path, destinationPath, item.id);
      moved.push(item);
    } catch (error) {
      failed.push({
        item,
        error: error instanceof Error ? error.message : "Move failed"
      });
    }
  }

  return { moved: moved.length, failed };
}

export function searchEverything(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    return [];
  }

  ensureStorageRoot();
  const results = [];

  function walk(folderPath = "") {
    const absolute = resolveAbsolute(folderPath);
    const entries = fs.readdirSync(absolute, { withFileTypes: true }).filter((e) => !e.name.startsWith("."));
    for (const entry of entries) {
      const relativePath = normalizeFolderPath(path.posix.join(folderPath, entry.name));
      const haystack = `${entry.name} ${relativePath}`.toLowerCase();
      if (haystack.includes(q)) {
        results.push({
          type: entry.isDirectory() ? "folder" : "file",
          name: entry.name,
          path: relativePath,
          breadcrumbPath: joinDisplayPath(getParentPath(relativePath), entry.name)
        });
      }
      if (entry.isDirectory()) {
        walk(relativePath);
      }
    }
  }

  walk("");

  const db = getDb();
  const noteRows = db.prepare(`
    SELECT id, title, body, folder_path, file_name
    FROM notes
    WHERE deleted_at IS NULL
  `).all();

  for (const row of noteRows) {
    const haystack = `${row.title} ${row.body} ${row.folder_path}`.toLowerCase();
    if (haystack.includes(q)) {
      results.push({
        id: row.id,
        type: "note",
        name: row.title,
        path: normalizeFolderPath(path.posix.join(row.folder_path, row.file_name)),
        folderPath: row.folder_path,
        breadcrumbPath: joinDisplayPath(row.folder_path, row.title)
      });
    }
  }

  return sortItems(results);
}

export function getFilePreview(targetPath) {
  const normalizedPath = normalizeFolderPath(targetPath);
  const absolute = resolveAbsolute(normalizedPath);
  const stats = fs.statSync(absolute);
  const previewKind = getPreviewKind(normalizedPath);
  const textContent = previewKind === "text" || previewKind === "markdown" || previewKind === "csv"
    ? fs.readFileSync(absolute, "utf8").slice(0, MAX_TEXT_PREVIEW_LENGTH)
    : null;
  const tablePreview = previewKind === "csv"
    ? parseDelimitedPreview(textContent || "")
    : previewKind === "spreadsheet"
      ? getSpreadsheetPreview(absolute)
      : null;

  return {
    name: path.basename(normalizedPath),
    path: normalizedPath,
    size: stats.size,
    updatedAt: stats.mtime.toISOString(),
    previewKind,
    mimeType: getMimeType(normalizedPath),
    content: textContent,
    tablePreview,
    rotation: getFileRotation(normalizedPath),
    downloadUrl: `/api/files?path=${encodeURIComponent(normalizedPath)}`
  };
}

export function getFileRotation(filePath) {
  if (!filePath) return 0;
  const db = getDb();
  const row = db.prepare("SELECT degrees FROM file_rotations WHERE path = ?").get(filePath);
  return row?.degrees || 0;
}

export function setFileRotation(filePath, degrees) {
  if (!filePath) return 0;
  const db = getDb();
  const normalized = ((Math.round(degrees) % 360) + 360) % 360;
  if (normalized === 0) {
    db.prepare("DELETE FROM file_rotations WHERE path = ?").run(filePath);
  } else {
    db.prepare(`
      INSERT INTO file_rotations (path, degrees) VALUES (?, ?)
      ON CONFLICT(path) DO UPDATE SET degrees = excluded.degrees
    `).run(filePath, normalized);
  }
  return normalized;
}

export function rotateFileBy(filePath, delta = 90) {
  return setFileRotation(filePath, getFileRotation(filePath) + delta);
}

export function getNodeMeta(itemPath) {
  const normalizedPath = normalizeFolderPath(itemPath);
  const absolute = resolveAbsolute(normalizedPath);
  const stats = fs.statSync(absolute);
  return {
    path: normalizedPath,
    name: path.basename(normalizedPath),
    type: stats.isDirectory() ? "folder" : "file"
  };
}
