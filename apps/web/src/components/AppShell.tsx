import { useLiveQuery } from 'dexie-react-hooks';
import { NavLink, Outlet } from 'react-router';

import { documentTable } from '../data/documents';
import { useResolvedTheme } from '../hooks/use-resolved-theme';
import { useSync } from '../hooks/use-sync';
import styles from './AppShell.module.css';
import { SyncIndicator } from './SyncIndicator';

const navItems = [
  { to: '/', label: 'Today', end: true },
  { to: '/history', label: 'History', end: false },
  { to: '/reflect', label: 'Reflect', end: false },
] as const;

export function AppShell() {
  useSync();
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
        <div className={styles.utilities}>
          <SyncIndicator />
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `${styles.settingsLink} ${isActive ? styles.settingsLinkActive : ''}`
            }
            aria-label="Settings"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z" />
              <path d="M19.1 13.2a7.8 7.8 0 0 0 .05-1.2 7.8 7.8 0 0 0-.05-1.2l2-1.55-2-3.45-2.45 1a8 8 0 0 0-2.05-1.2L14.25 3h-4.5L9.4 5.6a8 8 0 0 0-2.05 1.2l-2.45-1-2 3.45 2 1.55a7.8 7.8 0 0 0-.05 1.2c0 .4.02.8.05 1.2l-2 1.55 2 3.45 2.45-1a8 8 0 0 0 2.05 1.2l.35 2.6h4.5l.35-2.6a8 8 0 0 0 2.05-1.2l2.45 1 2-3.45-2-1.55Z" />
            </svg>
          </NavLink>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
