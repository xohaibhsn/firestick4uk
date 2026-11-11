"use client";

import { useId, useState } from "react";
import { writeClipboardText } from "@/lib/clipboardCopy";

type CopyButtonProps = {
  value: string;
  label?: string;
  className?: string;
};

/**
 * Accessible copy control with aria-live "Copied" confirmation.
 */
export default function CopyButton({
  value,
  label = "Copy",
  className = "copy-btn",
}: CopyButtonProps) {
  const liveId = useId();
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const onCopy = async () => {
    try {
      await writeClipboardText(value);
      setStatus("copied");
      window.setTimeout(() => {
        setStatus((prev) => (prev === "copied" ? "idle" : prev));
      }, 1600);
    } catch {
      setStatus("failed");
      window.setTimeout(() => {
        setStatus((prev) => (prev === "failed" ? "idle" : prev));
      }, 1600);
    }
  };

  return (
    <span className="copy-btn-wrap">
      <button
        type="button"
        className={className}
        onClick={onCopy}
        aria-describedby={liveId}
      >
        {label}
      </button>
      <span id={liveId} className="copy-btn-live" aria-live="polite" aria-atomic="true">
        {status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : ""}
      </span>
    </span>
  );
}
