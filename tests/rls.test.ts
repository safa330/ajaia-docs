import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

// Runs the real migration against an in-process Postgres and checks the access
// rules as three different signed-in users. No Supabase project or network needed.

const ALICE = '00000000-0000-4000-8000-00000000000a';
const BOB = '00000000-0000-4000-8000-00000000000b';
const CAROL = '00000000-0000-4000-8000-00000000000c';

// Minimal stand-in for the parts of Supabase that the migration depends on.
const SUPABASE_SHIM = `
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text not null,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema auth to anon, authenticated;
`;

let db: PGlite;

/** Run one statement as a signed-in user, with RLS enforced. */
async function as<T = Record<string, unknown>>(userId: string, sql: string, params: unknown[] = []) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await db.exec('set role authenticated');
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  await db.exec(readFileSync(new URL('../supabase/migrations/0001_init.sql', import.meta.url), 'utf8'));
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ($1, 'alice@example.com', '{"display_name": "Alice"}'),
       ($2, 'bob@example.com', '{"display_name": "Bob"}'),
       ($3, 'carol@example.com', '{}')`,
    [ALICE, BOB, CAROL],
  );
});

describe('document access rules (Row Level Security)', () => {
  let docId = '';

  it('creates a profile for every new user', async () => {
    const { rows } = await db.query('select email, display_name from public.profiles order by email');
    expect(rows).toEqual([
      { email: 'alice@example.com', display_name: 'Alice' },
      { email: 'bob@example.com', display_name: 'Bob' },
      { email: 'carol@example.com', display_name: 'carol' },
    ]);
  });

  it('lets a user create a document they own', async () => {
    const [doc] = await as<{ id: string; owner_id: string; version: number }>(
      ALICE,
      `insert into documents (title) values ('Launch plan') returning id, owner_id, version`,
    );
    expect(doc.owner_id).toBe(ALICE);
    expect(doc.version).toBe(1);
    docId = doc.id;
  });

  it('cannot create a document on behalf of someone else', async () => {
    await expect(as(BOB, `insert into documents (title, owner_id) values ('x', $1)`, [ALICE])).rejects.toThrow(
      /permission denied/,
    );
  });

  it('hides a private document from other users', async () => {
    expect(await as(BOB, 'select id from documents')).toHaveLength(0);
    expect(await as(BOB, `update documents set title = 'hijacked' where id = $1 returning id`, [docId])).toHaveLength(0);
    await expect(as(BOB, `select share_document($1, 'bob@example.com', 'editor')`, [docId])).rejects.toThrow(
      /Only the owner/,
    );
  });

  it('gives a viewer read-only access and shows them only the owner profile', async () => {
    await as(ALICE, `select share_document($1, ' BOB@example.com ', 'viewer')`, [docId]);
    expect(await as(BOB, 'select title from documents')).toEqual([{ title: 'Launch plan' }]);
    expect(await as(BOB, `update documents set title = 'viewer edit' where id = $1 returning id`, [docId])).toHaveLength(0);
    expect(await as(BOB, 'select email from profiles order by email')).toEqual([
      { email: 'alice@example.com' },
      { email: 'bob@example.com' },
    ]);
  });

  it('lets an editor change content but not ownership, sharing or deletion', async () => {
    await as(ALICE, `select share_document($1, 'bob@example.com', 'editor')`, [docId]);
    const [updated] = await as<{ version: number }>(
      BOB,
      `update documents set content = '{"type":"doc","content":[]}' where id = $1 returning version`,
      [docId],
    );
    expect(updated.version).toBe(2);

    await expect(as(BOB, `update documents set owner_id = $2 where id = $1`, [docId, BOB])).rejects.toThrow(
      /permission denied/,
    );
    expect(await as(BOB, `delete from documents where id = $1 returning id`, [docId])).toHaveLength(0);
    await expect(as(BOB, `select share_document($1, 'carol@example.com', 'viewer')`, [docId])).rejects.toThrow(
      /Only the owner/,
    );
    await expect(
      as(BOB, `insert into document_shares (document_id, user_id, role) values ($1, $2, 'editor')`, [docId, CAROL]),
    ).rejects.toThrow(/permission denied/);
  });

  it('rejects a stale save so a collaborator is not silently overwritten', async () => {
    const stale = await as(ALICE, `update documents set title = 'Stale write' where id = $1 and version = 1 returning id`, [
      docId,
    ]);
    expect(stale).toHaveLength(0);
    const fresh = await as<{ version: number }>(
      ALICE,
      `update documents set title = 'Launch plan v2' where id = $1 and version = 2 returning version`,
      [docId],
    );
    expect(fresh).toEqual([{ version: 3 }]);
  });

  it('keeps unrelated users out', async () => {
    expect(await as(CAROL, 'select id from documents')).toHaveLength(0);
    expect(await as(CAROL, 'select email from profiles')).toEqual([{ email: 'carol@example.com' }]);
    expect(await as(CAROL, 'select * from document_shares')).toHaveLength(0);
  });

  it('rejects invalid shares and titles with clear errors', async () => {
    await expect(as(ALICE, `select share_document($1, 'nobody@example.com', 'viewer')`, [docId])).rejects.toThrow(
      /No account found/,
    );
    await expect(as(ALICE, `select share_document($1, 'alice@example.com', 'viewer')`, [docId])).rejects.toThrow(
      /already own/,
    );
    await expect(as(ALICE, `select share_document($1, 'bob@example.com', 'admin')`, [docId])).rejects.toThrow(
      /viewer or editor/,
    );
    await expect(as(ALICE, `update documents set title = '   ' where id = $1`, [docId])).rejects.toThrow(/title_length/);
  });

  it('removes access when the owner revokes a share', async () => {
    expect(
      await as(ALICE, `delete from document_shares where document_id = $1 and user_id = $2 returning user_id`, [docId, BOB]),
    ).toHaveLength(1);
    expect(await as(BOB, 'select id from documents')).toHaveLength(0);
  });

  it('gives anonymous visitors nothing', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query('select id from documents')).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('reset role');
    }
  });
});
