import {
  isCheckInScheduleValid,
  type SettingsDocument,
} from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';
import { Button, Form, Input, Label, TextField } from 'react-aria-components';

import {
  ensureSettings,
  findReminder,
  setCheckInReminder,
  updateAmbience,
  updateCheckInSchedule,
  updateTheme,
} from '../data/documents';
import {
  type BrowserNotificationPermission,
  browserNotificationPermission,
  requestBrowserNotificationPermission,
} from '../data/notifications';
import {
  configureSyncServer,
  hasPairingToken,
  pairWithServer,
  synchronize,
  syncServerAddress,
} from '../data/sync';
import { deviceName } from '../platform/native-shell';
import { syncStatusAtom } from '../state/sync';
import styles from './SettingsPage.module.css';

const themes: Array<SettingsDocument['payload']['theme']> = [
  'system',
  'light',
  'dark',
];

const ambienceModes: Array<SettingsDocument['payload']['ambience']> = [
  'gentle',
  'still',
  'off',
];

function CheckInSchedule({ settings }: { settings: SettingsDocument }) {
  const [morningStartsAt, setMorningStartsAt] = useState(
    settings.payload.morningStartsAt,
  );
  const [eveningStartsAt, setEveningStartsAt] = useState(
    settings.payload.eveningStartsAt,
  );
  const isValid = isCheckInScheduleValid(morningStartsAt, eveningStartsAt);

  const saveSchedule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid) return;

    await updateCheckInSchedule(morningStartsAt, eveningStartsAt);
  };

  return (
    <Form className={styles.scheduleForm} onSubmit={saveSchedule}>
      <div className={styles.timeFields}>
        <TextField value={morningStartsAt} onChange={setMorningStartsAt}>
          <Label>Morning begins</Label>
          <Input type="time" />
        </TextField>
        <TextField value={eveningStartsAt} onChange={setEveningStartsAt}>
          <Label>Evening begins</Label>
          <Input type="time" />
        </TextField>
      </div>
      {!isValid ? (
        <p className={styles.error}>Morning must begin before evening.</p>
      ) : null}
      <div className={styles.formActions}>
        <Button
          className={styles.syncButton}
          type="submit"
          isDisabled={!isValid}
        >
          Save times
        </Button>
      </div>
    </Form>
  );
}

function ReminderForm({
  morning,
  evening,
}: {
  morning: string;
  evening: string;
}) {
  const [morningTime, setMorningTime] = useState(morning);
  const [eveningTime, setEveningTime] = useState(evening);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>(
    'idle',
  );

  useEffect(() => setMorningTime(morning), [morning]);
  useEffect(() => setEveningTime(evening), [evening]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveState('saving');
    await Promise.all([
      setCheckInReminder('morning', morningTime || null),
      setCheckInReminder('evening', eveningTime || null),
    ]);
    setSaveState('saved');
  };

  const changeMorningTime = (value: string) => {
    setMorningTime(value);
    setSaveState('idle');
  };

  const changeEveningTime = (value: string) => {
    setEveningTime(value);
    setSaveState('idle');
  };

  return (
    <Form className={styles.scheduleForm} onSubmit={save}>
      <div className={styles.timeFields}>
        <TextField value={morningTime} onChange={changeMorningTime}>
          <Label>Morning</Label>
          <Input type="time" />
        </TextField>
        <TextField value={eveningTime} onChange={changeEveningTime}>
          <Label>Evening</Label>
          <Input type="time" />
        </TextField>
      </div>
      <p className={styles.fieldHint}>Leave a time empty to turn it off.</p>
      <div className={styles.formActions}>
        <Button
          className={styles.syncButton}
          type="submit"
          isDisabled={saveState === 'saving'}
        >
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'saved'
              ? 'Saved'
              : 'Save reminders'}
        </Button>
      </div>
    </Form>
  );
}

function ReminderSettings() {
  const reminders = useLiveQuery(async () => ({
    morning: await findReminder('check-in', 'morning'),
    evening: await findReminder('check-in', 'evening'),
  }));
  if (!reminders) return null;

  const morning = reminders.morning?.payload.enabled
    ? (reminders.morning.payload.localTime ?? '')
    : '';
  const evening = reminders.evening?.payload.enabled
    ? (reminders.evening.payload.localTime ?? '')
    : '';

  return <ReminderForm morning={morning} evening={evening} />;
}

const permissionText = (permission: BrowserNotificationPermission): string => {
  if (permission === 'granted') {
    return 'Browser alerts are allowed on this device.';
  }
  if (permission === 'denied') {
    return 'Browser alerts are blocked. In-app reminders still appear.';
  }
  if (permission === 'unsupported') {
    return 'This browser cannot show system alerts. In-app reminders still work.';
  }
  return 'Allow system alerts on this device, or keep reminders inside Mindfull.';
};

function NotificationPermissionSetting() {
  const [permission, setPermission] = useState(browserNotificationPermission);
  const requestPermission = async () => {
    setPermission(await requestBrowserNotificationPermission());
  };

  return (
    <div className={styles.permissionSetting}>
      <p>{permissionText(permission)}</p>
      {permission === 'default' ? (
        <Button className={styles.quietButton} onPress={requestPermission}>
          Allow alerts
        </Button>
      ) : null}
    </div>
  );
}

export function SettingsPage() {
  const syncStatus = useAtomValue(syncStatusAtom);
  const [isPaired, setIsPaired] = useState(hasPairingToken);
  const [serverAddress, setServerAddress] = useState(syncServerAddress);
  const [pairingCode, setPairingCode] = useState('');
  const [pairingError, setPairingError] = useState<string | null>(null);
  const settings = useLiveQuery(() => ensureSettings());

  const pairDevice = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPairingError(null);

    try {
      await configureSyncServer(serverAddress);
      setServerAddress(syncServerAddress());
      setIsPaired(hasPairingToken());
      await pairWithServer(pairingCode, deviceName());
      setIsPaired(true);
      setPairingCode('');
      await synchronize();
    } catch (error) {
      setPairingError(
        error instanceof Error
          ? error.message
          : 'Mindfull could not reach that server.',
      );
    }
  };

  const saveServer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPairingError(null);

    try {
      const address = await configureSyncServer(serverAddress);
      setServerAddress(address);
      setIsPaired(hasPairingToken());
    } catch (error) {
      setPairingError(
        error instanceof Error ? error.message : 'That address is not valid.',
      );
    }
  };

  return (
    <section className={styles.page}>
      <p className={styles.eyebrow}>Your space</p>
      <h1>Settings</h1>
      <div className={styles.setting}>
        <div>
          <h2>Appearance</h2>
          <p>Choose a dedicated theme or follow this device.</p>
        </div>
        <div className={styles.appearanceChoices}>
          <fieldset className={styles.themeChoices}>
            <legend>Theme</legend>
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
          <fieldset className={styles.themeChoices}>
            <legend>Ambience</legend>
            {ambienceModes.map((mode) => (
              <Button
                key={mode}
                className={styles.themeChoice}
                aria-pressed={settings?.payload.ambience === mode}
                onPress={() => updateAmbience(mode)}
              >
                {mode}
              </Button>
            ))}
          </fieldset>
        </div>
      </div>
      {settings ? (
        <div className={styles.setting}>
          <div>
            <h2>Daily rhythm</h2>
            <p>Choose when Mindfull offers morning and evening reflection.</p>
          </div>
          <CheckInSchedule key={settings.updatedAt} settings={settings} />
        </div>
      ) : null}
      <div className={styles.setting}>
        <div>
          <h2>Reminders</h2>
          <p>
            Set a gentle daily check-in rhythm. Habit and task reminders are set
            where you create them.
          </p>
          <NotificationPermissionSetting />
        </div>
        <ReminderSettings />
      </div>
      <div className={styles.setting}>
        <div>
          <h2>Sync</h2>
          <p>
            {isPaired
              ? `This device is paired. Status: ${syncStatus}.`
              : 'Pair this device with your Mindfull server.'}
          </p>
        </div>
        {isPaired ? (
          <Form className={styles.pairingForm} onSubmit={saveServer}>
            <TextField value={serverAddress} onChange={setServerAddress}>
              <Label>Backend address</Label>
              <Input
                type="url"
                inputMode="url"
                placeholder="https://mindfull.example"
                autoCapitalize="none"
                autoComplete="url"
              />
            </TextField>
            <p className={styles.fieldHint}>
              Leave empty when the app and server share an address. Changing it
              requires pairing again.
            </p>
            {pairingError ? (
              <p className={styles.error}>{pairingError}</p>
            ) : null}
            <div className={styles.syncActions}>
              <Button className={styles.quietButton} type="submit">
                Save address
              </Button>
              <Button className={styles.syncButton} onPress={synchronize}>
                Sync now
              </Button>
            </div>
          </Form>
        ) : (
          <Form className={styles.pairingForm} onSubmit={pairDevice}>
            <TextField value={serverAddress} onChange={setServerAddress}>
              <Label>Backend address</Label>
              <Input
                type="url"
                inputMode="url"
                placeholder="https://mindfull.example"
                autoCapitalize="none"
                autoComplete="url"
              />
            </TextField>
            <p className={styles.fieldHint}>
              Leave empty when the app and server share an address.
            </p>
            <TextField value={pairingCode} onChange={setPairingCode} isRequired>
              <Label>Pairing code</Label>
              <Input type="password" autoComplete="off" />
            </TextField>
            {pairingError ? (
              <p className={styles.error}>{pairingError}</p>
            ) : null}
            <Button className={styles.syncButton} type="submit">
              Pair device
            </Button>
          </Form>
        )}
      </div>
    </section>
  );
}
