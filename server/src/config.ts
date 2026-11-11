import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Language } from '../../shared/types';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');

for (const f of [path.join(ROOT, '.env'), path.join(ROOT, 'server/.env')]) {
  try { process.loadEnvFile(f); } catch { /* optional */ }
}

const env = (k: string, d = '') => (process.env[k] ?? d).trim();

export const config = {
  port: Number(env('PORT', '8787')),
  paypal: {
    clientId: env('PAYPAL_CLIENT_ID'),
    secret: env('PAYPAL_CLIENT_SECRET'),
    webhookId: env('PAYPAL_WEBHOOK_ID'),
    env: env('PAYPAL_ENV', 'sandbox') === 'live' ? 'live' : 'sandbox',
    get enabled() { return Boolean(this.clientId && this.secret); },
    get base() { return this.env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'; },
  },
  ai: {
    anthropicKey: env('ANTHROPIC_API_KEY'),
    anthropicModel: env('ANTHROPIC_MODEL', 'claude-sonnet-5-5'),
    anthropicFast: env('ANTHROPIC_FAST_MODEL', 'claude-haiku-5-5'),
    openaiKey: env('OPENAI_API_KEY'),
    openaiBase: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
    openaiModel: env('OPENAI_MODEL', 'gpt-4.1-mini'),
  },
  channel3Key: env('CHANNEL3_API_KEY'),
  dataDir: path.join(ROOT, 'data'),
  webDist: path.join(ROOT, 'web/dist'),
  currency: 'USD',
  agentName: 'Munim',
};

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', native: 'English', speech: 'en-IN' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', speech: 'hi-IN' },
  { code: 'bgc', name: 'Haryanvi', native: 'हरियाणवी', speech: 'hi-IN' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', speech: 'ta-IN' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', speech: 'te-IN' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', speech: 'bn-IN' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', speech: 'mr-IN' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', speech: 'gu-IN' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', speech: 'pa-IN' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', speech: 'kn-IN' },
];

export const langName = (code: string) => LANGUAGES.find(l => l.code === code)?.name ?? code;

export const aiProvider = () => (config.ai.anthropicKey ? 'anthropic' : config.ai.openaiKey ? 'openai' : null);
