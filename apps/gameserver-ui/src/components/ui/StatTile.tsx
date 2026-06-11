import styles from "./StatTile.module.css";

export function StatTile({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div className={styles.tile}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}{unit && <span className={styles.unit}> {unit}</span>}</div>
    </div>
  );
}
