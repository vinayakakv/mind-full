import type { SettingsDocument } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from 'react-aria-components';

import { documentTable, updateTheme } from '../data/documents';
import styles from './SettingsPage.module.css';

const themes: Array<SettingsDocument['payload']['theme']> = [
  'system',
  'light',
  'dark',
];

export function SettingsPage() {
  const settings = useLiveQuery(async () => {
    const document = await documentTable().get('settings');
    return document?.type === 'settings' ? document : undefined;
  });

  return (
    <section className={styles.page}>
      <p className={styles.eyebrow}>Your space</p>
      <h1>Settings</h1>
      <div className={styles.setting}>
        <div>
          <h2>Appearance</h2>
          <p>Choose a dedicated theme or follow this device.</p>
        </div>
        <fieldset className={styles.themeChoices}>
          <legend className="visually-hidden">Theme</legend>
          {themes.map((theme) => (
            <Button
              key={theme}
              className={styles.themeChoice}
              aria-pressed={settings?.payload.theme === theme}
              onPress={() => updateTheme(theme)}
            >
              {theme}
            </Button>
          ))}
        </fieldset>
      </div>
    </section>
  );
}
