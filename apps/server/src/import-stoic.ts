import { execFileSync } from 'node:child_process';
import { chmodSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type DomainDocument, parseDomainDocument } from '@mindfull/domain';
import { z } from 'zod';

import { convertStoicExport } from './stoic-import.js';

type Arguments = {
  archivePath: string;
  timezone: string;
  server: string | null;
  outputPath: string | null;
  shouldApply: boolean;
};

const usage = `Usage:
  pnpm import:stoic <stoic-export.zip> --timezone <IANA timezone> [options]

Options:
  --apply          Import documents. Without this flag, no remote writes occur.
  --server <url>   Mindfull server origin. Required with --apply.
  --output <path>  Write the validated Mindfull documents to a private JSON file.
  --help           Show this help.

Applying requires MINDFULL_PAIRING_CODE in the environment.`;

const valueAfter = (arguments_: string[], flag: string): string | null => {
  const index = arguments_.indexOf(flag);
  if (index < 0) return null;
  const value = arguments_[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} needs a value.`);
  }
  return value;
};

const parseArguments = (arguments_: string[]): Arguments => {
  if (arguments_.includes('--help')) {
    console.log(usage);
    process.exit(0);
  }

  const archivePath = arguments_[0];
  const timezone =
    valueAfter(arguments_, '--timezone') ?? process.env.MINDFULL_TIMEZONE;
  const shouldApply = arguments_.includes('--apply');
  const server = valueAfter(arguments_, '--server');

  if (!archivePath || archivePath.startsWith('--')) {
    throw new Error('The Stoic export ZIP must be the first argument.');
  }
  if (!timezone) throw new Error('--timezone is required.');
  if (shouldApply && !server) {
    throw new Error('--server is required with --apply.');
  }

  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    throw new Error(`${timezone} is not a valid IANA timezone.`);
  }

  return {
    archivePath: resolve(archivePath),
    timezone,
    server,
    outputPath: valueAfter(arguments_, '--output'),
    shouldApply,
  };
};

const archiveEntries = (archivePath: string): string[] =>
  execFileSync('unzip', ['-Z1', archivePath], { encoding: 'utf8' })
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);

const readArchiveJson = (
  archivePath: string,
  entries: string[],
  filename: string,
  isRequired = true,
): unknown => {
  const entry = entries.find(
    (candidate) => candidate === filename || candidate.endsWith(`/${filename}`),
  );
  if (!entry) {
    if (isRequired) throw new Error(`${filename} is missing from the ZIP.`);
    return [];
  }

  const contents = execFileSync('unzip', ['-p', archivePath, entry], {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });
  return JSON.parse(contents) as unknown;
};

const readStoicArchive = (archivePath: string): unknown => {
  const entries = archiveEntries(archivePath);
  return {
    manifest: readArchiveJson(archivePath, entries, 'manifest.json'),
    journals: readArchiveJson(archivePath, entries, 'journal-entries.json'),
    routines: readArchiveJson(archivePath, entries, 'routines.json'),
    answers: readArchiveJson(archivePath, entries, 'answers.json'),
    questions: readArchiveJson(archivePath, entries, 'questions.json', false),
  };
};

const pairResponseSchema = z.object({ token: z.string().min(1) });
const syncResponseSchema = z.object({
  cursor: z.number().int().nonnegative(),
  documents: z.array(z.unknown()),
});

const endpoint = (server: string, path: string): string =>
  `${server.replace(/\/$/, '')}${path}`;

const postJson = async (
  url: string,
  body: unknown,
  token?: string,
): Promise<unknown> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const responseBody: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`Mindfull returned HTTP ${response.status}.`);
  }
  return responseBody;
};

const pairImporter = async (server: string, pairingCode: string) => {
  const response = await postJson(endpoint(server, '/api/pair'), {
    pairingCode,
    deviceId: 'stoic-import',
    deviceName: 'Stoic migration',
  });
  return pairResponseSchema.parse(response).token;
};

const synchronize = async (
  server: string,
  token: string,
  cursor: number,
  documents: DomainDocument[],
) => {
  const response = await postJson(
    endpoint(server, '/api/sync'),
    { cursor, documents },
    token,
  );
  const parsed = syncResponseSchema.parse(response);
  return {
    cursor: parsed.cursor,
    documents: parsed.documents.map(parseDomainDocument),
  };
};

const existingDocumentIds = async (
  server: string,
  token: string,
): Promise<{ ids: Set<string>; cursor: number }> => {
  const ids = new Set<string>();
  let cursor = 0;

  while (true) {
    const page = await synchronize(server, token, cursor, []);
    for (const document of page.documents) ids.add(document.id);
    if (page.cursor === cursor) return { ids, cursor };
    cursor = page.cursor;
  }
};

const chunksOf = <T>(values: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

const applyImport = async (
  server: string,
  pairingCode: string,
  documents: DomainDocument[],
): Promise<{ imported: number; skipped: number }> => {
  const token = await pairImporter(server, pairingCode);
  const existing = await existingDocumentIds(server, token);
  const missing = documents.filter(
    (document) => !existing.ids.has(document.id),
  );
  let cursor = existing.cursor;

  for (const batch of chunksOf(missing, 100)) {
    const result = await synchronize(server, token, cursor, batch);
    cursor = result.cursor;
  }

  return {
    imported: missing.length,
    skipped: documents.length - missing.length,
  };
};

const writeDocuments = (path: string, documents: DomainDocument[]): void => {
  writeFileSync(resolve(path), `${JSON.stringify(documents, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  chmodSync(resolve(path), 0o600);
};

const printReport = (
  result: ReturnType<typeof convertStoicExport>,
  mode: 'dry-run' | 'applied',
  applied?: { imported: number; skipped: number },
): void => {
  const source = [result.source.os, result.source.appVersion]
    .filter(Boolean)
    .join(' ');
  console.log(`Stoic export${source ? `: ${source}` : ''}`);
  console.log(`Journals: ${result.counts.journals}`);
  console.log(`Check-ins: ${result.counts.checkIns}`);
  if (result.counts.skippedRoutines > 0) {
    console.log(
      `Skipped non-morning/evening routines: ${result.counts.skippedRoutines}`,
    );
  }
  console.log(`Warnings: ${result.warnings.length}`);
  for (const warning of result.warnings) console.log(`  - ${warning}`);

  if (mode === 'dry-run') {
    console.log('No changes were made. Re-run with --apply to import.');
    return;
  }

  console.log(`Imported: ${applied?.imported ?? 0}`);
  console.log(`Already present: ${applied?.skipped ?? 0}`);
};

const main = async (): Promise<void> => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const result = convertStoicExport(readStoicArchive(arguments_.archivePath), {
    timezone: arguments_.timezone,
  });

  if (arguments_.outputPath) {
    writeDocuments(arguments_.outputPath, result.documents);
  }

  if (!arguments_.shouldApply) {
    printReport(result, 'dry-run');
    return;
  }

  const pairingCode = process.env.MINDFULL_PAIRING_CODE;
  if (!pairingCode) {
    throw new Error('MINDFULL_PAIRING_CODE is required with --apply.');
  }
  const applied = await applyImport(
    arguments_.server ?? '',
    pairingCode,
    result.documents,
  );
  printReport(result, 'applied', applied);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Import failed.';
  console.error(`Stoic import failed: ${message}`);
  process.exitCode = 1;
});
