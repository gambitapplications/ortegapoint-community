"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createFolderAction,
  createNoteAction,
  deleteItemAction,
  moveItemAction,
  renameItemAction
} from "@/app/actions";
import { IconCompass, IconDownload, IconEdit, IconFolder, IconHome, IconMove, IconNote, IconPlus, IconSearch, IconTrash, IconUpload } from "@/app/icons";

const MOVE_TRANSFER_TYPE = "application/x-ortegapoint-community-items";

function formatBytes(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n >= 10 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

function fuzzy(q, text) {
  if (!q) return { score: 0, positions: [] };
  const s = text.toLowerCase();
  const needle = q.toLowerCase();
  let si = 0;
  let score = 0;
  const positions = [];
  for (let i = 0; i < needle.length; i += 1) {
    const ch = needle[i];
    const found = s.indexOf(ch, si);
    if (found === -1) return null;
    score += found - si;
    positions.push(found);
    si = found + 1;
  }
  if (s.startsWith(needle)) score -= 50;
  else if (s.includes(needle)) score -= 20;
  return { score, positions };
}

function folderPathFor(item) {
  if (item.kind === "folder") return item.path || "";
  if (item.kind === "note") return item.path || "";
  const parts = (item.path || "").split("/");
  parts.pop();
  return parts.join("/");
}

function itemHref(item) {
  const folder = folderPathFor(item);
  if (item.kind === "folder") return `/?path=${encodeURIComponent(item.path)}&selectedType=folder&selectedPath=${encodeURIComponent(item.path)}`;
  if (item.kind === "note") return `/?path=${encodeURIComponent(folder)}&selectedType=note&selectedId=${encodeURIComponent(item.id)}`;
  return `/?path=${encodeURIComponent(folder)}&selectedType=file&selectedPath=${encodeURIComponent(item.path)}`;
}

function itemFromRow(row) {
  return {
    type: row.getAttribute("data-item-type") || "",
    path: row.getAttribute("data-item-path") || "",
    id: row.getAttribute("data-item-id") || ""
  };
}

function parentPathFor(item) {
  if (item.type === "folder") {
    const parts = (item.path || "").split("/").filter(Boolean);
    parts.pop();
    return parts.join("/");
  }
  if (item.type === "note" || item.type === "file") {
    const parts = (item.path || "").split("/").filter(Boolean);
    parts.pop();
    return parts.join("/");
  }
  return "";
}

function isTypingTarget(target) {
  const tag = (target && target.tagName) || "";
  return ["INPUT", "TEXTAREA", "SELECT"].includes(tag) || (target && target.isContentEditable);
}

function dedupeDescendants(items) {
  const folders = items.filter((item) => item.type === "folder" && item.path);
  return items.filter((item) => {
    return !folders.some((folder) => {
      if (folder.path === item.path && folder.type === item.type) return false;
      return item.path === folder.path || item.path.startsWith(`${folder.path}/`);
    });
  });
}

export default function WorkspaceClient({ currentPath, items }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIdx, setPaletteIdx] = useState(0);

  const [dialog, setDialog] = useState(null);
  const [context, setContext] = useState(null);
  const [newMenu, setNewMenu] = useState(null);
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadState, setUploadState] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [marquee, setMarquee] = useState(null);

  const fileInputRef = useRef(null);
  const paletteInputRef = useRef(null);
  const selectedKeysRef = useRef(selectedKeys);
  const marqueeDraggedRef = useRef(false);
  const rowSweepRef = useRef(null);
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    selectedKeysRef.current = selectedKeys;
    document.querySelectorAll("[data-row-key]").forEach((row) => {
      row.classList.toggle("row-selected", selectedKeys.has(row.getAttribute("data-row-key")));
    });
  }, [selectedKeys]);

  useEffect(() => {
    const next = new Set();
    document.querySelectorAll("[data-row-key].selected").forEach((row) => {
      const key = row.getAttribute("data-row-key");
      if (key) next.add(key);
    });
    setSelectedKeys(next);
  }, [currentPath]);

  const selectKeys = useCallback((keys) => {
    setSelectedKeys(new Set(keys));
  }, []);

  const toggleKey = useCallback((key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const getSelectedItems = useCallback(() => {
    return Array.from(document.querySelectorAll("[data-row-key]"))
      .filter((row) => selectedKeysRef.current.has(row.getAttribute("data-row-key")))
      .map(itemFromRow)
      .filter((item) => ["file", "folder", "note"].includes(item.type));
  }, []);

  const openPalette = useCallback(() => { setPaletteOpen(true); setPaletteQuery(""); setPaletteIdx(0); }, []);
  const closeOverlays = useCallback(() => { setPaletteOpen(false); setDialog(null); setContext(null); setNewMenu(null); }, []);

  const triggerUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const uploadFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (files.length === 0) return;

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      setUploadMsg("");
      setUploadState({ name: file.name, index: i + 1, total: files.length, pct: 0, size: file.size });

      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const qs = new URLSearchParams({
            path: currentPath || "__root__",
            name: file.name
          });
          xhr.open("PUT", `/api/files?${qs.toString()}`);
          xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
          xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadState((s) => (s ? { ...s, pct, loaded: e.loaded } : s));
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) return resolve();
            let msg = `Upload failed (${xhr.status})`;
            try {
              const parsed = JSON.parse(xhr.responseText);
              if (parsed?.error) msg = parsed.error;
            } catch {}
            reject(new Error(msg));
          };
          xhr.onerror = () => reject(new Error("Network error during upload"));
          xhr.onabort = () => reject(new Error("Upload cancelled"));
          xhr.send(file);
        });
      } catch (err) {
        setUploadState(null);
        setUploadMsg(err.message || "Upload failed");
        setTimeout(() => setUploadMsg(""), 6000);
        return;
      }

      // Refresh after each file lands so batch uploads populate the list
      // incrementally instead of all appearing at the end.
      startTransition(() => router.refresh());
    }

    setUploadState(null);
    setUploadMsg(files.length === 1 ? `Uploaded ${files[0].name}` : `Uploaded ${files.length} files`);
    setTimeout(() => setUploadMsg(""), 3500);
  }, [currentPath, router, startTransition]);

  // -------- palette filtering --------

  const commandActions = useMemo(() => [
    { id: "act:new-folder", label: "New folder", hint: "F", icon: IconFolder, run: () => setDialog({ kind: "new-folder" }) },
    { id: "act:new-note", label: "New note", hint: "N", icon: IconNote, run: () => setDialog({ kind: "new-note" }) },
    { id: "act:upload", label: "Upload file…", hint: "U", icon: IconUpload, run: () => triggerUpload() },
    { id: "act:home", label: "Go to Home", hint: "", icon: IconHome, run: () => router.push("/") }
  ], [router, triggerUpload]);

  const paletteResults = useMemo(() => {
    const q = paletteQuery.trim();
    if (!q) {
      return {
        actions: commandActions,
        matches: items.slice(0, 20)
      };
    }
    const scoredActions = commandActions
      .map((a) => ({ a, m: fuzzy(q, a.label) }))
      .filter((r) => r.m)
      .sort((a, b) => a.m.score - b.m.score)
      .map((r) => r.a);
    const scoredItems = items
      .map((it) => ({ it, m: fuzzy(q, it.name) }))
      .filter((r) => r.m)
      .sort((a, b) => a.m.score - b.m.score)
      .slice(0, 30)
      .map((r) => r.it);
    return { actions: scoredActions, matches: scoredItems };
  }, [paletteQuery, commandActions, items]);

  const flatPalette = useMemo(() => [
    ...paletteResults.actions.map((a) => ({ kind: "action", ref: a })),
    ...paletteResults.matches.map((it) => ({ kind: "item", ref: it }))
  ], [paletteResults]);

  useEffect(() => { setPaletteIdx(0); }, [paletteQuery]);

  // -------- global keyboard --------

  useEffect(() => {
    function onKey(e) {
      const target = e.target;
      const tag = (target && target.tagName) || "";
      const typing = isTypingTarget(target);

      // Cmd/Ctrl+K anywhere
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (paletteOpen) closeOverlays();
        else openPalette();
        return;
      }

      // Cmd+Enter saves note if inside textarea
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && tag === "TEXTAREA") {
        const form = target.closest("form");
        if (form) { e.preventDefault(); form.requestSubmit(); return; }
      }

      if (e.key === "Escape") {
        if (paletteOpen || dialog || context) { e.preventDefault(); closeOverlays(); return; }
        if (!typing && selectedKeysRef.current.size > 0) { e.preventDefault(); clearSelection(); return; }
      }

      if (typing) return;

      if (e.key === "/") { e.preventDefault(); document.querySelector("[data-search-input]")?.focus(); return; }
      if (e.key.toLowerCase() === "n") { e.preventDefault(); setDialog({ kind: "new-note" }); return; }
      if (e.key.toLowerCase() === "f") { e.preventDefault(); setDialog({ kind: "new-folder" }); return; }
      if (e.key.toLowerCase() === "u") { e.preventDefault(); triggerUpload(); return; }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const rows = Array.from(document.querySelectorAll("[data-row]"));
        if (rows.length === 0) return;
        e.preventDefault();
        const selectedEl = document.querySelector("[data-row].selected");
        const currentIdx = selectedEl ? rows.indexOf(selectedEl) : -1;
        const next = e.key === "ArrowDown"
          ? (currentIdx + 1 + rows.length) % rows.length
          : (currentIdx - 1 + rows.length) % rows.length;
        const href = rows[next].getAttribute("data-href");
        if (href) router.push(href);
        rows[next].scrollIntoView({ block: "nearest" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, dialog, context, clearSelection, closeOverlays, openPalette, router, triggerUpload]);

  // -------- header action buttons --------

  useEffect(() => {
    function onClick(e) {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      if (action === "new-folder") setDialog({ kind: "new-folder" });
      else if (action === "new-note") setDialog({ kind: "new-note" });
      else if (action === "upload") triggerUpload();
      else if (action === "palette") openPalette();
      else if (action === "new-menu") {
        const rect = btn.getBoundingClientRect();
        setNewMenu((prev) => prev ? null : { top: rect.bottom + 6, left: rect.left });
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [openPalette, triggerUpload]);

  useEffect(() => {
    let counter = 0;
    function hasFiles(e) {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      return Array.from(types).includes("Files");
    }
    function onDragEnter(e) {
      if (!hasFiles(e)) return;
      counter += 1;
      setIsDragging(true);
    }
    function onDragOver(e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }
    function onDragLeave(e) {
      if (!hasFiles(e)) return;
      counter -= 1;
      if (counter <= 0) { counter = 0; setIsDragging(false); }
    }
    function onDrop(e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      counter = 0;
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) uploadFiles(files);
    }
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [uploadFiles]);

  // -------- marquee selection and row clicks --------

  useEffect(() => {
    function onClick(e) {
      if (suppressNextClickRef.current) {
        e.preventDefault();
        e.stopPropagation();
        suppressNextClickRef.current = false;
        return;
      }

      const row = e.target.closest("[data-row-key]");
      const list = e.target.closest("[data-list-scroll]");

      if (row) {
        const key = row.getAttribute("data-row-key");
        if (!key) return;
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          e.preventDefault();
          toggleKey(key);
        } else {
          selectKeys([key]);
        }
        return;
      }

      if (list && !e.shiftKey && !e.metaKey && !e.ctrlKey && !marqueeDraggedRef.current) {
        clearSelection();
      }
      marqueeDraggedRef.current = false;
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [clearSelection, selectKeys, toggleKey]);

  useEffect(() => {
    function onMouseDown(e) {
      if (e.button !== 0) return;
      if (isTypingTarget(e.target)) return;
      const list = e.target.closest("[data-list-scroll]");
      if (!list || list.getAttribute("data-trash-view") === "true") return;
      const startRow = e.target.closest("[data-row-key]");

      if (startRow) {
        const startKey = startRow.getAttribute("data-row-key");
        if (!startKey) return;

        rowSweepRef.current = {
          baseSelection: (e.shiftKey || e.metaKey || e.ctrlKey) ? new Set(selectedKeysRef.current) : new Set(),
          committed: false,
          list,
          startKey,
          startX: e.clientX,
          startY: e.clientY
        };

        function selectRowsThrough(currentEvent) {
          const sweep = rowSweepRef.current;
          if (!sweep) return;

          const nextSelection = new Set(sweep.baseSelection);
          const top = Math.min(sweep.startY, currentEvent.clientY);
          const bottom = Math.max(sweep.startY, currentEvent.clientY);
          nextSelection.add(sweep.startKey);

          sweep.list.querySelectorAll("[data-row-key]").forEach((row) => {
            const rect = row.getBoundingClientRect();
            const intersects = rect.top <= bottom && rect.bottom >= top;
            if (intersects) nextSelection.add(row.getAttribute("data-row-key"));
          });

          setSelectedKeys(nextSelection);
        }

        function onRowSweepMove(moveEvent) {
          const sweep = rowSweepRef.current;
          if (!sweep) return;
          const dx = Math.abs(moveEvent.clientX - sweep.startX);
          const dy = Math.abs(moveEvent.clientY - sweep.startY);

          if (!sweep.committed) {
            if (dy < 8 || dy < dx * 1.2) return;
            sweep.committed = true;
            marqueeDraggedRef.current = true;
            suppressNextClickRef.current = true;
            document.body.classList.add("row-sweep-active");
          }

          moveEvent.preventDefault();
          selectRowsThrough(moveEvent);
        }

        function onRowSweepUp() {
          const sweep = rowSweepRef.current;
          window.removeEventListener("mousemove", onRowSweepMove);
          window.removeEventListener("mouseup", onRowSweepUp);
          document.body.classList.remove("row-sweep-active");
          rowSweepRef.current = null;
          if (!sweep?.committed) suppressNextClickRef.current = false;
        }

        window.addEventListener("mousemove", onRowSweepMove);
        window.addEventListener("mouseup", onRowSweepUp);
        return;
      }

      const start = { x: e.clientX, y: e.clientY };
      const baseSelection = e.shiftKey ? new Set(selectedKeysRef.current) : new Set();
      let moved = false;

      function updateMarquee(currentEvent) {
        const dx = Math.abs(currentEvent.clientX - start.x);
        const dy = Math.abs(currentEvent.clientY - start.y);
        if (dx < 3 && dy < 3) return;

        moved = true;
        marqueeDraggedRef.current = true;
        const left = Math.min(start.x, currentEvent.clientX);
        const top = Math.min(start.y, currentEvent.clientY);
        const right = Math.max(start.x, currentEvent.clientX);
        const bottom = Math.max(start.y, currentEvent.clientY);
        const hitKeys = new Set(baseSelection);

        list.querySelectorAll("[data-row-key]").forEach((row) => {
          const rect = row.getBoundingClientRect();
          const intersects = rect.left <= right && rect.right >= left && rect.top <= bottom && rect.bottom >= top;
          if (intersects) hitKeys.add(row.getAttribute("data-row-key"));
        });

        setSelectedKeys(hitKeys);
        setMarquee({
          left,
          top,
          width: right - left,
          height: bottom - top
        });
      }

      function onMouseMove(moveEvent) {
        moveEvent.preventDefault();
        updateMarquee(moveEvent);
      }

      function onMouseUp() {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        setMarquee(null);
        if (!moved && !e.shiftKey) clearSelection();
      }

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [clearSelection]);

  // -------- native drag/drop move --------

  useEffect(() => {
    function itemsForDrag(row) {
      const key = row.getAttribute("data-row-key");
      if (key && !selectedKeysRef.current.has(key)) {
        selectedKeysRef.current = new Set([key]);
        setSelectedKeys(new Set([key]));
      }

      const selected = getSelectedItems();
      if (selected.length > 0) return dedupeDescendants(selected);
      return dedupeDescendants([itemFromRow(row)]);
    }

    function onDragStart(e) {
      const sweep = rowSweepRef.current;
      if (sweep) {
        const dx = Math.abs(e.clientX - sweep.startX);
        const dy = Math.abs(e.clientY - sweep.startY);
        if (sweep.committed || (dy >= 8 && dy >= dx * 1.2)) {
          e.preventDefault();
          sweep.committed = true;
          suppressNextClickRef.current = true;
          const top = Math.min(sweep.startY, e.clientY);
          const bottom = Math.max(sweep.startY, e.clientY);
          const nextSelection = new Set(sweep.baseSelection);
          nextSelection.add(sweep.startKey);
          sweep.list.querySelectorAll("[data-row-key]").forEach((row) => {
            const rect = row.getBoundingClientRect();
            if (rect.top <= bottom && rect.bottom >= top) nextSelection.add(row.getAttribute("data-row-key"));
          });
          setSelectedKeys(nextSelection);
          return;
        }
      }

      const row = e.target.closest("[data-row-key]");
      if (!row || row.closest("[data-list-scroll]")?.getAttribute("data-trash-view") === "true") return;
      const dragItems = itemsForDrag(row);
      if (dragItems.length === 0) {
        e.preventDefault();
        return;
      }

      e.dataTransfer.setData(MOVE_TRANSFER_TYPE, JSON.stringify(dragItems));
      e.dataTransfer.effectAllowed = "move";

      const ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      ghost.textContent = dragItems.length === 1 ? "1 item" : `${dragItems.length} items`;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 12, 12);
      window.setTimeout(() => ghost.remove(), 0);
    }

    function parseMoveItems(e) {
      const raw = e.dataTransfer?.getData(MOVE_TRANSFER_TYPE);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item) => item && ["file", "folder", "note"].includes(item.type) && typeof item.path === "string");
      } catch {
        return [];
      }
    }

    function canAcceptMove(target, items) {
      const destination = target.getAttribute("data-path") || "";
      const compactItems = dedupeDescendants(items);
      if (compactItems.length === 0) return { ok: false, destination, items: compactItems };
      if (compactItems.every((item) => parentPathFor(item) === destination)) return { ok: false, destination, items: compactItems };

      const invalidFolder = compactItems.find((item) => (
        item.type === "folder"
        && item.path
        && (destination === item.path || destination.startsWith(`${item.path}/`))
      ));
      if (invalidFolder) {
        console.error("Cannot move a folder into itself or one of its children.", invalidFolder);
        return { ok: false, destination, items: compactItems };
      }
      return { ok: true, destination, items: compactItems };
    }

    function onDragOver(e) {
      const target = e.target.closest('[data-drop-target="folder"]');
      const types = e.dataTransfer?.types ? Array.from(e.dataTransfer.types) : [];
      if (!target || !types.includes(MOVE_TRANSFER_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      target.classList.add("drop-target-active");
    }

    function onDragLeave(e) {
      const target = e.target.closest('[data-drop-target="folder"]');
      if (!target) return;
      const next = e.relatedTarget;
      if (next && target.contains(next)) return;
      target.classList.remove("drop-target-active");
    }

    async function onDrop(e) {
      const target = e.target.closest('[data-drop-target="folder"]');
      if (!target) return;
      const itemsToMove = parseMoveItems(e);
      if (itemsToMove.length === 0) return;
      e.preventDefault();
      target.classList.remove("drop-target-active");

      const move = canAcceptMove(target, itemsToMove);
      if (!move.ok) return;

      try {
        const response = await fetch("/api/files/batch-move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: move.items, destination: move.destination })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.ok !== true) {
          throw new Error(result?.error || "Batch move failed");
        }
        if (result.failed?.length) {
          console.error("Some items failed to move.", result.failed);
        }
        clearSelection();
        startTransition(() => router.refresh());
      } catch (error) {
        console.error(error);
      }
    }

    function onDragEnd() {
      document.querySelectorAll(".drop-target-active").forEach((target) => target.classList.remove("drop-target-active"));
    }

    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    document.addEventListener("dragend", onDragEnd);
    return () => {
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
      document.removeEventListener("dragend", onDragEnd);
    };
  }, [clearSelection, getSelectedItems, router, startTransition]);

  useEffect(() => {
    if (!newMenu) return;
    function onDocClick(e) {
      if (e.target.closest('[data-action="new-menu"]')) return;
      if (e.target.closest('.new-menu-popover')) return;
      setNewMenu(null);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [newMenu]);

  // -------- row context menu --------

  useEffect(() => {
    function onContext(e) {
      const row = e.target.closest("[data-row]");
      if (!row) return;
      e.preventDefault();
      const target = {
        type: row.getAttribute("data-item-type"),
        path: row.getAttribute("data-item-path") || "",
        id: row.getAttribute("data-item-id") || "",
        name: row.getAttribute("data-item-name") || ""
      };
      setContext({ x: e.clientX, y: e.clientY, target });
    }
    document.addEventListener("contextmenu", onContext);
    return () => document.removeEventListener("contextmenu", onContext);
  }, []);

  useEffect(() => {
    if (!context) return;
    function onDocClick() { setContext(null); }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [context]);

  // -------- palette focus --------

  useEffect(() => {
    if (paletteOpen) {
      const t = setTimeout(() => paletteInputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [paletteOpen]);

  function runPaletteItem(entry) {
    if (entry.kind === "action") {
      setPaletteOpen(false);
      entry.ref.run();
    } else {
      setPaletteOpen(false);
      router.push(itemHref(entry.ref));
    }
  }

  function handlePaletteKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setPaletteIdx((i) => Math.min(i + 1, Math.max(flatPalette.length - 1, 0))); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setPaletteIdx((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      const entry = flatPalette[paletteIdx];
      if (entry) runPaletteItem(entry);
      return;
    }
  }

  // -------- render --------

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => { uploadFiles(e.target.files); e.target.value = ""; }}
      />

      {isDragging ? (
        <div className="drop-overlay">
          <div className="drop-overlay-panel">
            <IconUpload className="drop-glyph" />
            <div className="drop-title">Drop files to upload</div>
            <div className="drop-sub mono">destination: {currentPath ? `~/${currentPath}` : "~"}</div>
          </div>
        </div>
      ) : null}

      {marquee ? (
        <div
          className="marquee-rect"
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height
          }}
        />
      ) : null}

      {newMenu ? (
        <div className="new-menu-popover" style={{ top: newMenu.top, left: newMenu.left }}>
          <div className="context-item" onClick={() => { setNewMenu(null); setDialog({ kind: "new-folder" }); }}>
            <IconFolder className="" /> New folder<span className="shortcut">F</span>
          </div>
          <div className="context-item" onClick={() => { setNewMenu(null); setDialog({ kind: "new-note" }); }}>
            <IconNote className="" /> New note<span className="shortcut">N</span>
          </div>
          <div className="context-item" onClick={() => { setNewMenu(null); triggerUpload(); }}>
            <IconUpload className="" /> Upload file<span className="shortcut">U</span>
          </div>
        </div>
      ) : null}

      {uploadState ? (
        <div className="upload-toast">
          <div className="upload-toast-head">
            <span className="upload-toast-name">{uploadState.name}</span>
            <span className="upload-toast-count mono">{uploadState.index}/{uploadState.total}</span>
          </div>
          <div className="upload-bar"><div className="upload-bar-fill" style={{ width: `${uploadState.pct}%` }} /></div>
          <div className="upload-toast-sub mono">{uploadState.pct}%{uploadState.size ? ` · ${formatBytes(uploadState.size)}` : ""}</div>
        </div>
      ) : uploadMsg ? (
        <div className="upload-toast"><div className="upload-toast-head">{uploadMsg}</div></div>
      ) : null}

      {paletteOpen ? (
        <div className="palette-backdrop" onClick={closeOverlays}>
          <div className="palette" onClick={(e) => e.stopPropagation()}>
            <div className="palette-input">
              <IconSearch className="" />
              <input
                ref={paletteInputRef}
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                onKeyDown={handlePaletteKey}
                placeholder="Search files, notes, or run a command…"
              />
              <span className="kbd">esc</span>
            </div>
            <ul className="palette-list">
              {paletteResults.actions.length > 0 ? (
                <>
                  <li className="palette-section">Actions</li>
                  {paletteResults.actions.map((a, i) => {
                    const idx = i;
                    const Icon = a.icon;
                    return (
                      <li
                        key={a.id}
                        className={`palette-item${paletteIdx === idx ? " active" : ""}`}
                        onMouseEnter={() => setPaletteIdx(idx)}
                        onClick={() => runPaletteItem({ kind: "action", ref: a })}
                      >
                        <Icon className="glyph" />
                        <span>{a.label}</span>
                        {a.hint ? <span className="palette-item-sub">{a.hint}</span> : null}
                      </li>
                    );
                  })}
                </>
              ) : null}

              {paletteResults.matches.length > 0 ? (
                <>
                  <li className="palette-section">{paletteQuery ? "Matches" : "Nearby"}</li>
                  {paletteResults.matches.map((it, i) => {
                    const idx = paletteResults.actions.length + i;
                    const Icon = it.kind === "folder" ? IconFolder : it.kind === "note" ? IconNote : IconPlus;
                    const sub = it.kind === "folder" && it.path ? `~/${it.path}` : it.kind === "note" ? "note" : it.path ? `~/${it.path.split("/").slice(0, -1).join("/")}` : "";
                    return (
                      <li
                        key={`${it.kind}-${it.path}-${it.id}`}
                        className={`palette-item${paletteIdx === idx ? " active" : ""}`}
                        onMouseEnter={() => setPaletteIdx(idx)}
                        onClick={() => runPaletteItem({ kind: "item", ref: it })}
                      >
                        <Icon className="glyph" />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                        {sub ? <span className="palette-item-sub">{sub}</span> : null}
                      </li>
                    );
                  })}
                </>
              ) : null}

              {paletteResults.actions.length === 0 && paletteResults.matches.length === 0 ? (
                <li className="palette-empty">Nothing matches "{paletteQuery}".</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      {context ? (
        <ContextMenu context={context} currentPath={currentPath} onClose={() => setContext(null)} onRename={(t) => setDialog({ kind: "rename", target: t })} onMove={(t) => setDialog({ kind: "move", target: t })} onDelete={(t) => setDialog({ kind: "delete", target: t })} />
      ) : null}

      {dialog?.kind === "new-folder" ? (
        <Dialog title="New folder" onClose={closeOverlays}>
          <form action={createFolderAction} onSubmit={closeOverlays}>
            <input type="hidden" name="currentPath" value={currentPath || "__root__"} />
            <label>Name<input autoFocus name="name" placeholder="e.g. Clients" required /></label>
            <div className="dialog-row" style={{ marginTop: "0.75rem" }}>
              <button type="button" onClick={closeOverlays}>Cancel</button>
              <button type="submit" className="primary">Create folder</button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {dialog?.kind === "new-note" ? (
        <Dialog title="New note" onClose={closeOverlays}>
          <form action={createNoteAction} onSubmit={closeOverlays}>
            <input type="hidden" name="currentPath" value={currentPath || "__root__"} />
            <label>Title<input autoFocus name="title" placeholder="Title" required /></label>
            <label>Body<textarea name="body" rows={6} placeholder="Optional…" /></label>
            <div className="dialog-row" style={{ marginTop: "0.4rem" }}>
              <button type="button" onClick={closeOverlays}>Cancel</button>
              <button type="submit" className="primary">Create note</button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {dialog?.kind === "rename" ? (
        <Dialog title={`Rename ${dialog.target.type}`} onClose={closeOverlays}>
          <form action={renameItemAction} onSubmit={closeOverlays}>
            <input type="hidden" name="currentPath" value={currentPath || "__root__"} />
            <input type="hidden" name="targetPath" value={dialog.target.path || "__root__"} />
            <input type="hidden" name="itemType" value={dialog.target.type} />
            {dialog.target.id ? <input type="hidden" name="id" value={dialog.target.id} /> : null}
            <label>New name<input autoFocus name="nextName" defaultValue={dialog.target.name} required /></label>
            <div className="dialog-row" style={{ marginTop: "0.4rem" }}>
              <button type="button" onClick={closeOverlays}>Cancel</button>
              <button type="submit" className="primary">Rename</button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {dialog?.kind === "move" ? (
        <Dialog title={`Move ${dialog.target.type}`} onClose={closeOverlays}>
          <form action={moveItemAction} onSubmit={closeOverlays}>
            <input type="hidden" name="currentPath" value={currentPath || "__root__"} />
            <input type="hidden" name="targetPath" value={dialog.target.path || "__root__"} />
            <input type="hidden" name="itemType" value={dialog.target.type} />
            {dialog.target.id ? <input type="hidden" name="id" value={dialog.target.id} /> : null}
            <label>Destination folder<input autoFocus name="destinationPath" placeholder="e.g. Clients/Acme or / for Home" /></label>
            <p className="muted">Enter a folder path. Use <code>/</code> to move to Home.</p>
            <div className="dialog-row" style={{ marginTop: "0.4rem" }}>
              <button type="button" onClick={closeOverlays}>Cancel</button>
              <button type="submit" className="primary">Move</button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {dialog?.kind === "delete" ? (
        <Dialog title={`Move to trash`} onClose={closeOverlays}>
          <form action={deleteItemAction} onSubmit={closeOverlays}>
            <input type="hidden" name="currentPath" value={currentPath || "__root__"} />
            <input type="hidden" name="targetPath" value={dialog.target.path || "__root__"} />
            <input type="hidden" name="itemType" value={dialog.target.type} />
            {dialog.target.id ? <input type="hidden" name="id" value={dialog.target.id} /> : null}
            {dialog.target.type === "folder" ? (
              <p>Move <strong>{dialog.target.name}</strong> and everything inside it to Trash? You can restore it later.</p>
            ) : (
              <p>Move <strong>{dialog.target.name}</strong> to Trash? You can restore it later.</p>
            )}
            <div className="dialog-row" style={{ marginTop: "0.4rem" }}>
              <button type="button" onClick={closeOverlays}>Cancel</button>
              <button autoFocus type="submit" className="danger">Move to trash</button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}

function Dialog({ title, children, onClose }) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ContextMenu({ context, currentPath, onClose, onRename, onMove, onDelete }) {
  const { target, x, y } = context;
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y, visibility: "hidden" });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    let left = x;
    let top = y;
    if (left + r.width + margin > window.innerWidth) left = Math.max(margin, x - r.width);
    if (top + r.height + margin > window.innerHeight) top = Math.max(margin, y - r.height);
    setPos({ left, top, visibility: "visible" });
  }, [x, y]);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: pos.left, top: pos.top, visibility: pos.visibility }}
      onClick={(e) => e.stopPropagation()}
    >
      {target.type === "file" ? (
        <>
          <a className="context-item" href={`/api/files?path=${encodeURIComponent(target.path)}`} onClick={onClose}>
            <IconDownload className="" /> Download
          </a>
          <div className="context-divider" />
        </>
      ) : null}
      <div className="context-item" onClick={() => { onRename(target); onClose(); }}>
        <IconEdit className="" /> Rename<span className="shortcut">R</span>
      </div>
      <div className="context-item" onClick={() => { onMove(target); onClose(); }}>
        <IconMove className="" /> Move to folder…
      </div>
      <div className="context-divider" />
      <div className="context-item danger" onClick={() => { onDelete(target); onClose(); }}>
        <IconTrash className="" /> Move to trash<span className="shortcut">⌫</span>
      </div>
    </div>
  );
}
