import Link from 'next/link';
import styles from './page.module.css';

// Placeholder until the library home is designed: lists the tools that already exist.
const TOOLS = [
  { href: '/globe', name: 'Globe', text: 'Земля из точек: страны, метки, маршруты, эффекты' },
  { href: '/silhouette', name: 'Силуэт', text: 'Тепловое свечение из PNG или SVG: ореол по краю, цвет к сердцевине' },
];

export default function LibraryPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Библиотека инструментов</h1>
      <p className={styles.lead}>Главная страница появится позже. Пока здесь список готовых инструментов.</p>
      <ul className={styles.list}>
        {TOOLS.map(t => (
          <li key={t.href}>
            <Link className={styles.card} href={t.href}>
              <b>{t.name}</b>
              <span>{t.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
