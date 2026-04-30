// Minimal inline SVG set — kept tiny and uniform at 14x14.
export function IconFolder({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M1.75 4.25a1 1 0 0 1 1-1h3.1a1 1 0 0 1 .72.3l.96.96h5.72a1 1 0 0 1 1 1v6.24a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1V4.25Z" />
    </svg>
  );
}

export function IconNote({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3.5 2.5h6.25L12.5 5.25V13a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5Z" />
      <path d="M9.75 2.5v2.75h2.75" />
      <path d="M5.5 8h5M5.5 10.5h3.5" />
    </svg>
  );
}

export function IconFile({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 2.5h5.25L12.5 5.75V13a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5Z" />
      <path d="M9.25 2.5v3.25h3.25" />
    </svg>
  );
}

export function IconImage({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1" />
      <circle cx="6" cy="6.25" r="1" />
      <path d="m2.5 11 3-3 3.25 3 2-2 2.75 2.5" />
    </svg>
  );
}

export function IconHome({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m2 7 6-4.5L14 7v6.25a.5.5 0 0 1-.5.5h-3v-4h-5v4h-3a.5.5 0 0 1-.5-.5V7Z" />
    </svg>
  );
}

export function IconSearch({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="7.25" cy="7.25" r="4.5" />
      <path d="m10.75 10.75 2.75 2.75" />
    </svg>
  );
}

export function IconRotate({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M13.5 8a5.5 5.5 0 1 1-2.3-4.47" />
      <path d="M13.5 2.5v3.5h-3.5" />
    </svg>
  );
}

export function IconPlus({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}

export function IconUpload({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 11.5v1.25a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V11.5" />
      <path d="M8 2.5v8M5 5.5 8 2.5l3 3" />
    </svg>
  );
}

export function IconDownload({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 11.5v1.25a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V11.5" />
      <path d="M8 2.5v8M5 7.5 8 10.5l3-3" />
    </svg>
  );
}

export function IconTrash({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2.75 4.5h10.5M6 4.5V3a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1.5M4 4.5l.65 8.1a.5.5 0 0 0 .5.4h5.7a.5.5 0 0 0 .5-.4L12 4.5" />
    </svg>
  );
}

export function IconEdit({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 10.5 10.25 3.25l2.5 2.5L5.5 13H3v-2.5Z" />
    </svg>
  );
}

export function IconMove({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8 2.5v11M2.5 8h11M5.5 5.5 2.5 8l3 2.5M10.5 5.5 13.5 8l-3 2.5M5.5 2.5 8 5l2.5-2.5M5.5 13.5 8 11l2.5 2.5" />
    </svg>
  );
}

// Brand compass — a small cartographic nod.
export function IconCompass({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="8" cy="8" r="6" />
      <path d="m10.5 5.5-3.6 1.4L5.5 10.5l3.6-1.4L10.5 5.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconChevron({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m6 4 4 4-4 4" />
    </svg>
  );
}

export function iconForItem(item) {
  if (item.type === "folder") return IconFolder;
  if (item.type === "note") return IconNote;
  if (item.previewKind === "image") return IconImage;
  return IconFile;
}
