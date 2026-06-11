import styles from "./Table.module.css";

export function Table({ children }: { children: React.ReactNode }) {
  return <table className={styles.table}>{children}</table>;
}
