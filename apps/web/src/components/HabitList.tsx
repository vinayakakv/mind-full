import {
  type HabitDocument,
  type HabitLogDocument,
  habitStreak,
  recentScheduledDates,
  scheduledOn,
} from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import {
  Button,
  Form,
  Input,
  Label,
  TextArea,
  TextField,
} from 'react-aria-components';

import {
  createHabit,
  documentTable,
  recordHabitMiss,
  setHabitArchived,
  setHabitCompleted,
  updateHabit,
} from '../data/documents';
import { localDateFor } from '../data/time';
import styles from './HabitList.module.css';

const weekdays = [
  { value: 0, short: 'S', name: 'Sunday' },
  { value: 1, short: 'M', name: 'Monday' },
  { value: 2, short: 'T', name: 'Tuesday' },
  { value: 3, short: 'W', name: 'Wednesday' },
  { value: 4, short: 'T', name: 'Thursday' },
  { value: 5, short: 'F', name: 'Friday' },
  { value: 6, short: 'S', name: 'Saturday' },
] as const;

const habitDocuments = async (): Promise<{
  habits: HabitDocument[];
  logs: HabitLogDocument[];
}> => {
  const [habitResults, logResults] = await Promise.all([
    documentTable().where('type').equals('habit').toArray(),
    documentTable().where('type').equals('habit-log').toArray(),
  ]);

  return {
    habits: habitResults
      .filter(
        (document): document is HabitDocument =>
          document.type === 'habit' && !document.deletedAt,
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    logs: logResults.filter(
      (document): document is HabitLogDocument =>
        document.type === 'habit-log' && !document.deletedAt,
    ),
  };
};

const startedOn = (habit: HabitDocument): string =>
  localDateFor(new Date(habit.createdAt));

const formatDate = (localDate: string): string =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${localDate}T12:00:00`));

const formatReminder = (reminderTime: string): string => {
  const [hour, minute] = reminderTime.split(':').map(Number);
  const date = new Date(2000, 0, 1, hour, minute);
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

function HabitForm({
  habit,
  onSaved,
  onCancel,
}: {
  habit: HabitDocument | undefined;
  onSaved: (habitId: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(habit?.payload.name ?? '');
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(
    habit?.payload.weekdays ?? weekdays.map(({ value }) => value),
  );
  const [reminderTime, setReminderTime] = useState(
    habit?.payload.reminderTime ?? '',
  );

  const toggleWeekday = (weekday: number) => {
    setSelectedWeekdays((selected) =>
      selected.includes(weekday)
        ? selected.filter((candidate) => candidate !== weekday)
        : [...selected, weekday].sort(),
    );
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || selectedWeekdays.length === 0) return;

    const input = {
      name: name.trim(),
      weekdays: selectedWeekdays,
      reminderTime: reminderTime || null,
    };
    const saved = habit
      ? await updateHabit(habit.id, input)
      : await createHabit(input);
    onSaved(saved.id);
  };

  return (
    <Form className={styles.habitForm} onSubmit={save}>
      <TextField value={name} onChange={setName} isRequired autoFocus>
        <Label>Habit</Label>
        <Input placeholder="Take a short walk" maxLength={100} />
      </TextField>
      <fieldset className={styles.weekdayField}>
        <legend>Scheduled days</legend>
        <div className={styles.weekdayChoices}>
          {weekdays.map((weekday) => (
            <Button
              key={weekday.value}
              className={styles.weekdayButton}
              aria-label={weekday.name}
              aria-pressed={selectedWeekdays.includes(weekday.value)}
              onPress={() => toggleWeekday(weekday.value)}
            >
              {weekday.short}
            </Button>
          ))}
        </div>
        {selectedWeekdays.length === 0 ? (
          <p className={styles.formHint}>Choose at least one day.</p>
        ) : null}
      </fieldset>
      <TextField value={reminderTime} onChange={setReminderTime}>
        <Label>Reminder time</Label>
        <Input type="time" />
        <p className={styles.formHint}>
          Optional. Each device keeps this reminder locally available.
        </p>
      </TextField>
      <div className={styles.formActions}>
        <Button className={styles.primaryButton} type="submit">
          {habit ? 'Save changes' : 'Add habit'}
        </Button>
        <Button className={styles.textButton} onPress={onCancel}>
          Cancel
        </Button>
      </div>
    </Form>
  );
}

function MissReason({
  habit,
  localDate,
  existingReason,
  onDone,
}: {
  habit: HabitDocument;
  localDate: string;
  existingReason: string | null;
  onDone: () => void;
}) {
  const [reason, setReason] = useState(existingReason ?? '');

  const save = async () => {
    await recordHabitMiss(habit.id, localDate, reason.trim() || null);
    onDone();
  };

  return (
    <div className={styles.reasonForm}>
      <Label htmlFor={`reason-${habit.id}-${localDate}`}>Optional note</Label>
      <TextArea
        id={`reason-${habit.id}-${localDate}`}
        value={reason}
        onChange={(event) => setReason(event.currentTarget.value)}
        placeholder="What made this difficult?"
      />
      <div className={styles.reasonActions}>
        <Button className={styles.smallButton} onPress={save}>
          Save note
        </Button>
        <Button className={styles.textButton} onPress={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function HabitDetails({
  habit,
  logs,
  today,
  onEdit,
  onClose,
}: {
  habit: HabitDocument;
  logs: HabitLogDocument[];
  today: string;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [reasonDate, setReasonDate] = useState<string | null>(null);
  const habitLogs = logs.filter(({ payload }) => payload.habitId === habit.id);
  const logByDate = new Map(
    habitLogs.map((log) => [log.payload.localDate, log]),
  );
  const streak = habitStreak(
    habit.payload,
    habitLogs.map(({ payload }) => payload),
    today,
    startedOn(habit),
  );
  const recentDates = recentScheduledDates(
    habit.payload.weekdays,
    today,
    startedOn(habit),
    6,
  );

  const archive = async () => {
    await setHabitArchived(habit.id, true);
    onClose();
  };

  return (
    <div className={styles.habitDetails}>
      <div className={styles.detailHeading}>
        <div>
          <p className={styles.detailKicker}>Habit</p>
          <h3>{habit.payload.name}</h3>
        </div>
        <Button className={styles.textButton} onPress={onEdit}>
          Edit
        </Button>
      </div>
      <p className={styles.streak}>
        {streak === 0
          ? 'No current streak'
          : `${streak} scheduled ${streak === 1 ? 'completion' : 'completions'} in a row`}
      </p>
      <div className={styles.occurrences}>
        {recentDates.map((localDate) => {
          const log = logByDate.get(localDate);
          const isToday = localDate === today;
          const status =
            log?.payload.outcome === 'completed'
              ? 'Completed'
              : isToday
                ? 'Open'
                : 'Missed';

          return (
            <div key={localDate} className={styles.occurrence}>
              <div className={styles.occurrenceSummary}>
                <span>{formatDate(localDate)}</span>
                <span>{status}</span>
                {!isToday && log?.payload.outcome !== 'completed' ? (
                  <Button
                    className={styles.noteButton}
                    onPress={() => setReasonDate(localDate)}
                  >
                    {log?.payload.reason ? 'Edit note' : 'Add note'}
                  </Button>
                ) : null}
              </div>
              {log?.payload.reason ? (
                <p className={styles.reason}>{log.payload.reason}</p>
              ) : null}
              {reasonDate === localDate ? (
                <MissReason
                  habit={habit}
                  localDate={localDate}
                  existingReason={log?.payload.reason ?? null}
                  onDone={() => setReasonDate(null)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <Button className={styles.archiveButton} onPress={archive}>
        Archive habit
      </Button>
    </div>
  );
}

function HabitManager({
  habits,
  logs,
  today,
  onClose,
}: {
  habits: HabitDocument[];
  logs: HabitLogDocument[];
  today: string;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const selectedHabit = habits.find(({ id }) => id === selectedId);
  const visibleHabits = habits.filter(
    ({ payload }) => showArchived || !payload.archivedAt,
  );

  const startNewHabit = () => {
    setSelectedId(null);
    setIsEditing(true);
  };

  const restore = async (habitId: string) => {
    await setHabitArchived(habitId, false);
  };

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Manage habits"
      >
        <div className={styles.dialogHeader}>
          <div>
            <p>Daily rhythm</p>
            <h2>Habits</h2>
          </div>
          <Button
            className={styles.closeButton}
            aria-label="Close habit manager"
            onPress={onClose}
          >
            ×
          </Button>
        </div>

        {isEditing ? (
          <HabitForm
            habit={selectedHabit}
            onSaved={(habitId) => {
              setSelectedId(habitId);
              setIsEditing(false);
            }}
            onCancel={() => setIsEditing(false)}
          />
        ) : selectedHabit ? (
          <HabitDetails
            habit={selectedHabit}
            logs={logs}
            today={today}
            onEdit={() => setIsEditing(true)}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <div className={styles.managerList}>
            <div className={styles.managerActions}>
              <Button className={styles.primaryButton} onPress={startNewHabit}>
                Add a habit
              </Button>
              {habits.some(({ payload }) => payload.archivedAt) ? (
                <Button
                  className={styles.textButton}
                  onPress={() => setShowArchived((visible) => !visible)}
                >
                  {showArchived ? 'Hide archived' : 'Show archived'}
                </Button>
              ) : null}
            </div>
            {visibleHabits.length === 0 ? (
              <p className={styles.emptyManager}>
                A small habit can be enough to begin.
              </p>
            ) : (
              <div className={styles.manageHabitList}>
                {visibleHabits.map((habit) =>
                  habit.payload.archivedAt ? (
                    <div key={habit.id} className={styles.archivedHabit}>
                      <span>{habit.payload.name}</span>
                      <Button
                        className={styles.noteButton}
                        onPress={() => restore(habit.id)}
                      >
                        Restore
                      </Button>
                    </div>
                  ) : (
                    <Button
                      key={habit.id}
                      className={styles.manageHabitButton}
                      onPress={() => setSelectedId(habit.id)}
                    >
                      <span>{habit.payload.name}</span>
                      <span aria-hidden="true">→</span>
                    </Button>
                  ),
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export function HabitList() {
  const [isManaging, setIsManaging] = useState(false);
  const data = useLiveQuery(habitDocuments, []) ?? { habits: [], logs: [] };
  const today = localDateFor(new Date());
  const activeHabits = data.habits.filter(({ payload }) => !payload.archivedAt);
  const todaysHabits = activeHabits.filter(({ payload }) =>
    scheduledOn(payload.weekdays, today),
  );
  const completedHabitIds = new Set(
    data.logs
      .filter(
        ({ payload }) =>
          payload.localDate === today && payload.outcome === 'completed',
      )
      .map(({ payload }) => payload.habitId),
  );

  return (
    <>
      <section className={styles.section} aria-labelledby="today-habits">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>A gentle rhythm</p>
            <h2 id="today-habits">Today’s habits</h2>
          </div>
          <Button
            className={styles.manageButton}
            onPress={() => setIsManaging(true)}
          >
            Manage
          </Button>
        </div>
        {todaysHabits.length === 0 ? (
          <p className={styles.emptyToday}>
            {activeHabits.length === 0
              ? 'No habits yet. Begin with something kind and small.'
              : 'Nothing is scheduled for today.'}
          </p>
        ) : (
          <div className={styles.todayList}>
            {todaysHabits.map((habit) => {
              const isCompleted = completedHabitIds.has(habit.id);

              return (
                <Button
                  key={habit.id}
                  className={styles.todayHabit}
                  aria-pressed={isCompleted}
                  onPress={() =>
                    setHabitCompleted(habit.id, today, !isCompleted)
                  }
                >
                  <span className={styles.completionMark} aria-hidden="true">
                    {isCompleted ? '✓' : ''}
                  </span>
                  <span className={styles.habitName}>{habit.payload.name}</span>
                  {habit.payload.reminderTime ? (
                    <span className={styles.reminderTime}>
                      {formatReminder(habit.payload.reminderTime)}
                    </span>
                  ) : null}
                </Button>
              );
            })}
          </div>
        )}
      </section>
      {isManaging ? (
        <HabitManager
          habits={data.habits}
          logs={data.logs}
          today={today}
          onClose={() => setIsManaging(false)}
        />
      ) : null}
    </>
  );
}
