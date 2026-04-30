"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function UploadPanel({ currentPath }) {
  const router = useRouter();
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (files.length === 0) {
      return;
    }

    const formData = new FormData();
    formData.set("currentPath", currentPath || "__root__");
    for (const file of files) {
      formData.append("file", file);
    }

    setMessage("");
    const response = await fetch("/api/files", {
      method: "POST",
      body: formData
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error || "Upload failed");
      return;
    }

    setMessage(files.length === 1 ? `Uploaded ${files[0].name}` : `Uploaded ${files.length} files to this folder`);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    startTransition(() => {
      router.refresh();
    });
  }

  function handleFileChange(event) {
    uploadFiles(event.target.files);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    uploadFiles(event.dataTransfer.files);
  }

  return (
    <div className="tool-form">
      <label
        className={isDragging ? "dropzone active" : "dropzone"}
        onDragEnter={() => setIsDragging(true)}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) {
            return;
          }
          setIsDragging(false);
        }}
        onDrop={handleDrop}
      >
        <input ref={inputRef} type="file" name="file" multiple onChange={handleFileChange} disabled={isPending} />
        <span className="dropzone-copy">
          <strong>{isPending ? "Uploading..." : isDragging ? "Release to upload" : "Drop files here"}</strong>
          <span>{isPending ? "Your files are being added now." : "or click to choose files from your computer"}</span>
        </span>
      </label>
      <p className="muted upload-target">Destination: {currentPath && currentPath !== "__root__" ? `/${currentPath}` : "Home"}</p>
      {message ? <p className="muted upload-message">{message}</p> : null}
    </div>
  );
}
