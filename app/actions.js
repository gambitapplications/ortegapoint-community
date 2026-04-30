"use server";

import { redirect } from "next/navigation";
import { createFolder, createNote, deleteItem, emptyTrash, getDeleteTargetDetails, moveItem, purgeTrashed, renameItem, restoreTrashed, saveUploadedFile, trashItem, updateNote } from "@/lib/store";
import { decodeRoutePath, encodeRoutePath } from "@/lib/path-utils";

function readPath(formData) {
  return decodeRoutePath(String(formData.get("currentPath") || ""));
}

function readDestinationPath(formData) {
  const rawValue = String(formData.get("destinationPath") || "").trim();
  if (rawValue === "/" || rawValue === "__root__") {
    return "";
  }
  return decodeRoutePath(rawValue);
}

function buildRedirectUrl(currentPath, extra = {}) {
  const params = new URLSearchParams();
  if (currentPath) {
    params.set("path", currentPath);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something went wrong";
}

function rethrowRedirectError(error) {
  if (
    error &&
    typeof error === "object" &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  ) {
    throw error;
  }
}

export async function createFolderAction(formData) {
  const currentPath = readPath(formData);
  try {
    createFolder(currentPath, String(formData.get("name") || ""));
    redirect(buildRedirectUrl(currentPath));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectUrl(currentPath, { error: getErrorMessage(error) }));
  }
}

export async function uploadFileAction(formData) {
  const currentPath = readPath(formData);
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    redirect(buildRedirectUrl(currentPath, { error: "File is required" }));
  }
  try {
    await saveUploadedFile(currentPath, file);
    redirect(buildRedirectUrl(currentPath));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectUrl(currentPath, { error: getErrorMessage(error) }));
  }
}

export async function createNoteAction(formData) {
  const currentPath = readPath(formData);
  try {
    const noteId = createNote(
      currentPath,
      String(formData.get("title") || ""),
      String(formData.get("body") || "")
    );
    redirect(buildRedirectUrl(currentPath, { selectedType: "note", selectedId: noteId }));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectUrl(currentPath, { error: getErrorMessage(error) }));
  }
}

export async function updateNoteAction(formData) {
  const currentPath = readPath(formData);
  const noteId = String(formData.get("id") || "");
  try {
    updateNote(
      noteId,
      String(formData.get("title") || ""),
      String(formData.get("body") || "")
    );
    redirect(buildRedirectUrl(currentPath, { selectedType: "note", selectedId: noteId }));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectUrl(currentPath, { selectedType: "note", selectedId: noteId, error: getErrorMessage(error) }));
  }
}

export async function renameItemAction(formData) {
  const currentPath = readPath(formData);
  try {
    renameItem(
      String(formData.get("itemType") || ""),
      decodeRoutePath(String(formData.get("targetPath") || encodeRoutePath(""))),
      String(formData.get("nextName") || ""),
      String(formData.get("id") || "")
    );
    redirect(buildRedirectUrl(currentPath));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectUrl(currentPath, { error: getErrorMessage(error) }));
  }
}

export async function deleteItemAction(formData) {
  const currentPath = readPath(formData);
  try {
    const itemType = String(formData.get("itemType") || "");
    const targetPath = decodeRoutePath(String(formData.get("targetPath") || encodeRoutePath("")));
    const id = String(formData.get("id") || "");
    trashItem(itemType, targetPath, id);
    redirect(buildRedirectUrl(currentPath));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectUrl(currentPath, { error: getErrorMessage(error) }));
  }
}

export async function restoreTrashedAction(formData) {
  const currentPath = readPath(formData);
  try {
    const trashId = String(formData.get("trashId") || "");
    restoreTrashed(trashId);
    redirect(buildRedirectUrl(currentPath, { view: "trash" }));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectUrl(currentPath, { view: "trash", error: getErrorMessage(error) }));
  }
}

export async function purgeTrashedAction(formData) {
  const currentPath = readPath(formData);
  try {
    const trashId = String(formData.get("trashId") || "");
    purgeTrashed(trashId);
    redirect(buildRedirectUrl(currentPath, { view: "trash" }));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectUrl(currentPath, { view: "trash", error: getErrorMessage(error) }));
  }
}

export async function emptyTrashAction(formData) {
  const currentPath = readPath(formData);
  try {
    emptyTrash();
    redirect(buildRedirectUrl(currentPath, { view: "trash" }));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectUrl(currentPath, { view: "trash", error: getErrorMessage(error) }));
  }
}

export async function moveItemAction(formData) {
  const currentPath = readPath(formData);
  try {
    moveItem(
      String(formData.get("itemType") || ""),
      decodeRoutePath(String(formData.get("targetPath") || encodeRoutePath(""))),
      readDestinationPath(formData),
      String(formData.get("id") || "")
    );
    redirect(buildRedirectUrl(currentPath));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectUrl(currentPath, { error: getErrorMessage(error) }));
  }
}
