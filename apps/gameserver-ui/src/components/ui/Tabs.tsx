"use client";
import styles from "./Tabs.module.css";
export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className={styles.tabs}>
      {tabs.map((t) => (
        <button key={t} className={`${styles.tab} ${t === active ? styles.active : ""}`} onClick={() => onChange(t)}>{t}</button>
      ))}
    </div>
  );
}
