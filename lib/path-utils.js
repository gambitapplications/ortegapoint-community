import path from "node:path";

export const ROOT_SEGMENT = "__root__";

export function decodeRoutePath(rawPath) {
  if (!rawPath || rawPath === ROOT_SEGMENT) {
    return "";
  }

  const decoded = decodeURIComponent(rawPath);
  const normalized = decoded.replace(/^\/+|\/+$/g, "");

  if (!normalized) {
    return "";
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) {
    throw new Error("Invalid path");
  }

  return parts.join("/");
}

export function encodeRoutePath(folderPath) {
  return folderPath ? encodeURIComponent(folderPath) : ROOT_SEGMENT;
}

export function joinDisplayPath(folderPath, name = "") {
  const combined = [folderPath, name].filter(Boolean).join("/");
  return combined ? `/${combined}` : "/";
}

export function getParentPath(folderPath) {
  if (!folderPath) {
    return "";
  }

  const parts = folderPath.split("/");
  parts.pop();
  return parts.join("/");
}

export function getBaseName(folderPath) {
  if (!folderPath) {
    return "";
  }

  return path.posix.basename(folderPath);
}
