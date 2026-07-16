import { relevantCheckInKind } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { NavLink, Outlet } from 'react-router';

import { loadSettings } from '../data/settings';
import { localTimeFor } from '../data/time';
import { useHousekeeping } from '../hooks/use-housekeeping';
import { useResolvedTheme } from '../hooks/use-resolved-theme';
import { useSync } from '../hooks/use-sync';
import { AmbientBackdrop } from './AmbientBackdrop';
import styles from './AppShell.module.css';
import { SyncIndicator } from './SyncIndicator';

const navItems = [
  { to: '/', label: 'Today', end: true },
  { to: '/history', label: 'History', end: false },
  { to: '/reflect', label: 'Reflect', end: false },
] as const;

function PrimaryNavigation({ className }: { className: string }) {
  return (
    <nav className={className} aria-label="Primary navigation">
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
  );
}

export function AppShell() {
  useSync();
  useHousekeeping();
  const settings = useLiveQuery(loadSettings);

  useResolvedTheme(settings?.payload.theme ?? 'system');
  const period = relevantCheckInKind(
    localTimeFor(new Date()),
    settings?.payload.morningStartsAt ?? '05:00',
    settings?.payload.eveningStartsAt ?? '18:00',
  );

  return (
    <div className={styles.shell}>
      <AmbientBackdrop
        mode={settings?.payload.ambience ?? 'gentle'}
        period={period}
      />
      <div className={styles.headerFrame}>
        <header className={styles.header}>
          <NavLink
            to="/"
            className={styles.wordmark}
            aria-label="Mindfull home"
          >
            mindfull
          </NavLink>
          <PrimaryNavigation
            className={`${styles.navigation} ${styles.desktopNavigation}`}
          />
          <div className={styles.utilities}>
            <SyncIndicator />
            <NavLink
              to="/health"
              className={({ isActive }) =>
                `${styles.utilityLink} ${isActive ? styles.utilityLinkActive : ''}`
              }
              aria-label="Health"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 4v16M17 4v16M4 8h6M14 8h6M4 16h6M14 16h6M10 6v4M14 6v4M10 14v4M14 14v4" />
              </svg>
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `${styles.utilityLink} ${isActive ? styles.utilityLinkActive : ''}`
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
      </div>
      <main className={styles.main}>
        <Outlet />
      </main>
      <PrimaryNavigation
        className={`${styles.navigation} ${styles.mobileNavigation}`}
      />
    </div>
  );
}
