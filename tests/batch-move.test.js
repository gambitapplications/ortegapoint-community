import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { POST } from "@/app/api/files/batch-move/route";
import { resetDbForTests } from "@/lib/db";
import { createFolder, createNote, getNote, saveUploadedFile } from "@/lib/store";

function configureWorkspace(t) {
  const baseDir = path.join(process.cwd(), ".test-tmp");
  fs.mkdirSync(baseDir, { recursive: true });
  const root = fs.mkdtempSync(path.join(baseDir, "ortegapoint-community-batch-move-test-"));
  process.env.ORTEGA_DATA_DIR = path.join(root, "data");
  process.env.ORTEGA_STORAGE_ROOT = path.join(root, "storage");
  resetDbForTests();

  t.after(() => {
    resetDbForTests();
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env.ORTEGA_DATA_DIR;
    delete process.env.ORTEGA_STORAGE_ROOT;
  });

  return root;
}

function batchMoveRequest(payload) {
  return new Request("http://localhost/api/files/batch-move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function upload(name, content = "content") {
  return new File([content], name, { type: "text/plain" });
}

test("POST batch-moves multiple files to the destination folder", async (t) => {
  const root = configureWorkspace(t);
  createFolder("", "Source");
  createFolder("", "Archive");
  await saveUploadedFile("Source", upload("one.txt", "one"));
  await saveUploadedFile("Source", upload("two.txt", "two"));

  const response = await POST(batchMoveRequest({
    items: [
      { type: "file", path: "Source/one.txt" },
      { type: "file", path: "Source/two.txt" }
    ],
    destination: "Archive"
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, moved: 2, failed: [] });
  assert.equal(fs.readFileSync(path.join(root, "storage", "Archive", "one.txt"), "utf8"), "one");
  assert.equal(fs.readFileSync(path.join(root, "storage", "Archive", "two.txt"), "utf8"), "two");
  assert.equal(fs.existsSync(path.join(root, "storage", "Source", "one.txt")), false);
});

test("POST batch-moves a file, folder, and note together", async (t) => {
  const root = configureWorkspace(t);
  createFolder("", "Source");
  createFolder("", "Archive");
  createFolder("Source", "Nested");
  await saveUploadedFile("Source", upload("brief.txt", "brief"));
  await saveUploadedFile("Source/Nested", upload("inside.txt", "inside"));
  const noteId = createNote("Source", "Launch Notes", "move me");

  const response = await POST(batchMoveRequest({
    items: [
      { type: "file", path: "Source/brief.txt" },
      { type: "folder", path: "Source/Nested" },
      { type: "note", path: "Source/Launch-Notes.md", id: noteId }
    ],
    destination: "Archive"
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, moved: 3, failed: [] });
  assert.equal(fs.readFileSync(path.join(root, "storage", "Archive", "brief.txt"), "utf8"), "brief");
  assert.equal(fs.readFileSync(path.join(root, "storage", "Archive", "Nested", "inside.txt"), "utf8"), "inside");
  assert.equal(getNote(noteId).folder_path, "Archive");
});

test("POST reports partial failures while moving valid items", async (t) => {
  const root = configureWorkspace(t);
  createFolder("", "Source");
  createFolder("", "Archive");
  await saveUploadedFile("Source", upload("valid.txt", "valid"));

  const response = await POST(batchMoveRequest({
    items: [
      { type: "file", path: "Source/missing.txt" },
      { type: "file", path: "Source/valid.txt" }
    ],
    destination: "Archive"
  }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.moved, 1);
  assert.equal(body.failed.length, 1);
  assert.deepEqual(body.failed[0].item, { type: "file", path: "Source/missing.txt", id: "" });
  assert.match(body.failed[0].error, /not found/i);
  assert.equal(fs.readFileSync(path.join(root, "storage", "Archive", "valid.txt"), "utf8"), "valid");
});
