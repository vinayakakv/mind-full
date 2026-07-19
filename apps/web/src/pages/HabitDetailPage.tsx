import {
  canCorrectHabitDate,
  habitCompletionCount,
  habitOccurrenceStatus,
  habitStreak,
  habitWeeks,
  recentHabitScheduledDates,
} from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Button, Form, Label, TextArea } from 'react-aria-components';
import { Link, useParams } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ActionDialog } from '../components/ui/ActionDialog';
import { loadHabitById, recordHabitMiss } from '../data/habits';
import { localDateFor } from '../data/time';
import { useCurrentTime } from '../hooks/use-current-time';
import habitStyles from './HabitHistory.module.css';
import styles from './HabitsPage.module.css';

const formatDate = (localDate: string): string =>
  new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${localDate}T12:00:00`));

const formatFullDate = (localDate: string): string =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${localDate}T12:00:00`));

export function HabitDetailPage() {
  const { habitId } = useParams();
  const today = localDateFor(useCurrentTime('day'));
  const [noteDate, setNoteDate] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const data = useLiveQuery(
    () =>
      habitId
        ? loadHabitById(habitId).then((result) => result ?? null)
        : Promise.resolve(null),
    [habitId],
  );

  if (data === undefined) return null;

  if (data === null) {
    return (
      <section className={styles.page}>
        <p className={habitStyles.empty}>
          This habit is no longer available.{' '}
          <Link to="/habits">Back to habits</Link>
        </p>
      </section>
    );
  }

  const { habit, logs } = data;
  const startedOn = localDateFor(new Date(habit.createdAt));
  const payloadLogs = logs.map(({ payload }) => payload);
  const streak = habitStreak(habit.payload, payloadLogs, today, startedOn);
  const recent = habitCompletionCount(
    habit.payload,
    payloadLogs,
    today,
    startedOn,
    30,
  );
  const weeks = habitWeeks(habit.payload, payloadLogs, today, startedOn, 12);
  const occurrences = recentHabitScheduledDates(
    habit.payload,
    today,
    startedOn,
    12,
  );
  const chartData = weeks.map((week) => ({
    ...week,
    label: formatDate(week.weekStart),
  }));

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>Habit rhythm</p>
          <h1 className={habitStyles.detailTitle}>{habit.payload.name}</h1>
        </div>
        <Link to="/habits">Back to habits</Link>
      </header>

      <div className={habitStyles.detailActions}>
        <p>
          {habit.payload.weekdays.length === 7
            ? 'Every day'
            : `${habit.payload.weekdays.length} days each week`}
        </p>
        <Link to={`/habits/manage?edit=${encodeURIComponent(habit.id)}`}>
          Edit habit
        </Link>
      </div>

      <section className={habitStyles.stats} aria-label="Habit summary">
        <div>
          <span>Current rhythm</span>
          <strong>{streak}</strong>
          <p>
            scheduled {streak === 1 ? 'completion' : 'completions'} in a row
          </p>
        </div>
        <div>
          <span>Past 30 days</span>
          <strong>
            {recent.completed}
            <small> / {recent.scheduled}</small>
          </strong>
          <p>scheduled days completed</p>
        </div>
      </section>

      <section className={habitStyles.trend} aria-labelledby="habit-trend">
        <div>
          <p>Twelve weeks</p>
          <h2 id="habit-trend">A longer view</h2>
        </div>
        <div
          className={habitStyles.chart}
          role="img"
          aria-label={`Weekly completion percentage for ${habit.payload.name} over twelve weeks`}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={chartData}
              margin={{ top: 16, right: 4, bottom: 0, left: -24 }}
              accessibilityLayer
            >
              <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
              <XAxis
                dataKey="label"
                stroke="var(--text-muted)"
                tickLine={false}
                axisLine={false}
                fontSize={10}
                interval={2}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 50, 100]}
                tickFormatter={(value: number) => `${value}%`}
                stroke="var(--text-muted)"
                tickLine={false}
                axisLine={false}
                fontSize={10}
              />
              <Tooltip
                labelFormatter={(_, entries) => {
                  const entry = entries[0]?.payload as
                    | (typeof chartData)[number]
                    | undefined;
                  return entry
                    ? `${formatFullDate(entry.weekStart)} – ${formatFullDate(entry.weekEnd)}`
                    : '';
                }}
                formatter={(_, __, entry) => {
                  const week = entry.payload as (typeof chartData)[number];
                  return [
                    `${week.completed} of ${week.scheduled} scheduled days`,
                    week.isPartial ? 'Current week' : 'Completed',
                  ];
                }}
                contentStyle={{
                  background: 'var(--surface-canvas)',
                  border: '1px solid var(--border-control)',
                  borderRadius: '0.65rem',
                  color: 'var(--text-primary)',
                  fontSize: '0.75rem',
                }}
              />
              <Bar
                dataKey="percentage"
                fill="var(--accent-calm)"
                radius={[6, 6, 0, 0]}
                isAnimationActive="auto"
              >
                {chartData.map((week) => (
                  <Cell
                    key={week.weekStart}
                    fillOpacity={week.isPartial ? 0.55 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={habitStyles.recent} aria-labelledby="habit-recent">
        <p>Exact record</p>
        <h2 id="habit-recent">Recent scheduled days</h2>
        <div>
          {occurrences.map((localDate) => {
            const log = logs.find(
              ({ payload }) => payload.localDate === localDate,
            );
            const status = habitOccurrenceStatus(
              habit.payload,
              payloadLogs,
              localDate,
              today,
              startedOn,
            );
            const canAddNote =
              status === 'missed' && canCorrectHabitDate(today, localDate);

            return (
              <article key={localDate}>
                <span>{formatFullDate(localDate)}</span>
                <div className={habitStyles.occurrenceState}>
                  <strong>
                    {status === 'open'
                      ? 'Open'
                      : status === 'completed'
                        ? 'Completed'
                        : 'Missed'}
                  </strong>
                  {canAddNote ? (
                    <Button
                      onPress={() => {
                        setNoteDate(localDate);
                        setNote(log?.payload.reason ?? '');
                      }}
                    >
                      {log?.payload.reason ? 'Edit note' : 'Add note'}
                    </Button>
                  ) : null}
                </div>
                {log?.payload.reason ? <p>{log.payload.reason}</p> : null}
              </article>
            );
          })}
        </div>
      </section>

      {noteDate ? (
        <ActionDialog
          eyebrow="Missed day"
          title={formatFullDate(noteDate)}
          onClose={() => setNoteDate(null)}
        >
          <Form
            className={habitStyles.noteForm}
            onSubmit={(event) => {
              event.preventDefault();
              void recordHabitMiss(
                habit.id,
                noteDate,
                note.trim() || null,
              ).then(() => setNoteDate(null));
            }}
          >
            <Label htmlFor="habit-miss-note">Optional note</Label>
            <TextArea
              id="habit-miss-note"
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              placeholder="What made this difficult?"
              autoFocus
            />
            <div>
              <Button type="submit">Save note</Button>
              <Button onPress={() => setNoteDate(null)}>Cancel</Button>
            </div>
          </Form>
        </ActionDialog>
      ) : null}
    </section>
  );
}
