import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import { z } from "zod";

const candidatePaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
];

for (const envPath of candidatePaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().optional(),
  HEALTH_FRONTEND_STALE_MS: z.coerce.number().default(120000),
  HEALTH_REFRESH_INTERVAL_MS: z.coerce.number().default(60000),
  STORAGE_CAPACITY_BYTES: z.coerce.number().default(536_870_912_000),
  TEMP_RETENTION_HOURS: z.coerce.number().default(24),
  JOB_CLEANUP_INTERVAL_MINUTES: z.coerce.number().default(60),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(20),
  IMAGE_PROVIDER: z.string().default("gpt-image"),
  IMAGE_API_BASE_URL: z.string().optional(),
  IMAGE_API_KEY: z.string().optional(),
  IMAGE_MODEL_NAME: z.string().default("gpt-image-1.5"),
  IMAGE_GENERATE_PATH: z.string().default("/v1/images/generations"),
  IMAGE_EDIT_PATH: z.string().default("/v1/images/edits"),
  IMAGE_VARIATION_PATH: z.string().optional(),
  IMAGE_RESPONSE_FORMAT: z.string().default("b64_json"),
  IMAGE_TIMEOUT_MS: z.coerce.number().default(120000),
  IMAGE_MAX_RETRY: z.coerce.number().default(2),
  STARTUP_SELF_TEST_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  STARTUP_SELF_TEST_PROMPT: z.string().optional(),
  STARTUP_SELF_TEST_START_DELAY_MS: z.coerce.number().default(10000),
  AZURE_CHINA_SUBSCRIPTION_ID: z.string().optional(),
  AZURE_RESOURCE_GROUP: z.string().default("image"),
  AZURE_LOCATION: z.string().default("chinanorth3"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formattedErrors = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(`Environment validation failed:\n${formattedErrors}`);
}

export const env = {
  ...parsed.data,
  blobContainers: {
    uploadsTemp: "uploads-temp",
    generatedTemp: "generated-temp",
    libraryOriginal: "library-original",
    libraryThumb: "library-thumb",
  },
};

export type AppEnv = typeof env;
