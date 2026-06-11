"use client";
import { useState } from "react";
import { Button } from "./Button";
export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button variant="secondary" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch {}
    }}>{done ? "✓ Kopiert" : "⧉ Kopieren"}</Button>
  );
}
