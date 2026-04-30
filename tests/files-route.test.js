import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { GET, POST } from "@/app/api/files/route";
import { resetDbForTests } from "@/lib/db";

function configureWorkspace(t) {
  const baseDir = path.join(process.cwd(), ".test-tmp");
  fs.mkdirSync(baseDir, { recursive: true });
  const root = fs.mkdtempSync(path.join(baseDir, "ortegapoint-community-route-test-"));
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

test("POST saves uploaded files and GET returns inline content with the right headers", async (t) => {
  const root = configureWorkspace(t);
  const formData = new FormData();
  formData.set("currentPath", "__root__");
  formData.append("file", new File(["hello world"], "hello.txt", { type: "text/plain" }));

  const postResponse = await POST(new Request("http://localhost/api/files", { method: "POST", body: formData }));
  assert.equal(postResponse.status, 200);
  assert.deepEqual(await postResponse.json(), { ok: true, files: ["hello.txt"] });

  const storedFile = path.join(root, "storage", "hello.txt");
  assert.equal(fs.readFileSync(storedFile, "utf8"), "hello world");

  const getResponse = await GET(new Request("http://localhost/api/files?path=hello.txt&mode=inline"));
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.headers.get("Content-Type"), "text/plain; charset=utf-8");
  assert.match(getResponse.headers.get("Content-Disposition"), /^inline; filename="hello\.txt"$/);
  assert.equal(await getResponse.text(), "hello world");
});

test("POST rejects empty uploads", async () => {
  const formData = new FormData();
  formData.set("currentPath", "__root__");

  const response = await POST(new Request("http://localhost/api/files", { method: "POST", body: formData }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "File is required" });
});
