import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { resetDbForTests } from "@/lib/db";
import {
  createFolder,
  createNote,
  deleteItem,
  getDeleteTargetDetails,
  getFilePreview,
  getFolderSnapshot,
  getNote,
  listFolderContents,
  moveItem,
  renameItem,
  saveUploadedFile,
  searchEverything
} from "@/lib/store";

function makeWorkspace() {
  const baseDir = path.join(process.cwd(), ".test-tmp");
  fs.mkdirSync(baseDir, { recursive: true });
  return fs.mkdtempSync(path.join(baseDir, "ortegapoint-community-test-"));
}

function configureWorkspace(t) {
  const root = makeWorkspace();
  const dataDir = path.join(root, "data");
  const storageRoot = path.join(root, "storage");

  process.env.ORTEGA_DATA_DIR = dataDir;
  process.env.ORTEGA_STORAGE_ROOT = storageRoot;
  resetDbForTests();

  t.after(() => {
    resetDbForTests();
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env.ORTEGA_DATA_DIR;
    delete process.env.ORTEGA_STORAGE_ROOT;
  });

  return { root, dataDir, storageRoot };
}

async function makeUpload(name, content, type = "text/plain") {
  return new File([content], name, { type });
}

test("folder, file, and note flows stay consistent across rename, move, and delete", async (t) => {
  configureWorkspace(t);

  createFolder("", "Clients");
  createFolder("Clients", "Acme");

  await saveUploadedFile("Clients/Acme", await makeUpload("brief.txt", "Acme launch brief"));
  const noteId = createNote("Clients/Acme", "Launch Notes", "critical regression coverage");

  const initialContents = listFolderContents("Clients/Acme");
  assert.deepEqual(
    initialContents.map((item) => [item.type, item.name]),
    [
      ["file", "brief.txt"],
      ["note", "Launch Notes"]
    ]
  );

  renameItem("folder", "Clients/Acme", "Acme-2026");
  const noteAfterFolderRename = getNote(noteId);
  assert.equal(noteAfterFolderRename.folder_path, "Clients/Acme-2026");

  createFolder("", "Archive");
  moveItem("folder", "Clients/Acme-2026", "Archive");
  const noteAfterMove = getNote(noteId);
  assert.equal(noteAfterMove.folder_path, "Archive/Acme-2026");

  renameItem("note", "Archive/Acme-2026/Launch-Notes.md", "Launch Notes Revised", noteId);
  assert.equal(getNote(noteId).title, "Launch Notes Revised");

  deleteItem("folder", "Archive/Acme-2026");
  assert.equal(getNote(noteId), undefined);
  assert.equal(fs.existsSync(path.join(process.env.ORTEGA_STORAGE_ROOT, "Archive", "Acme-2026")), false);
});

test("search finds folders, files, and note body content", async (t) => {
  configureWorkspace(t);

  createFolder("", "Reference");
  createFolder("Reference", "Invoices");
  await saveUploadedFile("Reference/Invoices", await makeUpload("q1-summary.txt", "invoice packet"));
  const noteId = createNote("Reference", "Meeting Log", "Acme mentioned Beta escrow on the call");

  const noteResults = searchEverything("acme");
  assert.equal(noteResults.length, 1);
  assert.equal(noteResults[0].type, "note");
  assert.equal(noteResults[0].id, noteId);
  assert.equal(noteResults[0].breadcrumbPath, "/Reference/Meeting Log");

  const folderResults = searchEverything("invoice");
  assert.equal(folderResults.some((item) => item.type === "folder" && item.path === "Reference/Invoices"), true);

  const fileResults = searchEverything("summary");
  assert.equal(fileResults.some((item) => item.type === "file" && item.path === "Reference/Invoices/q1-summary.txt"), true);
});

test("file preview parses csv tables and preserves download metadata", async (t) => {
  configureWorkspace(t);

  createFolder("", "Imports");
  await saveUploadedFile(
    "Imports",
    await makeUpload("report.csv", 'name,amount\nAcme,42\n"Escrow, Inc.",99', "text/csv")
  );

  const preview = getFilePreview("Imports/report.csv");
  assert.equal(preview.previewKind, "csv");
  assert.equal(preview.mimeType, "text/csv");
  assert.equal(preview.downloadUrl, "/api/files?path=Imports%2Freport.csv");
  assert.deepEqual(preview.tablePreview.rows, [
    ["name", "amount"],
    ["Acme", "42"],
    ["Escrow, Inc.", "99"]
  ]);
});

test("folder snapshot reports counts and a compact contents preview", async (t) => {
  configureWorkspace(t);

  createFolder("", "Clients");
  createFolder("Clients", "Acme");
  await saveUploadedFile("Clients", await makeUpload("brief.txt", "Acme launch brief"));
  createNote("Clients", "Daily Notes", "handoff items");

  const snapshot = getFolderSnapshot("Clients");
  assert.equal(snapshot.name, "Clients");
  assert.equal(snapshot.itemCount, 3);
  assert.equal(snapshot.folderCount, 1);
  assert.equal(snapshot.fileCount, 1);
  assert.equal(snapshot.noteCount, 1);
  assert.deepEqual(
    snapshot.items.map((item) => [item.type, item.name]),
    [
      ["folder", "Acme"],
      ["file", "brief.txt"],
      ["note", "Daily Notes"]
    ]
  );
});

test("delete target details require stronger confirmation for folders", async (t) => {
  configureWorkspace(t);

  createFolder("", "Clients");
  await saveUploadedFile("Clients", await makeUpload("brief.txt", "Acme launch brief"));
  const noteId = createNote("Clients", "Daily Notes", "handoff items");

  assert.deepEqual(getDeleteTargetDetails("folder", "Clients"), {
    type: "folder",
    label: "Clients",
    requiresNameConfirmation: true
  });

  assert.deepEqual(getDeleteTargetDetails("file", "Clients/brief.txt"), {
    type: "file",
    label: "brief.txt",
    requiresNameConfirmation: false
  });

  assert.deepEqual(getDeleteTargetDetails("note", "Clients/Daily-Notes.md", noteId), {
    type: "note",
    label: "Daily Notes",
    requiresNameConfirmation: false
  });
});
