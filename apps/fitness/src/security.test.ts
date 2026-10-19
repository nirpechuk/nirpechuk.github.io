import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, test } from "vitest";
let pg: PGlite;
const owner = "11111111-1111-4111-8111-111111111111",
  stranger = "22222222-2222-4222-8222-222222222222";
const entry = "33333333-3333-4333-8333-333333333333";
async function as(role: string, id: string, sql: string, params: unknown[] = [], client = "") {
  await pg.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false);`);
  await pg.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(client ? { client_id: client } : {})]);
  await pg.exec(`set role ${role};`);
  try {
    return await pg.query(sql, params);
  } finally {
    await pg.exec("reset role");
  }
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 insert into auth.users values('${owner}','owner@example.test',now()),('${stranger}','stranger@example.test',now());`);
  await pg.exec(readFileSync(new URL("../supabase/migrations/001_fitness.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../supabase/migrations/002_fitness_plugin.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../supabase/migrations/20261019182028_fitness_context.sql", import.meta.url), "utf8"));
  await pg.exec("insert into fitness_private.owner(email) values('owner@example.test')");
}, 30000);
afterAll(async () => {
  await pg.close();
});

test("private context is read-only for approved clients and denied to anonymous, outsiders and revoked clients", async () => {
  const client = "88888888-8888-4888-8888-888888888888";
  await pg.query("insert into fitness_private.context(owner_id,profile) values($1,$2)", [owner, JSON.stringify({ goal: "Example private goal" })]);
  const read = () => as("authenticated", owner, "select public.fitness_plugin_context() as context", [], client);
  await expect(read()).rejects.toThrow(/not authorized/);
  await expect(as("anon", "", "select public.fitness_plugin_context()")).rejects.toThrow(/permission denied/);
  await as("authenticated", owner, "select public.fitness_allow_plugin_client($1,'Context test')", [client]);
  expect(((await read()).rows[0] as any).context.profile.goal).toBe("Example private goal");
  await expect(as("authenticated", stranger, "select public.fitness_plugin_context()", [], client)).rejects.toThrow(/not authorized/);
  await expect(as("authenticated", owner, "select * from fitness_private.context", [], client)).rejects.toThrow(/permission denied/);
  await expect(as("authenticated", owner, "update fitness_private.context set profile='{}'", [], client)).rejects.toThrow(/permission denied/);
  await as("authenticated", owner, "select public.fitness_revoke_plugin_client($1)", [client]);
  await expect(read()).rejects.toThrow(/not authorized/);
});
test("owner can create a meal and the database records an immutable audit", async () => {
  await as(
    "authenticated",
    owner,
    `insert into public.fitness_entries(id,owner_id,day,kind,title,data) values($1,$2,'2026-10-19','meal','Lunch',$3)`,
    [entry, owner, JSON.stringify({ calories: 600, protein: 40, confidence: "estimated" })]
  );
  const r = await as("authenticated", owner, "select * from public.fitness_history where entry_id=$1", [entry]);
  expect(r.rows).toHaveLength(1);
  await expect(as("authenticated", owner, "delete from public.fitness_history")).rejects.toThrow(/permission denied/);
  await expect(as("authenticated", owner, "delete from public.fitness_entries")).rejects.toThrow(/permission denied/);
});
test("anonymous and another signed-in user cannot read or write the journal", async () => {
  await expect(as("anon", "", "select * from public.fitness_entries")).rejects.toThrow(/permission denied/);
  const r = await as("authenticated", stranger, "select * from public.fitness_entries");
  expect(r.rows).toHaveLength(0);
  await expect(
    as("authenticated", stranger, `insert into public.fitness_entries(owner_id,day,kind,title,data) values($1,'2026-10-19','meal','Intrusion',$2)`, [
      stranger,
      JSON.stringify({ calories: 1, protein: 1, confidence: "label" }),
    ])
  ).rejects.toThrow(/row-level security/);
  await expect(
    as("authenticated", owner, `insert into public.fitness_entries(owner_id,day,kind,title,data) values($1,'2026-10-19','meal','Wrong owner',$2)`, [
      stranger,
      JSON.stringify({ calories: 1, protein: 1, confidence: "label" }),
    ])
  ).rejects.toThrow(/row-level security/);
});
test("invalid payloads fail and edits increment revisions", async () => {
  await expect(
    as("authenticated", owner, `update public.fitness_entries set data='{"calories":-20,"protein":40,"confidence":"estimated"}' where id=$1`, [entry])
  ).rejects.toThrow(/nonnegative/);
  await as("authenticated", owner, `update public.fitness_entries set data='{"calories":650,"protein":45,"confidence":"estimated"}' where id=$1`, [
    entry,
  ]);
  const r = await as("authenticated", owner, "select revision from public.fitness_entries where id=$1", [entry]);
  expect(r.rows[0]).toEqual({ revision: 2 });
  await expect(as("authenticated", owner, "update public.fitness_entries set kind='checkin' where id=$1", [entry])).rejects.toThrow(/identity/);
});
test("private photo bucket enforces folder and owner access", async () => {
  await as("authenticated", owner, "insert into storage.objects(bucket_id,name) values('fitness-photos',$1)", [owner + "/photo.jpg"]);
  expect((await as("authenticated", stranger, "select * from storage.objects")).rows).toHaveLength(0);
  await expect(
    as("authenticated", stranger, "insert into storage.objects(bucket_id,name) values('fitness-photos',$1)", [stranger + "/photo.jpg"])
  ).rejects.toThrow(/row-level security/);
  await expect(
    as("authenticated", owner, "insert into storage.objects(bucket_id,name) values('fitness-photos',$1)", [stranger + "/photo.jpg"])
  ).rejects.toThrow(/row-level security/);
  expect((await pg.query("select public from storage.buckets")).rows[0]).toEqual({ public: false });
});
test("agent keys support retry-safe logging, optimistic corrections, revocation, and no photo access", async () => {
  const result = await as("authenticated", owner, "select public.fitness_create_agent_key('Test') as key");
  const key = (result.rows[0] as any).key;
  const body = {
    id: "44444444-4444-4444-8444-444444444444",
    day: "2026-10-19",
    kind: "meal",
    title: "Dinner",
    data: { calories: 700, protein: 50, confidence: "estimated" },
  };
  const call = (b = body, rev: number | null = null) =>
    as("anon", "", "select public.fitness_agent_save($1,$2,$3) as entry", [key.token, JSON.stringify(b), rev]);
  await call();
  await call();
  expect((await pg.query("select * from public.fitness_history where entry_id=$1", [body.id])).rows).toHaveLength(1);
  const correction = { ...body, data: { ...body.data, calories: 800 } };
  await expect(call(correction)).rejects.toThrow(/changed/);
  await call(correction, 1);
  await expect(call({ ...body, kind: "photo" })).rejects.toThrow(/text entries only/);
  await expect(as("anon", "", "select public.fitness_create_agent_key('Bad')")).rejects.toThrow(/permission denied/);
  await as("authenticated", owner, "select public.fitness_revoke_agent_key($1)", [key.id]);
  await expect(call()).rejects.toThrow(/Invalid or expired/);
});

test("OAuth clients must be approved and cannot use direct journal, photo, settings, history, or key access", async () => {
  const client = "55555555-5555-4555-8555-555555555555";
  const oauth = (sql: string, params: unknown[] = []) => as("authenticated", owner, sql, params, client);
  expect((await oauth("select public.fitness_plugin_access() as allowed")).rows[0]).toEqual({ allowed: false });
  await expect(oauth("select public.fitness_plugin_read()")).rejects.toThrow(/not authorized/);
  await expect(oauth("select public.fitness_allow_plugin_client($1,'Escalation')", [client])).rejects.toThrow(/Not authorized/);
  await as("authenticated", owner, "select public.fitness_allow_plugin_client($1,'Fitness')", [client]);
  expect((await oauth("select public.fitness_plugin_access() as allowed")).rows[0]).toEqual({ allowed: true });
  for (const table of ["fitness_entries", "fitness_settings", "fitness_history"]) {
    expect((await oauth(`select * from public.${table}`)).rows).toHaveLength(0);
  }
  expect((await oauth("select * from storage.objects")).rows).toHaveLength(0);
  await expect(oauth("select public.fitness_create_agent_key('Escalation')")).rejects.toThrow(/Not authorized/);
  await expect(oauth("select fitness_private.save_text_entry($1,'{}',null)", [owner])).rejects.toThrow(/permission denied/);
  await expect(oauth("insert into storage.objects(bucket_id,name) values('fitness-photos',$1)", [owner + "/blocked.jpg"])).rejects.toThrow(
    /row-level security/
  );
  await expect(oauth("insert into public.fitness_settings(owner_id) values($1)", [owner])).rejects.toThrow(/row-level security/);
  await expect(as("authenticated", stranger, "select public.fitness_plugin_read()", [], client)).rejects.toThrow(/not authorized/);
  await expect(as("authenticated", owner, "select public.fitness_plugin_read()")).rejects.toThrow(/not authorized/);
});

test("OAuth text logging keeps retries and revision history, excludes photos, and revokes immediately", async () => {
  const client = "55555555-5555-4555-8555-555555555555";
  const body = {
    id: "66666666-6666-4666-8666-666666666666",
    day: "2026-10-19",
    kind: "measurement",
    title: "Weigh-in",
    data: { weight: 170, unit: "lb" },
  };
  const save = (value: unknown, revision: number | null = null) =>
    as("authenticated", owner, "select public.fitness_plugin_save($1,$2) as entry", [JSON.stringify(value), revision], client);
  await save(body);
  const retry = await save(body);
  expect((retry.rows[0] as any).entry.revision).toBe(1);
  const corrected = { ...body, data: { ...body.data, weight: 171 } };
  await expect(save(corrected)).rejects.toThrow(/changed/);
  expect(((await save(corrected, 1)).rows[0] as any).entry.revision).toBe(2);
  await expect(save({ ...body, kind: "photo" }, 2)).rejects.toThrow(/text entries only/);
  await as(
    "authenticated",
    owner,
    `insert into public.fitness_entries(owner_id,day,kind,title,data) values($1,'2026-10-19','photo','Private photo',$2)`,
    [owner, JSON.stringify({ path: owner + "/77777777-7777-4777-8777-777777777777.jpg", view: "front" })]
  );
  const read = await as("authenticated", owner, "select public.fitness_plugin_read('2026-10-01') as entries", [], client);
  expect((read.rows[0] as any).entries.some((e: any) => e.kind === "photo")).toBe(false);
  expect((read.rows[0] as any).entries.some((e: any) => e.id === body.id)).toBe(true);
  await as("authenticated", owner, "select public.fitness_revoke_plugin_client($1)", [client]);
  await expect(save(body)).rejects.toThrow(/not authorized/);
  // First-party website access still works after OAuth revocation.
  expect((await as("authenticated", owner, "select public.fitness_is_owner() as allowed")).rows[0]).toEqual({ allowed: true });
});
