"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Button } from "../ui/Button";
import styles from "./ConfirmProvider.module.css";

type Req = { title: string; body: string; danger?: boolean };
const ConfirmCtx = createContext<(r: Req) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<Req | null>(null);
  const resolver = useRef<(v: boolean) => void>(() => {});
  const ask = useCallback((r: Req) => new Promise<boolean>((resolve) => { resolver.current = resolve; setReq(r); }), []);
  const finish = (v: boolean) => { setReq(null); resolver.current(v); };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {req && (
        <div className={styles.overlay} onClick={() => finish(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.title}>{req.title}</div>
            <div className={styles.body}>{req.body}</div>
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => finish(false)}>Abbrechen</Button>
              <Button variant={req.danger ? "danger" : "primary"} onClick={() => finish(true)}>Bestätigen</Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
