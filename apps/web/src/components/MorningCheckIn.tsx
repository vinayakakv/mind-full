import type { CheckInDocument, CheckInPayload } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAtom } from 'jotai';
import { useState } from 'react';
import { Button, TextArea } from 'react-aria-components';

import {
  documentTable,
  getOrCreateMorningCheckIn,
  updateCheckIn,
} from '../data/documents';
import { activeCheckInIdAtom } from '../state/check-in';
import styles from './MorningCheckIn.module.css';

const energyChoices = ['Low', 'Steady', 'Bright'] as const;
const moodChoices = ['Heavy', 'Neutral', 'At ease'] as const;

const updateResponse = (
  payload: CheckInPayload,
  response: CheckInPayload['responses'][number],
): CheckInPayload => ({
  ...payload,
  responses: [
    ...payload.responses.filter(
      ({ promptId }) => promptId !== response.promptId,
    ),
    response,
  ],
});

function ArrivalStep({ checkIn }: { checkIn: CheckInDocument }) {
  const continueCheckIn = async () => {
    await updateCheckIn(checkIn.id, (payload) => ({
      ...payload,
      currentStep: 1,
    }));
  };

  return (
    <div className={styles.step}>
      <p className={styles.kicker}>Arrive</p>
      <h2>Take one unhurried breath.</h2>
      <p className={styles.supporting}>Nothing needs to be fixed right now.</p>
      <div className={styles.primaryActions}>
        <Button className={styles.primaryButton} onPress={continueCheckIn}>
          I'm here
        </Button>
        <Button className={styles.textButton} onPress={continueCheckIn}>
          Skip
        </Button>
      </div>
    </div>
  );
}

function FeelingStep({ checkIn }: { checkIn: CheckInDocument }) {
  const [energy, setEnergy] = useState(checkIn.payload.energy);
  const [mood, setMood] = useState(checkIn.payload.mood);

  const saveAndContinue = async (skipped = false) => {
    await updateCheckIn(checkIn.id, (payload) => ({
      ...payload,
      energy: skipped ? null : energy,
      mood: skipped ? null : mood,
      currentStep: 2,
    }));
  };

  return (
    <div className={styles.step}>
      <p className={styles.kicker}>Notice</p>
      <h2>How are you arriving?</h2>
      <ChoiceRow
        label="Energy"
        choices={energyChoices}
        selected={energy}
        onSelect={setEnergy}
      />
      <ChoiceRow
        label="Mood"
        choices={moodChoices}
        selected={mood}
        onSelect={setMood}
      />
      <div className={styles.primaryActions}>
        <Button
          className={styles.primaryButton}
          onPress={() => saveAndContinue()}
        >
          Continue
        </Button>
        <Button
          className={styles.textButton}
          onPress={() => saveAndContinue(true)}
        >
          Skip
        </Button>
      </div>
    </div>
  );
}

function ChoiceRow({
  label,
  choices,
  selected,
  onSelect,
}: {
  label: string;
  choices: readonly string[];
  selected: string | null;
  onSelect: (choice: string) => void;
}) {
  return (
    <fieldset className={styles.choiceGroup}>
      <legend>{label}</legend>
      <div className={styles.choices}>
        {choices.map((choice) => (
          <Button
            key={choice}
            className={styles.choice}
            aria-pressed={selected === choice}
            onPress={() => onSelect(choice)}
          >
            {choice}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

function GratitudeStep({ checkIn }: { checkIn: CheckInDocument }) {
  const existingResponse = checkIn.payload.responses.find(
    ({ promptId }) => promptId === 'morning-good',
  );
  const [answer, setAnswer] = useState(existingResponse?.answer ?? '');

  const finish = async (skipped = false) => {
    const now = new Date().toISOString();

    await updateCheckIn(checkIn.id, (payload) => ({
      ...updateResponse(payload, {
        promptId: 'morning-good',
        promptText: 'What is one good thing already present?',
        source: 'curated',
        answer: skipped ? null : answer.trim() || null,
        skipped,
      }),
      currentStep: 3,
      status: 'completed',
      completedAt: now,
    }));
  };

  return (
    <div className={styles.step}>
      <p className={styles.kicker}>Appreciate</p>
      <h2>What is one good thing already present?</h2>
      <TextArea
        className={styles.reflection}
        value={answer}
        onChange={(event) => setAnswer(event.currentTarget.value)}
        placeholder="A person, a place, a small moment…"
        aria-label="One good thing already present"
      />
      <div className={styles.primaryActions}>
        <Button className={styles.primaryButton} onPress={() => finish()}>
          Complete check-in
        </Button>
        <Button className={styles.textButton} onPress={() => finish(true)}>
          Skip
        </Button>
      </div>
    </div>
  );
}

function CompletionStep({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.step}>
      <p className={styles.kicker}>For today</p>
      <h2>You have arrived.</h2>
      <p className={styles.supporting}>
        Carry forward only what deserves your attention.
      </p>
      <Button className={styles.primaryButton} onPress={onClose}>
        Return to today
      </Button>
    </div>
  );
}

export function MorningCheckIn() {
  const [activeCheckInId, setActiveCheckInId] = useAtom(activeCheckInIdAtom);
  const activeDocument = useLiveQuery(
    async () => (activeCheckInId ? documentTable().get(activeCheckInId) : null),
    [activeCheckInId],
  );
  const checkIn =
    activeDocument?.type === 'check-in' ? activeDocument : undefined;

  if (!activeCheckInId) {
    return null;
  }

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Morning check-in"
      >
        <div className={styles.dialogHeader}>
          <span>Morning check-in</span>
          <Button
            className={styles.closeButton}
            aria-label="Close check-in"
            onPress={() => setActiveCheckInId(null)}
          >
            ×
          </Button>
        </div>
        <div className={styles.progress} aria-hidden="true">
          <span
            style={{
              width: `${((checkIn?.payload.currentStep ?? 0) / 3) * 100}%`,
            }}
          />
        </div>
        {checkIn ? (
          <div key={checkIn.payload.currentStep} className={styles.stepFrame}>
            {checkIn.payload.currentStep === 0 ? (
              <ArrivalStep checkIn={checkIn} />
            ) : null}
            {checkIn.payload.currentStep === 1 ? (
              <FeelingStep checkIn={checkIn} />
            ) : null}
            {checkIn.payload.currentStep === 2 ? (
              <GratitudeStep checkIn={checkIn} />
            ) : null}
            {checkIn.payload.currentStep >= 3 ? (
              <CompletionStep onClose={() => setActiveCheckInId(null)} />
            ) : null}
          </div>
        ) : (
          <p className={styles.loading}>Opening a quiet space…</p>
        )}
      </section>
    </div>
  );
}

export const openMorningCheckIn = async (
  setActiveCheckInId: (id: string) => void,
): Promise<void> => {
  const checkIn = await getOrCreateMorningCheckIn();
  setActiveCheckInId(checkIn.id);
};
