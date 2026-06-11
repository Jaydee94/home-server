"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NAV } from "./nav";
import { StatusDot, type DotKind } from "../ui/StatusDot";
import { useVmStatus } from "@/lib/useVmStatus";
import styles from "./Sidebar.module.css";

export function Sidebar({ collapsed, mobileOpen, onToggle, serverName }:
  { collapsed: boolean; mobileOpen: boolean; onToggle: () => void; serverName: string }) {
  const path = usePathname();
  const router = useRouter();
  const { status, running } = useVmStatus();

  const dot: DotKind = !status ? "idle" : running ? "ok" : status.printableStatus === "Starting" ? "warn" : "danger";
  const label = !status ? "…" : running ? "läuft" : status.printableStatus === "Starting" ? "startet" : "gestoppt";

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    router.push("/login");
  }

  return (
    <nav className={`${styles.bar} ${collapsed ? styles.collapsed : ""} ${mobileOpen ? styles.open : ""}`}>
      <button className={styles.toggle} onClick={onToggle} aria-label="Menü einklappen">≡</button>
      <div className={styles.brand}><span className={styles.icon}>🧟</span>{!collapsed && <span>{serverName}</span>}</div>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={`${styles.link} ${path === n.href ? styles.active : ""}`} title={n.label}>
          <span className={styles.icon}>{n.icon}</span>{!collapsed && <span>{n.label}</span>}
        </Link>
      ))}
      <div className={styles.spacer} />
      <div className={styles.status}><StatusDot kind={dot} />{!collapsed && <span>Server {label}</span>}</div>
      <div className={styles.foot}>
        <button className={styles.link} onClick={logout} style={{ width: "100%", background: "none", border: "none", cursor: "pointer" }}>
          <span className={styles.icon}>⏻</span>{!collapsed && <span>Logout</span>}
        </button>
      </div>
    </nav>
  );
}
