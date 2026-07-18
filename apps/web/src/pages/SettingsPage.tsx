import {
  isCheckInScheduleValid,
  type SettingsDocument,
} from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Form, Input, Label, TextField } from 'react-aria-components';
import {
  type AiConfigurationView,
  loadAiConfiguration,
  loadAiModels,
  pauseAi,
  retryFailedAiJobs,
  saveAiConfiguration,
} from '../data/ai';
import {
  type DeviceNotificationPermission,
  deviceNotificationPermission,
  type ExactNotificationPermission,
  exactNotificationPermission,
  requestDeviceNotificationPermission,
  requestExactNotificationPermission,
} from '../data/notifications';
import { findReminder, setCheckInReminder } from '../data/reminders';
import {
  ensureSettings,
  updateAmbience,
  updateCheckInSchedule,
  updateTheme,
} from '../data/settings';
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

const aiStatusText: Record<AiConfigurationView['status'], string> = {
  'not-configured': 'Add a model server to begin.',
  checking: 'Checking the model server…',
  available: 'The model is online.',
  unavailable: 'The model is offline. Mindfull will try again quietly.',
  'invalid-configuration': 'The model configuration needs attention.',
  paused: 'Reflection is paused. Waiting work is safe.',
};

const aiErrorText: Record<string, string> = {
  'access-denied': 'The model server refused access to its model list.',
  'authentication-failed': 'The model server rejected the saved API key.',
  'connection-refused':
    'The connection was refused. Check that the model server is running and listening on this address.',
  'dns-not-found': 'The model server hostname could not be resolved.',
  'invalid-model-list':
    'The /models response was not in the expected OpenAI-compatible format.',
  'invocation-failed':
    'The model server was reached, but the reflection request failed.',
  'models-endpoint-not-found':
    'No /models endpoint was found. The API URL usually ends in /v1.',
  'provider-rate-limited': 'The model server is rate-limiting requests.',
  'provider-rejected-request':
    'The server rejected the request. Its structured-output support may be incompatible.',
  'provider-server-error': 'The model server returned an internal error.',
  'selected-model-unavailable':
    'The selected model is no longer offered by the server.',
  'structured-output':
    'The model did not return the required structured response after a retry.',
  'tls-error': 'The model server certificate could not be verified.',
  'timed-out': 'The model server did not respond before the timeout.',
  unreachable:
    'The model server could not be reached from the Mindfull backend.',
};

function AiSettings({ isPaired }: { isPaired: boolean }) {
  const [configuration, setConfiguration] =
    useState<AiConfigurationView | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (updateFields = false) => {
      if (!isPaired) return;
      try {
        const next = await loadAiConfiguration();
        setConfiguration(next);
        if (updateFields) {
          setBaseUrl(next.baseUrl);
          setModel(next.model ?? '');
        }
      } catch {
        if (updateFields) {
          setError('Mindfull could not read the model configuration.');
        }
      }
    },
    [isPaired],
  );

  useEffect(() => {
    void refresh(true);
    const interval = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const findModels = async () => {
    setState('loading');
    setError(null);
    try {
      const choices = await loadAiModels(
        baseUrl,
        apiKey || (configuration?.hasApiKey ? null : ''),
      );
      setModels(choices);
      if (choices.length === 1) setModel(choices[0] ?? '');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Mindfull could not load models.',
      );
    } finally {
      setState('idle');
    }
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState('saving');
    setError(null);
    try {
      await saveAiConfiguration({
        baseUrl,
        apiKey: apiKey || (configuration?.hasApiKey ? null : ''),
        model: model || null,
      });
      setApiKey('');
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Mindfull could not save the model configuration.',
      );
    } finally {
      setState('idle');
    }
  };

  const togglePause = async () => {
    if (!configuration) return;
    setError(null);
    try {
      await pauseAi(!configuration.paused);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.');
    }
  };

  const retryFailed = async () => {
    setError(null);
    try {
      await retryFailedAiJobs();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.');
    }
  };

  if (!isPaired) {
    return (
      <p className={styles.fieldHint}>
        Pair this device before configuring reflection.
      </p>
    );
  }

  const modelChoices = Array.from(
    new Set([
      ...(configuration?.model ? [configuration.model] : []),
      ...models,
    ]),
  );

  return (
    <Form className={styles.aiForm} onSubmit={save}>
      <TextField value={baseUrl} onChange={setBaseUrl} isRequired>
        <Label>OpenAI-compatible API URL</Label>
        <Input
          type="url"
          inputMode="url"
          placeholder="http://llama-server:8080/v1"
          autoCapitalize="none"
          autoComplete="url"
        />
      </TextField>
      <TextField value={apiKey} onChange={setApiKey}>
        <Label>API key</Label>
        <Input
          type="password"
          autoComplete="new-password"
          placeholder={
            configuration?.hasApiKey
              ? 'Saved — leave empty to keep'
              : 'Optional'
          }
        />
      </TextField>
      <div className={styles.modelRow}>
        <Button
          className={`${styles.quietButton} ${styles.modelButton}`}
          onPress={findModels}
          isDisabled={!baseUrl || state !== 'idle'}
        >
          {state === 'loading' ? 'Finding…' : 'Find models'}
        </Button>
        {modelChoices.length ? (
          <label className={styles.modelField}>
            Model
            <select
              value={model}
              onChange={(event) => setModel(event.target.value)}
            >
              <option value="">Choose one</option>
              {modelChoices.map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {!error && configuration ? (
        <div className={styles.aiStatusBlock}>
          <p className={styles.aiStatus} data-status={configuration.status}>
            {aiStatusText[configuration.status]}
            {configuration.memoryInitialization
              ? ` Building memory: ${configuration.memoryInitialization.processedSources} of ${configuration.memoryInitialization.totalSources} past reflections processed${configuration.memoryInitialization.state === 'running' ? '; processing a batch now' : ''}.`
              : configuration.pendingJobs
                ? ` ${configuration.pendingJobs} reflection${configuration.pendingJobs === 1 ? '' : 's'} waiting.`
                : ''}
          </p>
          {configuration.errorCode && aiErrorText[configuration.errorCode] ? (
            <p className={styles.aiStatusDetail}>
              {aiErrorText[configuration.errorCode]}
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.syncActions}>
        {configuration?.failedJobs ? (
          <Button
            className={`${styles.quietButton} ${styles.secondaryAction}`}
            onPress={retryFailed}
          >
            Retry reflection
          </Button>
        ) : null}
        {configuration?.model ? (
          <Button
            className={`${styles.quietButton} ${styles.secondaryAction}`}
            onPress={togglePause}
          >
            {configuration.paused ? 'Resume reflection' : 'Pause reflection'}
          </Button>
        ) : null}
        <Button
          className={styles.syncButton}
          type="submit"
          isDisabled={!baseUrl || !model || state !== 'idle'}
        >
          {state === 'saving' ? 'Saving…' : 'Save model'}
        </Button>
      </div>
    </Form>
  );
}

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
  const [isPairing, setIsPairing] = useState(false);
  const pairingInProgress = useRef(false);
  const settings = useLiveQuery(() => ensureSettings());

  const pairDevice = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pairingInProgress.current) return;

    pairingInProgress.current = true;
    setIsPairing(true);
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
    } finally {
      pairingInProgress.current = false;
      setIsPairing(false);
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
          <h2>Reflection model</h2>
          <p>
            Connect an OpenAI-compatible model. Mindfull prepares the context;
            the model receives no tools.
          </p>
        </div>
        <AiSettings isPaired={isPaired} />
      </div>
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
              <Button
                className={`${styles.quietButton} ${styles.secondaryAction}`}
                type="submit"
              >
                Save address
              </Button>
              <Button className={styles.syncButton} onPress={synchronize}>
                {syncStatus === 'error' ? 'Try sync again' : 'Sync now'}
              </Button>
            </div>
          </Form>
        ) : (
          <Form className={styles.pairingForm} onSubmit={pairDevice}>
            <TextField
              value={serverAddress}
              onChange={setServerAddress}
              isDisabled={isPairing}
            >
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
            <TextField
              value={pairingCode}
              onChange={setPairingCode}
              isRequired
              isDisabled={isPairing}
            >
              <Label>Pairing code</Label>
              <Input type="password" autoComplete="off" />
            </TextField>
            {pairingError ? (
              <p className={styles.error}>{pairingError}</p>
            ) : null}
            <Button
              className={styles.syncButton}
              type="submit"
              isDisabled={isPairing}
            >
              {isPairing ? 'Pairing…' : 'Pair device'}
            </Button>
          </Form>
        )}
      </div>
    </section>
  );
}
