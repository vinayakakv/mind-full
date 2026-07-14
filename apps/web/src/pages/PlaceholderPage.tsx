import styles from './PlaceholderPage.module.css';

export function PlaceholderPage({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.page}>
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <div>{children}</div>
    </section>
  );
}
