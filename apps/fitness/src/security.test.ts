import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, test } from "vitest";
let pg: PGlite;
const owner = "11111111-1111-4111-8111-111111111111",
  stranger = "22222222-2222-4222-8222-222222222222";
const entry = "33333333-3333-4333-8333-333333333333";
async function as(role: string, id: string, sql: string, params: unknown[] = []) {
  await pg.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); set role ${role};`);
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
 grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 insert into auth.users values('${owner}','owner@example.test',now()),('${stranger}','stranger@example.test',now());`);
  await pg.exec(readFileSync(new URL("../supabase/migrations/001_fitness.sql", import.meta.url), "utf8"));
  await pg.exec("insert into fitness_private.owner(email) values('owner@example.test')");
}, 30000);
afterAll(async () => {
  await pg.close();
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
