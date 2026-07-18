import { createBrowserRouter, RouterProvider } from 'react-router';

import { AppShell } from './components/AppShell';
import { TodayPage } from './pages/TodayPage';

export const router = createBrowserRouter([
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
        path: 'habits',
        lazy: async () => {
          const { HabitsPage } = await import('./pages/HabitsPage');
          return { Component: HabitsPage };
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
        path: 'health/metrics',
        lazy: async () => {
          const { HealthMetricsPage } = await import(
            './pages/HealthMetricsPage'
          );
          return { Component: HealthMetricsPage };
        },
      },
      {
        path: 'reflect',
        lazy: async () => {
          const { ReflectPage } = await import('./pages/ReflectPage');
          return { Component: ReflectPage };
        },
      },
      {
        path: 'reflect/memory',
        lazy: async () => {
          const { ReflectionMemoryPage } = await import(
            './pages/ReflectionMemoryPage'
          );
          return { Component: ReflectionMemoryPage };
        },
      },
      {
        path: 'settings',
        lazy: async () => {
          const { SettingsPage } = await import('./pages/SettingsPage');
          return { Component: SettingsPage };
        },
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
