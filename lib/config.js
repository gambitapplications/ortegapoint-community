import path from "node:path";

export function getStorageRoot() {
  return process.env.ORTEGA_STORAGE_ROOT || path.join(process.cwd(), "data", "storage");
}

export function getDataDir() {
  return process.env.ORTEGA_DATA_DIR || path.join(process.cwd(), "data");
}

export function getMaxUploadBytes() {
  const mb = Number.parseInt(process.env.ORTEGA_MAX_UPLOAD_MB || "500", 10);
  if (!Number.isFinite(mb) || mb <= 0) return 500 * 1024 * 1024;
  return mb * 1024 * 1024;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n >= 10 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}
