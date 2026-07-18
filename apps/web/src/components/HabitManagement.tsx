import {
  type HabitDocument,
  type HabitLogDocument,
  type HabitSuggestionDocument,
  habitStreak,
  recentScheduledDates,
} from '@mindfull/domain';
import { type DragEvent, useState } from 'react';
import {
  Button,
  Form,
  Input,
  Label,
  TextArea,
  TextField,
} from 'react-aria-components';

import {
  acceptHabitSuggestion,
  createHabit,
  recordHabitMiss,
  reorderHabits,
  setHabitArchived,
  updateHabit,
} from '../data/habits';
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

const startedOn = (habit: HabitDocument): string =>
  localDateFor(new Date(habit.createdAt));

const formatDate = (localDate: string): string =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${localDate}T12:00:00`));

function HabitForm({
  habit,
  suggestion,
  onSaved,
  onCancel,
}: {
  habit: HabitDocument | undefined;
  suggestion: HabitSuggestionDocument | undefined;
  onSaved: (habitId: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(
    habit?.payload.name ?? suggestion?.payload.proposedName ?? '',
  );
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
      : suggestion
        ? await acceptHabitSuggestion(suggestion.id, input)
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
          {habit ? 'Save changes' : suggestion ? 'Add this habit' : 'Add habit'}
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

export function HabitManagement({
  habits,
  logs,
  today,
  suggestion,
  onLeaveSuggestion,
}: {
  habits: HabitDocument[];
  logs: HabitLogDocument[];
  today: string;
  suggestion?: HabitSuggestionDocument;
  onLeaveSuggestion?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(Boolean(suggestion));
  const [showArchived, setShowArchived] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [reorderStatus, setReorderStatus] = useState('');
  const selectedHabit = habits.find(({ id }) => id === selectedId);
  const activeHabits = habits.filter(({ payload }) => !payload.archivedAt);
  const archivedHabits = habits.filter(({ payload }) => payload.archivedAt);
  const startNewHabit = () => {
    setSelectedId(null);
    setIsEditing(true);
  };

  const restore = async (habitId: string) => {
    await setHabitArchived(habitId, false);
  };

  const returnToAllHabits = () => {
    if (suggestion) {
      onLeaveSuggestion?.();
      return;
    }
    setSelectedId(null);
    setIsEditing(false);
  };

  const saveOrder = async (orderedHabitIds: string[], movedName: string) => {
    setIsReordering(true);
    try {
      await reorderHabits(orderedHabitIds);
      setReorderStatus(`${movedName} moved.`);
    } finally {
      setIsReordering(false);
    }
  };

  const moveHabitBy = async (habit: HabitDocument, distance: -1 | 1) => {
    const habitIds = activeHabits.map(({ id }) => id);
    const currentIndex = habitIds.indexOf(habit.id);
    const nextIndex = currentIndex + distance;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= habitIds.length) {
      return;
    }

    const neighborId = habitIds[nextIndex];
    if (!neighborId) return;
    const orderedHabitIds = habitIds.map((id, index) => {
      if (index === currentIndex) return neighborId;
      if (index === nextIndex) return habit.id;
      return id;
    });
    await saveOrder(orderedHabitIds, habit.payload.name);
  };

  const dropHabitOn = async (targetId: string) => {
    if (!draggedId || draggedId === targetId || isReordering) return;

    const habitIds = activeHabits.map(({ id }) => id);
    const draggedIndex = habitIds.indexOf(draggedId);
    const targetIndex = habitIds.indexOf(targetId);
    const movedHabit = activeHabits.find(({ id }) => id === draggedId);
    if (draggedIndex < 0 || targetIndex < 0 || !movedHabit) return;

    const remainingIds = habitIds.filter((id) => id !== draggedId);
    const insertionIndex =
      draggedIndex < targetIndex
        ? remainingIds.indexOf(targetId) + 1
        : remainingIds.indexOf(targetId);
    const orderedHabitIds = [
      ...remainingIds.slice(0, insertionIndex),
      draggedId,
      ...remainingIds.slice(insertionIndex),
    ];

    setDraggedId(null);
    await saveOrder(orderedHabitIds, movedHabit.payload.name);
  };

  const beginDragging = (
    event: DragEvent<HTMLButtonElement>,
    habitId: string,
  ) => {
    setDraggedId(habitId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', habitId);
  };

  return (
    <section className={styles.management} aria-label="Manage habits">
      {(isEditing || selectedHabit) && !suggestion ? (
        <Button className={styles.backButton} onPress={returnToAllHabits}>
          {suggestion ? '← Back to reflect' : '← Back to all habits'}
        </Button>
      ) : null}

      {isEditing ? (
        <HabitForm
          habit={selectedHabit}
          suggestion={suggestion}
          onSaved={(habitId) => {
            if (suggestion) {
              onLeaveSuggestion?.();
              return;
            }
            setSelectedId(habitId);
            setIsEditing(false);
          }}
          onCancel={() => {
            if (suggestion) onLeaveSuggestion?.();
            else setIsEditing(false);
          }}
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
          {activeHabits.length === 0 && !showArchived ? (
            <p className={styles.emptyManager}>
              A small habit can be enough to begin.
            </p>
          ) : (
            <ul className={styles.manageHabitList}>
              {activeHabits.map((habit, index) => {
                const isOpen = reorderingId === habit.id;

                return (
                  <li
                    key={habit.id}
                    className={styles.manageHabitItem}
                    data-dragging={draggedId === habit.id || undefined}
                    onDragOver={(event) => {
                      if (draggedId) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      void dropHabitOn(habit.id);
                    }}
                  >
                    <div className={styles.manageHabitRow}>
                      <button
                        type="button"
                        className={styles.dragHandle}
                        aria-label={`Drag to reorder ${habit.payload.name}`}
                        draggable
                        onDragStart={(event) => beginDragging(event, habit.id)}
                        onDragEnd={() => setDraggedId(null)}
                      >
                        <span aria-hidden="true">≡</span>
                      </button>
                      <Button
                        className={styles.manageHabitButton}
                        onPress={() => setSelectedId(habit.id)}
                      >
                        {habit.payload.name}
                      </Button>
                      <Button
                        className={styles.reorderMenuButton}
                        aria-label={`Reorder ${habit.payload.name}`}
                        aria-expanded={isOpen}
                        aria-controls={`reorder-${habit.id}`}
                        onPress={() =>
                          setReorderingId(isOpen ? null : habit.id)
                        }
                      >
                        <span aria-hidden="true">•••</span>
                      </Button>
                    </div>
                    {isOpen ? (
                      <fieldset
                        id={`reorder-${habit.id}`}
                        className={styles.reorderActions}
                      >
                        <legend className="visually-hidden">
                          Reorder {habit.payload.name}
                        </legend>
                        <Button
                          className={styles.reorderButton}
                          isDisabled={index === 0 || isReordering}
                          onPress={() => void moveHabitBy(habit, -1)}
                        >
                          Move up
                        </Button>
                        <Button
                          className={styles.reorderButton}
                          isDisabled={
                            index === activeHabits.length - 1 || isReordering
                          }
                          onPress={() => void moveHabitBy(habit, 1)}
                        >
                          Move down
                        </Button>
                        <Button
                          className={styles.reorderDoneButton}
                          onPress={() => setReorderingId(null)}
                        >
                          Done
                        </Button>
                      </fieldset>
                    ) : null}
                  </li>
                );
              })}
              {showArchived
                ? archivedHabits.map((habit) => (
                    <li key={habit.id} className={styles.archivedHabit}>
                      <span>{habit.payload.name}</span>
                      <Button
                        className={styles.noteButton}
                        onPress={() => restore(habit.id)}
                      >
                        Restore
                      </Button>
                    </li>
                  ))
                : null}
            </ul>
          )}
          <span className="visually-hidden" aria-live="polite">
            {reorderStatus}
          </span>
        </div>
      )}
    </section>
  );
}
