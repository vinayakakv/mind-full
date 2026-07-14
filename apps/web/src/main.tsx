import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { ensureSettings } from './data/documents';
import './styles/global.css';

const start = async () => {
  await ensureSettings();

  const root = document.getElementById('root');

  if (!root) {
    throw new Error('Mindfull could not find its application root.');
  }

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

void start();
