import styles from "./Skeleton.module.css";

export function Skeleton({ width = "100%", height = 16 }: { width?: number | string; height?: number | string }) {
  return <div className={styles.sk} style={{ width, height }} />;
}
