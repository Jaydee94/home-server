"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { extractConfigValue } from "@/lib/config";
import styles from "./AppShell.module.css";

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [serverName, setServerName] = useState("7DTD Server");

  useEffect(() => {
    fetch("/api/config").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.xml) setServerName(extractConfigValue(d.xml, "ServerName") ?? "7DTD Server");
    }).catch(() => {});
  }, []);
  // Mobiles Menü bei Seitenwechsel schließen: State beim Rendern anpassen statt im
  // Effect (https://react.dev/learn/you-might-not-need-an-effect).
  const [prevPath, setPrevPath] = useState(path);
  if (path !== prevPath) { setPrevPath(path); setMobileOpen(false); }

  if (path === "/login") return <>{children}</>;

  return (
    <div className={styles.shell}>
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen}
        onToggle={() => setCollapsed((c) => !c)} serverName={serverName} />
      <div className={styles.content}>
        <div className={styles.mobilebar}>
          <button className={styles.burger} onClick={() => setMobileOpen(true)} aria-label="Menü öffnen">☰</button>
          <strong>{serverName}</strong>
        </div>
        {children}
      </div>
    </div>
  );
}
