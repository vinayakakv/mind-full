import { getDefaultStore } from 'jotai';

import { type AiStatus, aiStatusAtom } from '../state/ai';
import { authenticatedServerRequest, synchronize } from './sync';

export type AiConfigurationView = {
  baseUrl: string;
  hasApiKey: boolean;
  model: string | null;
  paused: boolean;
  status: AiStatus;
  lastCheckedAt: string | null;
  lastSucceededAt: string | null;
  errorCode: string | null;
  pendingJobs: number;
  failedJobs: number;
};

const store = getDefaultStore();
const emptyJsonPost: RequestInit = {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
};

const readError = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === 'string'
      ? body.error
      : 'The request was not accepted.';
  } catch {
    return 'Mindfull could not reach its AI service.';
  }
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await authenticatedServerRequest(path, init);
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error('Mindfull could not reach its backend.');
  }
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as T;
};

export const loadAiConfiguration = async (): Promise<AiConfigurationView> => {
  const configuration = await request<AiConfigurationView>(
    '/api/ai/configuration',
  );
  store.set(aiStatusAtom, configuration.status);
  return configuration;
};

export const loadAiModels = async (
  baseUrl: string,
  apiKey: string | null,
): Promise<string[]> => {
  const result = await request<{ models: string[] }>('/api/ai/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ baseUrl, apiKey }),
  });
  return result.models;
};

export const saveAiConfiguration = async (input: {
  baseUrl: string;
  apiKey: string | null;
  model: string | null;
}): Promise<void> => {
  await request('/api/ai/configuration', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  await loadAiConfiguration();
};

export const pauseAi = async (paused: boolean): Promise<void> => {
  await request('/api/ai/pause', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paused }),
  });
  await loadAiConfiguration();
};

export const retryFailedAiJobs = async (): Promise<void> => {
  await request('/api/ai/retry', emptyJsonPost);
  await loadAiConfiguration();
};

export const initializeReflectionMemory = async (): Promise<void> => {
  await request('/api/ai/memory/initialize', emptyJsonPost);
  await loadAiConfiguration();
};

export const resetReflectionMemory = async (): Promise<void> => {
  await request('/api/ai/memory/reset', emptyJsonPost);
  await synchronize();
  await loadAiConfiguration();
};
