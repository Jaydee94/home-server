import styles from "./Card.module.css";

export function Card({ title, className = "", children }: { title?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`${styles.card} ${className}`}>
      {title && <div className={styles.title}>{title}</div>}
      {children}
    </section>
  );
}
