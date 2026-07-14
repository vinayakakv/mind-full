import { useLiveQuery } from 'dexie-react-hooks';
import { NavLink, Outlet } from 'react-router';

import { documentTable } from '../data/documents';
import { useResolvedTheme } from '../hooks/use-resolved-theme';
import styles from './AppShell.module.css';

const navItems = [
  { to: '/', label: 'Today', end: true },
  { to: '/journal', label: 'Journal', end: false },
  { to: '/reflect', label: 'Reflect', end: false },
  { to: '/settings', label: 'Settings', end: false },
] as const;

export function AppShell() {
  const settings = useLiveQuery(async () => {
    const document = await documentTable().get('settings');
    return document?.type === 'settings' ? document : undefined;
  });

  useResolvedTheme(settings?.payload.theme ?? 'system');

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <NavLink to="/" className={styles.wordmark} aria-label="Mindfull home">
          mindfull
        </NavLink>
        <nav className={styles.navigation} aria-label="Primary navigation">
          {navItems.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
