import { createHandler } from "./server.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")!;
if (!supabaseUrl || !publishableKey) throw new Error("Missing Supabase public configuration");
Deno.serve(createHandler({ supabaseUrl, publishableKey, publicBase: `${supabaseUrl}/functions/v1/fitness-mcp` }));
