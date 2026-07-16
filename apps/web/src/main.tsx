import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { startNotificationCoordinator } from './data/notifications';
import { migrateLegacyHabitReminders } from './data/reminders';
import { ensureSettings } from './data/settings';
import './styles/global.css';

const start = async () => {
  await ensureSettings();
  await migrateLegacyHabitReminders();

  const root = document.getElementById('root');

  if (!root) {
    throw new Error('Mindfull could not find its application root.');
  }

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  startNotificationCoordinator();
};

void start();
