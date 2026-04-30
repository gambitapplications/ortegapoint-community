import { statfsSync } from "node:fs";
import { getBaseName, getParentPath } from "@/lib/path-utils";
import { getStorageRoot } from "@/lib/config";
import {
  ensureStorageRoot,
  getFilePreview,
  getFolderSnapshot,
  getFolderBreadcrumbs,
  getNodeMeta,
  getNote,
  listFolderContents,
  listFolderTree,
  listTrashed,
  searchEverything
} from "@/lib/store";

function readStorageStats() {
  try {
    const s = statfsSync(getStorageRoot());
    const free = Number(s.bavail) * Number(s.bsize);
    const total = Number(s.blocks) * Number(s.bsize);
    if (!total) return null;
    return { free, total, used: total - free, freePct: Math.round((free / total) * 100) };
  } catch {
    return null;
  }
}

export function loadHomeData({ currentPath = "", search = "", selectedType = "", selectedPath = "", selectedId = "", view = "" } = {}) {
  ensureStorageRoot();
  let tree = [];
  let contents = [];
  let breadcrumbs = [];
  let selectedItem = null;
  let searchResults = [];
  let currentFolder = null;

  try {
    tree = listFolderTree("", 1);
  } catch {
    tree = [];
  }

  try {
    contents = listFolderContents(currentPath);
    breadcrumbs = getFolderBreadcrumbs(currentPath);
    currentFolder = getFolderSnapshot(currentPath);
  } catch {
    contents = [];
    breadcrumbs = getFolderBreadcrumbs("");
    currentFolder = {
      path: "",
      name: "Home",
      itemCount: 0,
      folderCount: 0,
      fileCount: 0,
      noteCount: 0,
      items: []
    };
  }

  if (search) {
    searchResults = searchEverything(search);
  }

  try {
    if (selectedType === "note" && selectedId) {
      const note = getNote(selectedId);
      if (note) {
        selectedItem = {
          ...note,
          type: "note",
          folderName: getBaseName(note.folder_path),
          parentPath: getParentPath(note.folder_path)
        };
      }
    } else if (selectedType === "file" && selectedPath) {
      selectedItem = {
        ...getFilePreview(selectedPath),
        type: "file"
      };
    } else if (selectedType === "folder" && selectedPath !== undefined) {
      const node = getNodeMeta(selectedPath);
      selectedItem = {
        ...node,
        ...getFolderSnapshot(selectedPath)
      };
    }
  } catch {
    selectedItem = null;
  }

  let trashed = [];
  if (view === "trash") {
    try { trashed = listTrashed(); } catch { trashed = []; }
  }

  const storage = readStorageStats();

  return {
    tree,
    contents,
    breadcrumbs,
    currentPath,
    currentFolder,
    search,
    searchResults,
    selectedItem,
    view,
    trashed,
    storage
  };
}
