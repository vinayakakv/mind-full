import { createBrowserRouter, RouterProvider } from 'react-router';

import { AppShell } from './components/AppShell';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { SettingsPage } from './pages/SettingsPage';
import { TodayPage } from './pages/TodayPage';

const router = createBrowserRouter([
  {
    path: '/',
    Component: AppShell,
    children: [
      { index: true, Component: TodayPage },
      {
        path: 'history',
        lazy: async () => {
          const { HistoryPage } = await import('./pages/HistoryPage');
          return { Component: HistoryPage };
        },
      },
      {
        path: 'journal',
        lazy: async () => {
          const { JournalPage } = await import('./pages/JournalPage');
          return { Component: JournalPage };
        },
      },
      {
        path: 'check-ins/:checkInId',
        lazy: async () => {
          const { CheckInPage } = await import('./pages/CheckInPage');
          return { Component: CheckInPage };
        },
      },
      {
        path: 'health',
        lazy: async () => {
          const { HealthPage } = await import('./pages/HealthPage');
          return { Component: HealthPage };
        },
      },
      {
        path: 'reflect',
        element: (
          <PlaceholderPage eyebrow="Look back gently" title="Reflect">
            Reviews and patterns will gather here without turning life into a
            dashboard.
          </PlaceholderPage>
        ),
      },
      { path: 'settings', Component: SettingsPage },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
