import { z } from "zod/v4";

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  PUBLIC_BASE_URL: z.url().transform((value) => value.replace(/\/$/, "")),
  SUPABASE_URL: z.url().transform((value) => value.replace(/\/$/, "")),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_AUTH_SERVER_URL: z.url().transform((value) => value.replace(/\/$/, "")),
  OPENAI_APPS_CHALLENGE_TOKEN: z
    .string()
    .default("8RLIA207YSfsa7f_yYYTI5zb0vGhB-2YNBvI9d7Pz4U"),
  ADDITIONAL_ALLOWED_HOSTS: z
    .string()
    .default("")
    .transform((value) =>
      Array.from(
        new Set(
          value
            .split(",")
            .map((host) => host.trim().toLowerCase())
            .filter(Boolean),
        ),
      ),
    ),
});

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid server configuration. Check: ${fields}`);
  }
  return result.data;
}
