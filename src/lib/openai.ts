import OpenAI from 'openai';

const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
const defaultModel = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) || 'gpt-4o-mini';

if (!apiKey) {
  console.warn('Missing VITE_OPENAI_API_KEY in environment variables.');
}

export const openaiClient = new OpenAI({
  apiKey: apiKey || 'missing-key',
  dangerouslyAllowBrowser: true, // Required for client-only prototype execution
});

export const OPENAI_MODEL = defaultModel;
