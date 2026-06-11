import styles from "./StatusDot.module.css";

export type DotKind = "ok" | "warn" | "danger" | "idle";

export function StatusDot({ kind }: { kind: DotKind }) {
  return <span className={`${styles.dot} ${styles[kind]}`} />;
}
