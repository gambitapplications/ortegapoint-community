import Link from "next/link";
import { emptyTrashAction, purgeTrashedAction, restoreTrashedAction, updateNoteAction } from "@/app/actions";
import RotatableImage from "@/app/rotatable-image";
import WorkspaceClient from "@/app/workspace-client";
import { IconChevron, IconCompass, IconDownload, IconFile, IconFolder, IconHome, IconImage, IconNote, IconPlus, IconSearch, IconTrash, IconUpload, iconForItem } from "@/app/icons";
import { encodeRoutePath, getParentPath } from "@/lib/path-utils";
import { loadHomeData } from "@/lib/server-data";

function formatRelative(value) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const sec = Math.max(1, Math.round(diff / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.round(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.round(mon / 12)}y ago`;
}

function formatSize(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n >= 10 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

function renderInlineMarkdown(text) {
  const source = text || "";
  const tokens = [];
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match = pattern.exec(source);
  while (match) {
    if (match.index > lastIndex) tokens.push(source.slice(lastIndex, match.index));
    if (match[2] && match[3]) tokens.push(<a key={`l-${match.index}`} href={match[3]} target="_blank" rel="noreferrer">{match[2]}</a>);
    else if (match[4]) tokens.push(<code key={`c-${match.index}`}>{match[4]}</code>);
    else if (match[5]) tokens.push(<strong key={`b-${match.index}`}>{match[5]}</strong>);
    else if (match[6]) tokens.push(<em key={`i-${match.index}`}>{match[6]}</em>);
    lastIndex = match.index + match[0].length;
    match = pattern.exec(source);
  }
  if (lastIndex < source.length) tokens.push(source.slice(lastIndex));
  return tokens;
}

function renderMarkdownBlocks(content) {
  const lines = (content || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let listItems = [];
  let codeLines = [];
  let inCode = false;
  const flushP = () => { if (paragraph.length) { blocks.push(<p key={`p-${blocks.length}`}>{renderInlineMarkdown(paragraph.join(" "))}</p>); paragraph = []; } };
  const flushL = () => { if (listItems.length) { blocks.push(<ul key={`u-${blocks.length}`}>{listItems.map((item, i) => <li key={i}>{renderInlineMarkdown(item)}</li>)}</ul>); listItems = []; } };
  const flushC = () => { if (codeLines.length) { blocks.push(<pre key={`c-${blocks.length}`}><code>{codeLines.join("\n")}</code></pre>); codeLines = []; } };
  for (const line of lines) {
    if (line.trim().startsWith("```")) { flushP(); flushL(); if (inCode) flushC(); inCode = !inCode; continue; }
    if (inCode) { codeLines.push(line); continue; }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const quote = line.match(/^>\s?(.*)$/);
    const list = line.match(/^[-*]\s+(.*)$/);
    if (!line.trim()) { flushP(); flushL(); continue; }
    if (heading) { flushP(); flushL(); const Tag = `h${Math.min(heading[1].length + 1, 4)}`; blocks.push(<Tag key={`h-${blocks.length}`}>{renderInlineMarkdown(heading[2])}</Tag>); continue; }
    if (quote) { flushP(); flushL(); blocks.push(<blockquote key={`q-${blocks.length}`}>{renderInlineMarkdown(quote[1])}</blockquote>); continue; }
    if (list) { flushP(); listItems.push(list[1]); continue; }
    paragraph.push(line.trim());
  }
  flushP(); flushL(); flushC();
  return <div className="md">{blocks}</div>;
}

function renderTable(preview) {
  if (!preview || !preview.rows || preview.rows.length === 0) {
    return <p className="muted">No tabular data found.</p>;
  }
  return (
    <div style={{ overflow: "auto" }}>
      <table className="table-preview">
        <tbody>
          {preview.rows.map((row, ri) => (
            <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {preview.truncated ? <p className="muted" style={{ marginTop: "0.5rem", fontSize: 11 }}>Preview truncated.</p> : null}
      {preview.sheetName ? <p className="muted" style={{ marginTop: "0.25rem", fontSize: 11 }}>Sheet: {preview.sheetName}</p> : null}
    </div>
  );
}

function itemHref(item, currentPath) {
  const folderPath = item.type === "folder"
    ? item.path
    : item.type === "note"
      ? (item.folderPath || currentPath)
      : getParentPath(item.path);
  if (item.type === "folder") return `/?path=${encodeURIComponent(item.path)}&selectedType=folder&selectedPath=${encodeURIComponent(item.path)}`;
  if (item.type === "note") return `/?path=${encodeURIComponent(folderPath)}&selectedType=note&selectedId=${encodeURIComponent(item.id)}`;
  return `/?path=${encodeURIComponent(folderPath)}&selectedType=file&selectedPath=${encodeURIComponent(item.path)}`;
}

function isRowSelected(item, selectedType, selectedPath, selectedId) {
  if (item.type === "folder") return selectedType === "folder" && selectedPath === item.path;
  if (item.type === "note") return selectedType === "note" && selectedId === item.id;
  return selectedType === "file" && selectedPath === item.path;
}

function rowKeyForItem(item) {
  return `${item.type}|${item.path || ""}|${item.id || ""}`;
}

function TreeNode({ node, currentPath }) {
  const active = node.path === currentPath;
  const Icon = IconFolder;
  return (
    <li>
      <Link
        href={`/?path=${encodeURIComponent(node.path)}`}
        className={active ? "tree-link active" : "tree-link"}
        data-drop-target="folder"
        data-path={node.path}
      >
        <span className="glyph"><Icon className="" /></span>
        <span>{node.name}</span>
      </Link>
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => <TreeNode key={child.path} node={child} currentPath={currentPath} />)}
        </ul>
      ) : null}
    </li>
  );
}

function TrashRow({ item, currentPath }) {
  const Icon = item.itemType === "folder" ? IconFolder : item.itemType === "note" ? IconNote : IconFile;
  const typeClass = `row-type-${item.itemType}`;
  return (
    <div className={`row ${typeClass}`}>
      <span className="row-main">
        <span className="row-glyph"><Icon className="" /></span>
        <span className="row-name">
          {item.name}
          {item.originalPath ? <span className="path-hint">from ~/{item.originalPath}</span> : null}
        </span>
      </span>
      <span className="row-size">{item.itemType === "note" ? "" : formatSize(item.size)}</span>
      <span className="row-updated">{formatRelative(item.trashedAt)}</span>
      <span className="row-actions" style={{ opacity: 1, gap: "0.3rem" }}>
        <form action={restoreTrashedAction} style={{ display: "inline" }}>
          <input type="hidden" name="currentPath" value={currentPath || "__root__"} />
          <input type="hidden" name="trashId" value={item.id} />
          <button type="submit" className="btn" style={{ padding: "0.2rem 0.55rem", fontSize: 11.5 }}>Restore</button>
        </form>
        <form action={purgeTrashedAction} style={{ display: "inline" }}>
          <input type="hidden" name="currentPath" value={currentPath || "__root__"} />
          <input type="hidden" name="trashId" value={item.id} />
          <button type="submit" className="btn danger" style={{ padding: "0.2rem 0.55rem", fontSize: 11.5 }}>Delete forever</button>
        </form>
      </span>
    </div>
  );
}

function Row({ item, currentPath, selectedType, selectedPath, selectedId }) {
  const Icon = iconForItem(item);
  const selected = isRowSelected(item, selectedType, selectedPath, selectedId);
  const href = itemHref(item, currentPath);
  const typeClass = `row-type-${item.type}`;
  const breadcrumb = item.breadcrumbPath && item.breadcrumbPath !== "/" ? item.breadcrumbPath : null;
  const size = item.type === "file" ? formatSize(item.size) : "";
  const updated = formatRelative(item.updatedAt || item.updated_at);
  const rowKey = rowKeyForItem(item);
  return (
    <Link
      href={href}
      className={`row ${typeClass}${selected ? " selected" : ""}`}
      data-row="1"
      data-row-key={rowKey}
      data-href={href}
      data-item-type={item.type}
      data-item-path={item.path || ""}
      data-item-id={item.id || ""}
      data-item-name={item.name}
      data-drop-target={item.type === "folder" ? "folder" : undefined}
      data-path={item.type === "folder" ? item.path : undefined}
      draggable="true"
    >
      <span className="row-main">
        <span className="row-glyph"><Icon className="" /></span>
        <span className="row-name">
          {item.name}
          {breadcrumb ? <span className="path-hint">{breadcrumb}</span> : null}
        </span>
      </span>
      <span className="row-size">{size}</span>
      <span className="row-updated">{updated}</span>
      <span className="row-actions" />
    </Link>
  );
}

function PreviewEmpty({ currentFolder, currentPath }) {
  const items = currentFolder.items || [];
  return (
    <>
      <div className="preview-header">
        <div className="preview-title"><h2>{currentFolder.name || "Home"}</h2></div>
        <p className="preview-sub">{currentPath ? `~/${currentPath}` : "~"}</p>
      </div>
      <div className="preview-body preview-overview">
        <div className="stat-grid">
          <div className="stat"><span className="stat-num">{currentFolder.itemCount}</span><span className="stat-label">items</span></div>
          <div className="stat"><span className="stat-num">{currentFolder.folderCount}</span><span className="stat-label">folders</span></div>
          <div className="stat"><span className="stat-num">{currentFolder.fileCount}</span><span className="stat-label">files</span></div>
          <div className="stat"><span className="stat-num">{currentFolder.noteCount}</span><span className="stat-label">notes</span></div>
        </div>
        <div>
          <div className="section-label">Quick contents</div>
          {items.length === 0 ? (
            <p className="muted" style={{ fontSize: 12.5 }}>This folder is empty. Press <span className="kbd">⌘K</span> to add something.</p>
          ) : (
            <div className="quick-list">
              {items.map((it) => {
                const Icon = iconForItem(it);
                return (
                  <Link key={`q-${it.type}-${it.path}-${it.id || ""}`} href={itemHref(it, currentFolder.path)} className="quick-link">
                    <span className="row-glyph"><Icon className="" /></span>
                    <span>{it.name}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function PreviewNote({ item, currentPath }) {
  return (
    <>
      <div className="preview-header">
        <div className="preview-title"><IconNote className="" /><h2>{item.title}</h2></div>
        <p className="preview-sub">{item.folder_path ? `~/${item.folder_path}` : "~"}</p>
        <div className="preview-meta">
          <span className="pill">note</span>
          {item.updated_at ? <span className="pill">updated {formatRelative(item.updated_at)}</span> : null}
        </div>
      </div>
      <div className="preview-body">
        <form action={updateNoteAction} className="note-editor">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="currentPath" value={currentPath || "__root__"} />
          <input name="title" defaultValue={item.title} placeholder="Title" />
          <textarea name="body" defaultValue={item.body} rows={18} placeholder="Start writing… markdown is supported." />
          <div className="note-actions">
            <button type="submit" className="primary">Save</button>
            <span className="faint mono" style={{ marginLeft: "auto", fontSize: 11 }}>⌘↵ to save</span>
          </div>
        </form>
        <div className="section-label" style={{ marginTop: "1rem" }}>Rendered</div>
        {renderMarkdownBlocks(item.body)}
      </div>
    </>
  );
}

function PreviewFile({ item }) {
  const Icon = iconForItem(item);
  return (
    <>
      <div className="preview-header">
        <div className="preview-title"><Icon className="" /><h2>{item.name}</h2></div>
        <p className="preview-sub">{item.previewKind}</p>
        <div className="preview-meta">
          {item.size ? <span className="pill">{formatSize(item.size)}</span> : null}
          {item.updatedAt ? <span className="pill">{formatRelative(item.updatedAt)}</span> : null}
        </div>
      </div>
      <div className="preview-body">
        {item.previewKind === "markdown" && item.content ? renderMarkdownBlocks(item.content) : null}
        {item.previewKind === "text" && item.content ? (
          <>
            <pre className="file-text">{item.content}</pre>
            {item.content.length >= 20000 ? <p className="muted" style={{ marginTop: 6, fontSize: 11 }}>Preview truncated.</p> : null}
          </>
        ) : null}
        {item.previewKind === "csv" || item.previewKind === "spreadsheet" ? renderTable(item.tablePreview) : null}
        {item.previewKind === "image" ? <RotatableImage downloadUrl={item.downloadUrl} path={item.path} name={item.name} initialRotation={item.rotation || 0} /> : null}
        {item.previewKind === "pdf" ? <iframe title={item.name} src={`${item.downloadUrl}&mode=inline`} className="preview-frame" /> : null}
        {item.previewKind === "video" ? <video controls className="preview-video" src={`${item.downloadUrl}&mode=inline`} /> : null}
        {item.previewKind === "spreadsheet-fallback" ? <p className="info-callout">XLS preview isn't available. Download it to view.</p> : null}
        {item.previewKind === "download" ? <p className="info-callout">No preview for this type. Download to inspect.</p> : null}
        <a href={item.downloadUrl} className="btn" style={{ marginTop: "0.85rem" }}>
          <IconDownload className="" /> Download
        </a>
      </div>
    </>
  );
}

function PreviewFolder({ item }) {
  return (
    <>
      <div className="preview-header">
        <div className="preview-title"><IconFolder className="" /><h2>{item.name || "Home"}</h2></div>
        <p className="preview-sub">{item.path ? `~/${item.path}` : "~"}</p>
      </div>
      <div className="preview-body preview-overview">
        <div className="stat-grid">
          <div className="stat"><span className="stat-num">{item.itemCount}</span><span className="stat-label">items</span></div>
          <div className="stat"><span className="stat-num">{item.folderCount}</span><span className="stat-label">folders</span></div>
          <div className="stat"><span className="stat-num">{item.fileCount}</span><span className="stat-label">files</span></div>
          <div className="stat"><span className="stat-num">{item.noteCount}</span><span className="stat-label">notes</span></div>
        </div>
        <div>
          <div className="section-label">Quick contents</div>
          {(item.items || []).length === 0 ? (
            <p className="muted" style={{ fontSize: 12.5 }}>Empty folder.</p>
          ) : (
            <div className="quick-list">
              {(item.items || []).map((it) => {
                const Icon = iconForItem(it);
                return (
                  <Link key={`qf-${it.type}-${it.path}-${it.id || ""}`} href={itemHref(it, item.path)} className="quick-link">
                    <span className="row-glyph"><Icon className="" /></span>
                    <span>{it.name}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Preview({ selectedItem, currentFolder, currentPath }) {
  if (!selectedItem) return <section className="preview"><PreviewEmpty currentFolder={currentFolder} currentPath={currentPath} /></section>;
  if (selectedItem.type === "note") return <section className="preview"><PreviewNote item={selectedItem} currentPath={currentPath} /></section>;
  if (selectedItem.type === "folder") return <section className="preview"><PreviewFolder item={selectedItem} /></section>;
  return <section className="preview"><PreviewFile item={selectedItem} /></section>;
}

function Breadcrumbs({ crumbs }) {
  return (
    <div className="crumbs">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        const label = c.path ? c.name : "~";
        return (
          <span key={c.path || "home"} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            {i > 0 ? <span className="sep">/</span> : null}
            {last ? <span className="current">{label}</span> : (
              <Link href={`/?path=${encodeURIComponent(c.path)}`}>{label}</Link>
            )}
          </span>
        );
      })}
    </div>
  );
}

export default async function Home({ searchParams }) {
  const params = await searchParams;
  const currentPath = typeof params.path === "string" ? params.path : "";
  const selectedType = typeof params.selectedType === "string" ? params.selectedType : "";
  const selectedPath = typeof params.selectedPath === "string" ? params.selectedPath : "";
  const selectedId = typeof params.selectedId === "string" ? params.selectedId : "";
  const search = typeof params.search === "string" ? params.search : "";
  const view = typeof params.view === "string" ? params.view : "";
  const error = typeof params.error === "string" ? params.error : "";

  const data = loadHomeData({ currentPath, search, selectedType, selectedPath, selectedId, view });
  const isTrashView = view === "trash";

  const rows = isTrashView
    ? data.trashed
    : search
      ? data.searchResults
      : data.contents;
  const listLabel = isTrashView
    ? `${data.trashed.length} item${data.trashed.length === 1 ? "" : "s"} in trash`
    : search
      ? `${data.searchResults.length} match${data.searchResults.length === 1 ? "" : "es"} for "${search}"`
      : `${data.contents.length} item${data.contents.length === 1 ? "" : "s"}`;

  const paletteItems = [
    ...data.tree.map((n) => ({ kind: "folder", name: n.name, path: n.path, id: "" })),
    ...data.contents.map((it) => ({ kind: it.type, name: it.name, path: it.path || "", id: it.id || "" }))
  ];

  return (
    <main className="shell">
      <header className="header">
        <div className="brand">
          <IconCompass className="brand-glyph" />
          <span className="brand-name">ortega point</span>
        </div>
        <Breadcrumbs crumbs={data.breadcrumbs} />
      </header>

      <aside className="tree">
        <button className="sidebar-new" data-action="new-menu">
          <IconPlus className="" />
          <span>New</span>
          <span className="sidebar-new-caret">▾</span>
        </button>
        <div className="tree-scroll">
          <div className="tree-section-label">Workspace</div>
          <ul>
            <li>
              <Link
                href="/"
                className={currentPath === "" && !isTrashView ? "tree-link active" : "tree-link"}
                data-drop-target="folder"
                data-path=""
              >
                <span className="glyph"><IconHome className="" /></span>
                <span>Home</span>
              </Link>
              {data.tree.length > 0 ? (
                <ul>
                  {data.tree.map((node) => <TreeNode key={node.path} node={node} currentPath={isTrashView ? "__never__" : currentPath} />)}
                </ul>
              ) : null}
            </li>
          </ul>
          <div className="tree-section-label" style={{ marginTop: "0.6rem" }}>System</div>
          <ul>
            <li>
              <Link href="/?view=trash" className={isTrashView ? "tree-link active" : "tree-link"}>
                <span className="glyph"><IconTrash className="" /></span>
                <span>Trash{data.trashed?.length ? ` (${data.trashed.length})` : ""}</span>
              </Link>
            </li>
          </ul>
        </div>

        {data.storage ? (() => {
          const usedPct = 100 - data.storage.freePct;
          const tone = usedPct >= 90 ? "critical" : usedPct >= 70 ? "warn" : "ok";
          return (
            <div className={`storage-meter storage-${tone}`}>
              <div className="storage-head">
                <span className="storage-label">Storage</span>
                <span className="storage-pct mono">{usedPct}% used</span>
              </div>
              <div className="storage-track">
                <div className="storage-fill" style={{ width: `${Math.max(2, usedPct)}%` }} />
              </div>
              <div className="storage-foot mono">
                <span>{formatSize(data.storage.free)} free</span>
                <span className="faint">of {formatSize(data.storage.total)}</span>
              </div>
            </div>
          );
        })() : null}
      </aside>

      <section className="list-pane">
        <div className="pane-search">
          <form method="get" className="search-box search-box-large" data-search-form>
            <IconSearch className="" style={{ color: "var(--ink-faint)" }} />
            <input type="hidden" name="path" value={currentPath} />
            <input name="search" defaultValue={search} placeholder="Search" data-search-input />
            <span className="search-kbd">/</span>
          </form>
        </div>
        {error ? <div className="error-banner">{error}</div> : null}
        <div className="list-header">
          <span>{isTrashView ? "Trashed" : search ? "Results" : "Name"}</span>
          <span className="col-size">{isTrashView ? "Size" : "Size"}</span>
          <span className="col-updated">{isTrashView ? "Trashed" : "Updated"}</span>
        </div>
        <div className="list-scroll" data-list-scroll data-trash-view={isTrashView ? "true" : undefined}>
          {rows.length === 0 ? (
            <div className="list-empty">
              {isTrashView ? "Trash is empty." : search ? `No matches for "${search}".` : "This folder is empty."}
              {!isTrashView ? <div className="hint">Press <span className="kbd">⌘K</span> to add something, <span className="kbd">/</span> to search.</div> : null}
            </div>
          ) : isTrashView ? (
            rows.map((item) => <TrashRow key={item.id} item={item} currentPath={currentPath} />)
          ) : (
            rows.map((item) => (
              <Row key={`${item.type}-${item.path}-${item.id || ""}`} item={item} currentPath={currentPath} selectedType={selectedType} selectedPath={selectedPath} selectedId={selectedId} />
            ))
          )}
        </div>
      </section>

      {isTrashView ? (
        <section className="preview">
          <div className="preview-header">
            <div className="preview-title"><IconTrash className="" /><h2>Trash</h2></div>
            <p className="preview-sub">Items are kept here until you restore or permanently delete them.</p>
          </div>
          <div className="preview-body">
            <div className="stat-grid" style={{ marginBottom: "0.85rem" }}>
              <div className="stat"><span className="stat-num">{data.trashed.length}</span><span className="stat-label">items</span></div>
              <div className="stat"><span className="stat-num">{formatSize(data.trashed.reduce((sum, t) => sum + (t.size || 0), 0)) || "0 B"}</span><span className="stat-label">size</span></div>
            </div>
            <form action={emptyTrashAction}>
              <input type="hidden" name="currentPath" value={currentPath || "__root__"} />
              <button type="submit" className="danger" disabled={data.trashed.length === 0}>Empty trash</button>
            </form>
            <p className="muted" style={{ fontSize: 12, marginTop: "0.75rem" }}>Emptying trash deletes everything here forever — can't be undone.</p>
          </div>
        </section>
      ) : (
        <Preview selectedItem={data.selectedItem} currentFolder={data.currentFolder} currentPath={currentPath} />
      )}

      <footer className="status">
        <span className="live-dot" />
        <span>ortega-point-community</span>
        <span className="sep">·</span>
        <span>by gambitapplications</span>
        <span className="sep">·</span>
        <span>{currentPath ? `~/${currentPath}` : "~"}</span>
        <span className="sep">·</span>
        <span>{listLabel}</span>
        <span style={{ marginLeft: "auto" }}>
          <span className="kbd">⌘K</span>&nbsp; for commands
        </span>
      </footer>

      <WorkspaceClient currentPath={currentPath} items={paletteItems} />
    </main>
  );
}
