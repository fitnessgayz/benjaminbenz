import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { createMessageEmailHandler } from "./worker.ts";

Deno.serve(createMessageEmailHandler({
  env: (name) => Deno.env.get(name),
  createAdmin: (url, key) => createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, options) => fetch(input, {
        ...options,
        signal: AbortSignal.timeout(10_000)
      })
    }
  }),
  fetch,
  log: (event) => console.error(event)
}));
