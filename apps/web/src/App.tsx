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
        path: 'journal',
        element: (
          <PlaceholderPage eyebrow="Write freely" title="Journal">
            The writing space arrives in the next daily-experience slice.
          </PlaceholderPage>
        ),
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
