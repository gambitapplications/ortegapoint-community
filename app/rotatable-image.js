"use client";

import { useState } from "react";
import { IconRotate } from "@/app/icons";

export default function RotatableImage({ downloadUrl, path, name, initialRotation = 0 }) {
  const [bust, setBust] = useState(initialRotation ? String(initialRotation) : "");
  const [pending, setPending] = useState(false);

  async function handleRotate() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/files/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, delta: 90 })
      });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      setBust(`${data.degrees}-${Date.now()}`);
    } finally {
      setPending(false);
    }
  }

  const src = `${downloadUrl}&mode=inline${bust ? `&r=${encodeURIComponent(bust)}` : ""}`;

  return (
    <div className="rotatable-image">
      <img alt={name} src={src} className="preview-image" />
      <button
        type="button"
        onClick={handleRotate}
        disabled={pending}
        className="icon-btn rotate-btn"
        title="Rotate 90°"
        aria-label="Rotate 90 degrees"
      >
        <IconRotate className="" />
      </button>
    </div>
  );
}
