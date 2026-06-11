"use client";
import { createContext, useCallback, useContext, useState } from "react";
import styles from "./ToastProvider.module.css";

type Toast = { id: number; kind: "ok" | "error"; text: string };
const ToastCtx = createContext<(kind: "ok" | "error", text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

let counter = 0;
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: "ok" | "error", text: string) => {
    const id = ++counter;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className={styles.stack}>
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[t.kind]}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
