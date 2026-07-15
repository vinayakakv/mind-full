import {
  isCheckInScheduleValid,
  type SettingsDocument,
} from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useState } from 'react';
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
  type DeviceNotificationPermission,
  deviceNotificationPermission,
  type ExactNotificationPermission,
  exactNotificationPermission,
  requestDeviceNotificationPermission,
  requestExactNotificationPermission,
} from '../data/notifications';
import {
  configureSyncServer,
  hasPairingToken,
  pairWithServer,
  synchronize,
  syncServerAddress,
} from '../data/sync';
import { deviceName } from '../platform/native-shell';
import { syncStatusAtom, syncStatusDescriptions } from '../state/sync';
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

const permissionText = (permission: DeviceNotificationPermission): string => {
  if (permission === 'granted') {
    return 'System alerts are allowed on this device.';
  }
  if (permission === 'denied') {
    return 'System alerts are blocked. In-app reminders still appear.';
  }
  if (permission === 'unsupported') {
    return 'This browser cannot show system alerts. In-app reminders still work.';
  }
  return 'Allow system alerts on this device, or keep reminders inside Mindfull.';
};

const exactPermissionText = (
  permission: ExactNotificationPermission,
): string | null => {
  if (permission === 'unsupported') return null;
  if (permission === 'granted') {
    return 'Android can deliver reminders at their exact times.';
  }
  if (permission === 'denied') {
    return 'Exact timing is blocked in Android settings.';
  }
  return 'Allow exact timing so Android does not delay reminders.';
};

function NotificationPermissionSetting() {
  const [permission, setPermission] = useState<
    DeviceNotificationPermission | 'loading'
  >('loading');
  const [exactPermission, setExactPermission] = useState<
    ExactNotificationPermission | 'loading'
  >('loading');

  const refreshPermissions = useCallback(async () => {
    const [display, exact] = await Promise.all([
      deviceNotificationPermission(),
      exactNotificationPermission(),
    ]);
    setPermission(display);
    setExactPermission(exact);
  }, []);

  useEffect(() => {
    const refresh = () => void refreshPermissions();
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refreshPermissions]);

  const requestPermission = async () => {
    setPermission(await requestDeviceNotificationPermission());
    setExactPermission(await exactNotificationPermission());
  };

  const requestExactPermission = async () => {
    setExactPermission(await requestExactNotificationPermission());
  };

  const canRequestDisplay =
    permission === 'default' ||
    permission === 'prompt' ||
    permission === 'prompt-with-rationale';
  const exactText =
    exactPermission === 'loading' ? null : exactPermissionText(exactPermission);

  return (
    <div className={styles.permissionSetting}>
      {permission !== 'loading' ? (
        <div className={styles.permissionRow}>
          <p>{permissionText(permission)}</p>
          {canRequestDisplay ? (
            <Button className={styles.quietButton} onPress={requestPermission}>
              Allow alerts
            </Button>
          ) : null}
        </div>
      ) : null}
      {permission === 'granted' && exactText ? (
        <div className={styles.permissionRow}>
          <p>{exactText}</p>
          {exactPermission !== 'granted' ? (
            <Button
              className={styles.quietButton}
              onPress={requestExactPermission}
            >
              Allow exact times
            </Button>
          ) : null}
        </div>
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
              ? `This device is paired. ${syncStatusDescriptions[syncStatus]}`
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
                {syncStatus === 'error' ? 'Try sync again' : 'Sync now'}
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
