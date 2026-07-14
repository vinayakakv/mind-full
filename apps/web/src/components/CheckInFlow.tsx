import type {
  CheckInDocument,
  CheckInKind,
  CheckInPayload,
} from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAtom } from 'jotai';
import { useState } from 'react';
import { Button, TextArea } from 'react-aria-components';

import {
  documentTable,
  getOrCreateCheckIn,
  updateCheckIn,
} from '../data/documents';
import { activeCheckInIdAtom } from '../state/check-in';
import styles from './CheckInFlow.module.css';

const morningEnergyChoices = ['Low', 'Steady', 'Restless', 'Bright'] as const;
const morningMoodChoices = ['Tender', 'Even', 'Hopeful', 'Light'] as const;
const eveningMoodChoices = ['Heavy', 'Tender', 'Content', 'At ease'] as const;
const stressChoices = ['Quiet', 'Present', 'High'] as const;
const emotionChoices = [
  'Calm',
  'Grateful',
  'Hopeful',
  'Joyful',
  'Tender',
  'Tired',
  'Restless',
  'Sad',
  'Anxious',
  'Frustrated',
  'Lonely',
  'Unsure',
] as const;

const kindName = (kind: CheckInKind): string =>
  kind === 'morning' ? 'Morning' : 'Evening';

const completionStepFor = (checkIn: CheckInDocument): number =>
  checkIn.payload.responses.length + 4;

const moveToStep = async (
  checkIn: CheckInDocument,
  currentStep: number,
): Promise<void> => {
  await updateCheckIn(checkIn.id, (payload) => ({ ...payload, currentStep }));
};

function StepActions({
  checkIn,
  onContinue,
  onSkip,
  canContinue = true,
}: {
  checkIn: CheckInDocument;
  onContinue: () => Promise<void>;
  onSkip?: () => Promise<void>;
  canContinue?: boolean;
}) {
  return (
    <div className={styles.actions}>
      <Button
        className={styles.primaryButton}
        isDisabled={!canContinue}
        onPress={onContinue}
      >
        Continue
      </Button>
      {onSkip ? (
        <Button className={styles.textButton} onPress={onSkip}>
          Skip
        </Button>
      ) : null}
      {checkIn.payload.currentStep > 0 ? (
        <Button
          className={styles.backButton}
          onPress={() => moveToStep(checkIn, checkIn.payload.currentStep - 1)}
        >
          Back
        </Button>
      ) : null}
    </div>
  );
}

function ArrivalStep({ checkIn }: { checkIn: CheckInDocument }) {
  const isMorning = checkIn.payload.kind === 'morning';

  return (
    <div className={styles.step}>
      <p className={styles.kicker}>{isMorning ? 'Arrive' : 'Settle'}</p>
      <h2>
        {isMorning
          ? 'Take one unhurried breath.'
          : 'Let the day soften around you.'}
      </h2>
      <p className={styles.supporting}>
        {isMorning
          ? 'Nothing needs to be fixed right now.'
          : 'You do not need to carry everything into the night.'}
      </p>
      <div className={styles.actions}>
        <Button
          className={styles.primaryButton}
          onPress={() => moveToStep(checkIn, 1)}
        >
          {isMorning ? "I'm here" : "I'm ready"}
        </Button>
        <Button
          className={styles.textButton}
          onPress={() => moveToStep(checkIn, 1)}
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

function FeelingStep({ checkIn }: { checkIn: CheckInDocument }) {
  const isMorning = checkIn.payload.kind === 'morning';
  const [mood, setMood] = useState(checkIn.payload.mood);
  const [energy, setEnergy] = useState(checkIn.payload.energy);
  const [stress, setStress] = useState(checkIn.payload.stress);

  const save = async (isSkipped: boolean) => {
    await updateCheckIn(checkIn.id, (payload) => ({
      ...payload,
      mood: isSkipped ? null : mood,
      energy: isMorning && !isSkipped ? energy : null,
      stress: !isMorning && !isSkipped ? stress : null,
      currentStep: 2,
    }));
  };

  const hasSelection = isMorning
    ? mood !== null || energy !== null
    : mood !== null || stress !== null;

  return (
    <div className={styles.step}>
      <p className={styles.kicker}>Notice</p>
      <h2>{isMorning ? 'How are you arriving?' : 'How does the day feel?'}</h2>
      {isMorning ? (
        <ChoiceRow
          label="Energy"
          choices={morningEnergyChoices}
          selected={energy}
          onSelect={setEnergy}
        />
      ) : (
        <ChoiceRow
          label="Stress"
          choices={stressChoices}
          selected={stress}
          onSelect={setStress}
        />
      )}
      <ChoiceRow
        label="Mood"
        choices={isMorning ? morningMoodChoices : eveningMoodChoices}
        selected={mood}
        onSelect={setMood}
      />
      <StepActions
        checkIn={checkIn}
        canContinue={hasSelection}
        onContinue={() => save(false)}
        onSkip={() => save(true)}
      />
    </div>
  );
}

function EmotionsStep({ checkIn }: { checkIn: CheckInDocument }) {
  const [emotions, setEmotions] = useState(checkIn.payload.emotions);

  const toggleEmotion = (emotion: string) => {
    setEmotions((selected) =>
      selected.includes(emotion)
        ? selected.filter((candidate) => candidate !== emotion)
        : [...selected, emotion],
    );
  };

  const save = async (isSkipped: boolean) => {
    await updateCheckIn(checkIn.id, (payload) => ({
      ...payload,
      emotions: isSkipped ? [] : emotions,
      currentStep: 3,
    }));
  };

  return (
    <div className={styles.step}>
      <p className={styles.kicker}>Name</p>
      <h2>What is here with you?</h2>
      <p className={styles.supporting}>Choose as many words as feel true.</p>
      <fieldset className={styles.emotions}>
        <legend className={styles.visuallyHidden}>Emotion words</legend>
        {emotionChoices.map((emotion) => (
          <Button
            key={emotion}
            className={styles.choice}
            aria-pressed={emotions.includes(emotion)}
            onPress={() => toggleEmotion(emotion)}
          >
            {emotion}
          </Button>
        ))}
      </fieldset>
      <StepActions
        checkIn={checkIn}
        canContinue={emotions.length > 0}
        onContinue={() => save(false)}
        onSkip={() => save(true)}
      />
    </div>
  );
}

const promptKicker = (promptId: string): string => {
  if (promptId.includes('appreciate') || promptId === 'morning-good')
    return 'Appreciate';
  if (promptId.includes('acknowledge')) return 'Acknowledge';
  if (promptId.includes('release')) return 'Release';
  return 'Focus';
};

const updateResponse = (
  payload: CheckInPayload,
  response: CheckInPayload['responses'][number],
): CheckInPayload => ({
  ...payload,
  responses: payload.responses.map((candidate) =>
    candidate.promptId === response.promptId ? response : candidate,
  ),
});

function PromptStep({
  checkIn,
  responseIndex,
}: {
  checkIn: CheckInDocument;
  responseIndex: number;
}) {
  const response = checkIn.payload.responses[responseIndex];
  const [answer, setAnswer] = useState(response?.answer ?? '');

  if (!response) {
    return null;
  }

  const save = async (isSkipped: boolean) => {
    await updateCheckIn(checkIn.id, (payload) => ({
      ...updateResponse(payload, {
        ...response,
        answer: isSkipped ? null : answer.trim(),
        skipped: isSkipped,
      }),
      currentStep: payload.currentStep + 1,
    }));
  };

  return (
    <div className={styles.step}>
      <p className={styles.kicker}>{promptKicker(response.promptId)}</p>
      <h2>{response.promptText}</h2>
      {response.source === 'ai' ? (
        <p className={styles.aiLabel}>A question prepared by Mindfull</p>
      ) : null}
      <TextArea
        className={styles.reflection}
        value={answer}
        onChange={(event) => setAnswer(event.currentTarget.value)}
        placeholder="A few words are enough…"
        aria-label={response.promptText}
      />
      <StepActions
        checkIn={checkIn}
        canContinue={answer.trim().length > 0}
        onContinue={() => save(false)}
        onSkip={() => save(true)}
      />
    </div>
  );
}

function ReflectionStep({ checkIn }: { checkIn: CheckInDocument }) {
  const [reflection, setReflection] = useState(
    checkIn.payload.reflectionMarkdown ?? '',
  );

  const finish = async (isSkipped: boolean) => {
    const now = new Date().toISOString();

    await updateCheckIn(checkIn.id, (payload) => ({
      ...payload,
      reflectionMarkdown: isSkipped ? null : reflection.trim() || null,
      currentStep: completionStepFor(checkIn),
      status: 'completed',
      completedAt: now,
    }));
  };

  return (
    <div className={styles.step}>
      <p className={styles.kicker}>Anything else</p>
      <h2>Is there anything you would like to leave here?</h2>
      <p className={styles.supporting}>Optional, and just for you.</p>
      <TextArea
        className={styles.reflection}
        value={reflection}
        onChange={(event) => setReflection(event.currentTarget.value)}
        placeholder="Write freely…"
        aria-label="Optional reflection"
      />
      <div className={styles.actions}>
        <Button className={styles.primaryButton} onPress={() => finish(false)}>
          Complete check-in
        </Button>
        <Button className={styles.textButton} onPress={() => finish(true)}>
          Skip
        </Button>
        <Button
          className={styles.backButton}
          onPress={() => moveToStep(checkIn, checkIn.payload.currentStep - 1)}
        >
          Back
        </Button>
      </div>
    </div>
  );
}

function CompletionStep({
  checkIn,
  onClose,
}: {
  checkIn: CheckInDocument;
  onClose: () => void;
}) {
  const isMorning = checkIn.payload.kind === 'morning';

  return (
    <div className={styles.step}>
      <p className={styles.kicker}>{isMorning ? 'For today' : 'For tonight'}</p>
      <h2>
        {isMorning ? 'You have made a little room.' : 'The day can rest here.'}
      </h2>
      <p className={styles.supporting}>
        {isMorning
          ? 'Carry forward only what deserves your attention.'
          : 'What was good mattered. What was hard can be held gently.'}
      </p>
      <div className={styles.actions}>
        <Button className={styles.primaryButton} onPress={onClose}>
          Return to today
        </Button>
        <Button
          className={styles.textButton}
          onPress={() => moveToStep(checkIn, 1)}
        >
          Review answers
        </Button>
      </div>
    </div>
  );
}

function ActiveStep({
  checkIn,
  onClose,
}: {
  checkIn: CheckInDocument;
  onClose: () => void;
}) {
  const { currentStep, responses } = checkIn.payload;
  const firstPromptStep = 3;
  const reflectionStep = firstPromptStep + responses.length;

  if (currentStep === 0) return <ArrivalStep checkIn={checkIn} />;
  if (currentStep === 1) return <FeelingStep checkIn={checkIn} />;
  if (currentStep === 2) return <EmotionsStep checkIn={checkIn} />;
  if (currentStep === reflectionStep)
    return <ReflectionStep checkIn={checkIn} />;
  if (currentStep >= completionStepFor(checkIn))
    return <CompletionStep checkIn={checkIn} onClose={onClose} />;

  return (
    <PromptStep
      checkIn={checkIn}
      responseIndex={currentStep - firstPromptStep}
    />
  );
}

export function CheckInFlow() {
  const [activeCheckInId, setActiveCheckInId] = useAtom(activeCheckInIdAtom);
  const activeDocument = useLiveQuery(
    async () => (activeCheckInId ? documentTable().get(activeCheckInId) : null),
    [activeCheckInId],
  );
  const checkIn =
    activeDocument?.type === 'check-in' ? activeDocument : undefined;

  if (!activeCheckInId) return null;

  const close = () => setActiveCheckInId(null);
  const label = checkIn
    ? `${kindName(checkIn.payload.kind)} check-in`
    : 'Check-in';

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <div className={styles.dialogHeader}>
          <span>{label}</span>
          <Button
            className={styles.closeButton}
            aria-label="Close check-in"
            onPress={close}
          >
            ×
          </Button>
        </div>
        <div className={styles.progress} aria-hidden="true">
          <span
            style={{
              width: `${((checkIn?.payload.currentStep ?? 0) / (checkIn ? completionStepFor(checkIn) : 1)) * 100}%`,
            }}
          />
        </div>
        {checkIn ? (
          <div
            key={`${checkIn.id}:${checkIn.payload.currentStep}`}
            className={styles.stepFrame}
          >
            <ActiveStep checkIn={checkIn} onClose={close} />
          </div>
        ) : (
          <p className={styles.loading}>Opening a quiet space…</p>
        )}
      </section>
    </div>
  );
}

export const openCheckIn = async (
  kind: CheckInKind,
  setActiveCheckInId: (id: string) => void,
): Promise<void> => {
  const checkIn = await getOrCreateCheckIn(kind);
  const completionStep = completionStepFor(checkIn);
  const document =
    checkIn.payload.status === 'completed' &&
    checkIn.payload.currentStep !== completionStep
      ? await updateCheckIn(checkIn.id, (payload) => ({
          ...payload,
          currentStep: completionStep,
        }))
      : checkIn;

  setActiveCheckInId(document.id);
};
