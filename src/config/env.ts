import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const numberFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return fallback;
      }

      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    });

const booleanFromEnv = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return fallback;
      }

      return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    });

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: numberFromEnv(4000),
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: numberFromEnv(3306),
  DB_USER: z.string().default('root'),
  DB_PASS: z.string().optional().default(''),
  DB_NAME: z.string().default('buzke'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY é obrigatório'),
  GEMINI_ASSISTANT_MODEL: z.string().default('gemini-2.5-pro'),
  PHONE: z.string().min(1, 'PHONE é obrigatório'),
  EVOLUTION_API_URL: z.string().optional().default('http://127.0.0.1:8080'),
  EVOLUTION_API_KEY: z.string().optional().default(''),
  EVOLUTION_INSTANCE_NAME: z.string().optional(),
  EVOLUTION_WEBHOOK_SECRET: z.string().optional().default(''),
  APP_BASE_URL: z.string().optional().default(''),
  LEAD_POLL_INTERVAL_MS: numberFromEnv(60000),
  DEBUG: booleanFromEnv(false),
});

const parsed = schema.parse(process.env);

const defaultInstanceName = parsed.EVOLUTION_INSTANCE_NAME?.trim() || parsed.PHONE;
const databaseUrl =
  parsed.DATABASE_URL?.trim() ||
  `mysql://${encodeURIComponent(parsed.DB_USER)}:${encodeURIComponent(parsed.DB_PASS)}@${parsed.DB_HOST}:${parsed.DB_PORT}/${parsed.DB_NAME}`;

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  databaseUrl,
  dbHost: parsed.DB_HOST,
  dbPort: parsed.DB_PORT,
  dbUser: parsed.DB_USER,
  dbPass: parsed.DB_PASS,
  dbName: parsed.DB_NAME,
  geminiApiKey: parsed.GEMINI_API_KEY,
  geminiModel: parsed.GEMINI_ASSISTANT_MODEL,
  phone: parsed.PHONE,
  evolutionApiUrl: parsed.EVOLUTION_API_URL.replace(/\/$/, ''),
  evolutionApiKey: parsed.EVOLUTION_API_KEY,
  evolutionInstanceName: defaultInstanceName,
  evolutionWebhookSecret: parsed.EVOLUTION_WEBHOOK_SECRET,
  appBaseUrl: parsed.APP_BASE_URL.replace(/\/$/, ''),
  leadPollIntervalMs: parsed.LEAD_POLL_INTERVAL_MS,
  debug: parsed.DEBUG,
};

export const evolutionConfigured = Boolean(env.evolutionApiUrl && env.evolutionApiKey && env.evolutionInstanceName);