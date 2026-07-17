import {
  createCheckInDocument,
  createJournalDocument,
  type DomainDocument,
} from '@mindfull/domain';
import { z } from 'zod';

const timestampSchema = z.number().finite().nonnegative();

const attributedRunSchema = z.object({
  text: z.string(),
  attributes: z
    .object({
      blockPresentation: z
        .object({
          components: z.array(
            z.object({
              type: z.string().optional(),
              level: z.number().optional(),
            }),
          ),
        })
        .optional(),
    })
    .passthrough()
    .optional(),
});

const attributedTextSchema = z
  .object({ runs: z.array(attributedRunSchema) })
  .optional();

const stoicAnswerSchema = z.object({
  uuid: z.string().min(1),
  question: z.string().min(1),
  timestamp: timestampSchema,
  text: z.string().default(''),
  attributedText: attributedTextSchema,
});

const stoicJournalSchema = z.object({
  uuid: z.string().min(1),
  timestamp: timestampSchema,
  calendarDate: z.string().optional(),
  answers: z.array(z.string()).default([]),
  template: z.string().nullable().optional(),
  text: z.string().default(''),
  attributedText: attributedTextSchema,
  isCompleted: z.boolean().optional(),
});

const stoicRoutineSchema = z.object({
  uuid: z.string().min(1),
  timestamp: timestampSchema,
  type: z.enum(['morning', 'evening']),
  date: z.string().optional(),
  answers: z.array(z.string()).default([]),
  isCompleted: z.boolean().optional(),
});

const stoicQuestionSchema = z
  .object({
    uuid: z.string().min(1),
    text: z.unknown().optional(),
    question: z.unknown().optional(),
    title: z.unknown().optional(),
  })
  .passthrough();

export const stoicExportSchema = z.object({
  manifest: z.object({
    appVersion: z.string().optional(),
    os: z.string().optional(),
  }),
  journals: z.array(stoicJournalSchema),
  routines: z.array(stoicRoutineSchema),
  answers: z.array(stoicAnswerSchema),
  questions: z.array(stoicQuestionSchema).default([]),
});

export type StoicExport = z.infer<typeof stoicExportSchema>;

export type StoicImport = {
  documents: DomainDocument[];
  warnings: string[];
  counts: {
    journals: number;
    checkIns: number;
  };
  source: {
    appVersion: string | null;
    os: string | null;
  };
};

type StoicAnswer = z.infer<typeof stoicAnswerSchema>;
type StoicJournal = z.infer<typeof stoicJournalSchema>;
type StoicRoutine = z.infer<typeof stoicRoutineSchema>;

type CheckInSource = {
  uuid: string;
  timestamp: number;
  localDate: string;
  kind: 'morning' | 'evening' | null;
  answerIds: string[];
};

const dailyCheckInTemplateId = '3ddd4e33-5c74-401a-a293-eed747d889ba';
const dreamJournalTemplateId = '0dc71763-c9f1-4b8b-b849-84c0044744da';
const moodQuestionId = '14e2ee8a-6ba0-4429-ad65-b930658a367c';

const knownQuestions: Readonly<Record<string, string>> = {
  [moodQuestionId]: 'How were you feeling?',
  '01ae8ffb-6f03-4826-a8e1-76b0f18049b1': 'How rested do you feel?',
  'ffec5c36-d6f0-40ac-ae9a-3ad08f7d69db': 'What deserves your focus today?',
  'f896b5df-08a0-44f5-aec8-36fafcc4c9c2': 'How did you sleep?',
  'a29747df-f2a6-4fdc-8f2e-b1a5459b6205': 'What are you grateful for?',
  '2afc45da-04f0-42cd-84ef-52abb96f01fa':
    'What is one thing you want to accomplish today?',
  'dd8b7043-baad-46f2-a6ca-fb64852eaae8': 'How motivated do you feel?',
  'ff4855f1-fa40-42d3-b403-dcb00fabeb40': 'How was your day overall?',
  'eb6e9bd7-1f2e-4111-b4f9-8bf54cd426dc': 'What was the best part of your day?',
  '7c8d5124-5c69-488b-8458-dc168b1b8633': 'What challenged you today?',
  '3853ae04-bc3c-49dd-af6d-ae4d27f9362b': 'What are you grateful for today?',
  '38bd1ecc-7148-4eba-ac67-60eb39aab30a': 'What would you like to release?',
  '8b5b787d-d8d8-4d43-bfbc-cc7062ac3d04': 'Was today a good day?',
  'b2d0aa86-b52b-46fd-bdf3-4a54a8baa7af': 'What happened in your dream?',
  'dd0cf7fe-2631-488c-8b12-17a70bb9dddf': 'How did you feel when you woke up?',
  '4f0957bf-f1c9-4306-a197-f5b6ac4aac2b':
    'Would you like to add anything else?',
  '6f965da7-93bf-4e7c-ba64-158fea930e04': 'What might this dream mean to you?',
  'cacd5a93-0b06-4a49-aeb5-c20a99634bd5':
    'Was reflecting on this dream helpful?',
};

const moodLabels: Readonly<Record<string, string>> = {
  '0': 'Bad',
  '1': 'Not great',
  '2': 'Okay',
  '3': 'Good',
  '4': 'Great',
};

const instantFor = (timestamp: number): string =>
  new Date(timestamp).toISOString();

const localDateFromStoic = (
  calendarDate: string | undefined,
  timestamp: number,
  timezone: string,
): string => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(calendarDate ?? '');
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((value) => value.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
};

const localHour = (timestamp: number, timezone: string): number =>
  Number(
    new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(timestamp))
      .find((part) => part.type === 'hour')?.value,
  );

const answerText = (answer: StoicAnswer): string => {
  const attributed = answer.attributedText?.runs
    .map((run) => run.text)
    .join('')
    .trim();
  return attributed || answer.text.trim();
};

const hasLevelOneHeading = (
  run: z.infer<typeof attributedRunSchema>,
): boolean =>
  run.attributes?.blockPresentation?.components.some(
    (component) => component.type === 'header' && component.level === 1,
  ) ?? false;

export const journalTitleAndBody = (
  journal: Pick<StoicJournal, 'text' | 'attributedText'>,
): { title: string | null; body: string } => {
  const attributedTitle = journal.attributedText?.runs
    .filter(hasLevelOneHeading)
    .map((run) => run.text)
    .join('')
    .trim();
  const firstNewline = journal.text.indexOf('\n');

  if (attributedTitle) {
    const body =
      firstNewline >= 0
        ? journal.text.slice(firstNewline + 1).trim()
        : journal.text.slice(attributedTitle.length).trim();
    return { title: attributedTitle, body };
  }

  if (firstNewline >= 0) {
    const title = journal.text.slice(0, firstNewline).trim();
    return {
      title: title || null,
      body: journal.text.slice(firstNewline + 1).trim(),
    };
  }

  return { title: null, body: journal.text.trim() };
};

const customQuestionLabels = (
  questions: StoicExport['questions'],
): Map<string, string> =>
  new Map(
    questions.flatMap((question) => {
      const label = [question.text, question.question, question.title].find(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0,
      );
      return label ? [[question.uuid, label.trim()]] : [];
    }),
  );

const promptFor = (
  questionId: string,
  customLabels: Map<string, string>,
  unknownQuestionIds: Set<string>,
): string => {
  const prompt = customLabels.get(questionId) ?? knownQuestions[questionId];
  if (prompt) return prompt;
  unknownQuestionIds.add(questionId);
  return 'Imported reflection';
};

const answersFor = (
  answerIds: string[],
  answersById: Map<string, StoicAnswer>,
): StoicAnswer[] => answerIds.flatMap((id) => answersById.get(id) ?? []);

const guidedJournalMarkdown = (
  journal: StoicJournal,
  answersById: Map<string, StoicAnswer>,
  customLabels: Map<string, string>,
  unknownQuestionIds: Set<string>,
): string => {
  const responses = answersFor(journal.answers, answersById).map((answer) => {
    const prompt = promptFor(answer.question, customLabels, unknownQuestionIds);
    return `## ${prompt}\n\n${answerText(answer)}`.trim();
  });
  const freeText = journal.text.trim();
  return [...responses, ...(freeText ? [freeText] : [])].join('\n\n');
};

const journalTitle = (templateId: string | null | undefined): string =>
  templateId === dreamJournalTemplateId
    ? 'Dream Journal'
    : 'Imported guided journal';

const checkInSources = (
  routines: StoicRoutine[],
  journals: StoicJournal[],
  timezone: string,
): CheckInSource[] => {
  const routineSources: CheckInSource[] = routines
    .filter((routine) => routine.answers.length > 0)
    .map((routine) => ({
      uuid: routine.uuid,
      timestamp: routine.timestamp,
      localDate: localDateFromStoic(routine.date, routine.timestamp, timezone),
      kind: routine.type,
      answerIds: routine.answers,
    }));
  const dailySources = journals
    .filter(
      (journal) =>
        journal.template === dailyCheckInTemplateId &&
        journal.answers.length > 0,
    )
    .map((journal): CheckInSource => {
      const localDate = localDateFromStoic(
        journal.calendarDate,
        journal.timestamp,
        timezone,
      );
      const closestRoutine = routineSources
        .filter((routine) => routine.localDate === localDate)
        .sort(
          (left, right) =>
            Math.abs(left.timestamp - journal.timestamp) -
            Math.abs(right.timestamp - journal.timestamp),
        )[0];

      return {
        uuid: journal.uuid,
        timestamp: journal.timestamp,
        localDate,
        kind:
          closestRoutine?.kind ??
          (localHour(journal.timestamp, timezone) < 15 ? 'morning' : 'evening'),
        answerIds: journal.answers,
      };
    });

  return [...routineSources, ...dailySources];
};

const groupedCheckInSources = (sources: CheckInSource[]): CheckInSource[][] => {
  const groups = new Map<string, CheckInSource[]>();
  for (const source of sources) {
    if (!source.kind) continue;
    const key = `${source.localDate}:${source.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }
  return [...groups.values()].map((group) =>
    [...group].sort(
      (left, right) =>
        left.timestamp - right.timestamp || left.uuid.localeCompare(right.uuid),
    ),
  );
};

const isOpaqueChoiceAnswer = (text: string): boolean =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .every((part) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        part,
      ),
    );

export const convertStoicExport = (
  input: unknown,
  options: { timezone: string; deviceId?: string },
): StoicImport => {
  const source = stoicExportSchema.parse(input);
  const deviceId = options.deviceId ?? 'stoic-import';
  const answersById = new Map(
    source.answers.map((answer) => [answer.uuid, answer]),
  );
  const customLabels = customQuestionLabels(source.questions);
  const unknownQuestionIds = new Set<string>();
  const opaqueChoiceQuestionIds = new Set<string>();

  const journals = source.journals
    .filter((journal) => journal.template !== dailyCheckInTemplateId)
    .flatMap((journal) => {
      const occurredAt = instantFor(journal.timestamp);
      const localDate = localDateFromStoic(
        journal.calendarDate,
        journal.timestamp,
        options.timezone,
      );

      if (journal.template) {
        const markdown = guidedJournalMarkdown(
          journal,
          answersById,
          customLabels,
          unknownQuestionIds,
        );
        if (!markdown) return [];
        return [
          createJournalDocument({
            id: `stoic:journal:${journal.uuid}`,
            now: occurredAt,
            deviceId,
            occurredAt,
            payload: {
              title: journalTitle(journal.template),
              markdown,
              localDate,
              timezone: options.timezone,
              status: 'completed',
              completedAt: occurredAt,
            },
          }),
        ];
      }

      const { title, body } = journalTitleAndBody(journal);
      if (!title && !body) return [];
      const hasValidTitle = title !== null && title.length <= 200;
      const markdown = hasValidTitle
        ? body
        : [title, body].filter(Boolean).join('\n\n');
      return [
        createJournalDocument({
          id: `stoic:journal:${journal.uuid}`,
          now: occurredAt,
          deviceId,
          occurredAt,
          payload: {
            title: hasValidTitle ? title : null,
            markdown,
            localDate,
            timezone: options.timezone,
            status: 'completed',
            completedAt: occurredAt,
          },
        }),
      ];
    });

  const checkIns = groupedCheckInSources(
    checkInSources(source.routines, source.journals, options.timezone),
  ).flatMap((group) => {
    const first = group[0];
    if (!first) return [];
    const last = group.at(-1) ?? first;
    const answers = group.flatMap((entry) =>
      answersFor(entry.answerIds, answersById),
    );
    const mood = answers
      .filter((answer) => answer.question === moodQuestionId)
      .map((answer) => moodLabels[answerText(answer)] ?? answerText(answer))
      .filter(Boolean)
      .at(-1);
    const responses = answers
      .filter((answer) => answer.question !== moodQuestionId)
      .map((answer) => {
        const text = answerText(answer);
        if (text && isOpaqueChoiceAnswer(text)) {
          opaqueChoiceQuestionIds.add(answer.question);
        }
        return {
          promptId: `stoic:${answer.question}:${answer.uuid}`,
          promptText: promptFor(
            answer.question,
            customLabels,
            unknownQuestionIds,
          ),
          source: 'curated' as const,
          answer: text || null,
          skipped: !text,
        };
      });
    const occurredAt = instantFor(first.timestamp);
    const completedAt = instantFor(last.timestamp);

    return [
      createCheckInDocument({
        id: `stoic:check-in:${first.uuid}`,
        now: completedAt,
        deviceId,
        occurredAt,
        payload: {
          kind: first.kind ?? 'morning',
          localDate: first.localDate,
          timezone: options.timezone,
          status: 'completed',
          currentStep: responses.length,
          mood: mood ?? null,
          energy: null,
          stress: null,
          emotions: [],
          responses,
          reflectionMarkdown: null,
          completedAt,
        },
      }),
    ];
  });

  const warnings = [
    ...[...unknownQuestionIds].map(
      (id) => `Question ${id} has no exported label.`,
    ),
    ...[...opaqueChoiceQuestionIds].map(
      (id) => `Question ${id} contains choice IDs without exported labels.`,
    ),
  ].sort();
  const documents = [...journals, ...checkIns].sort((left, right) =>
    (left.occurredAt ?? '').localeCompare(right.occurredAt ?? ''),
  );

  return {
    documents,
    warnings,
    counts: { journals: journals.length, checkIns: checkIns.length },
    source: {
      appVersion: source.manifest.appVersion ?? null,
      os: source.manifest.os ?? null,
    },
  };
};
