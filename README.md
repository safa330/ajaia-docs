# Ajaia Docs

A lightweight collaborative document editor, built as a time-boxed take-home assignment.

**Live app:** https://safa330.github.io/ajaia-docs/

Create and format documents in the browser, import a file as a new document, and share documents with other users as an editor or a viewer. Documents, formatting and sharing are stored in Postgres (Supabase) and survive a refresh.

## Try it (demo accounts)

| User  | Email               | Seeded content |
|-------|---------------------|----------------|
| Alice | `alice@example.com` | Owns "Q4 launch plan" (shared with Bob as editor); can view Bob's "Weekly sync notes" |
| Bob   | `bob@example.com`   | Owns "Weekly sync notes" (shared with Alice as viewer); can edit Alice's plan |
| Carol | `carol@example.com` | No documents: good for testing sharing from scratch |

Password for all three: `ajaia-demo-2026` (public demo accounts; the login screen also has "Use" buttons).

Suggested review path:
1. Sign in as **Alice**, create a document, format it, rename it, refresh the page: it reopens with formatting intact.
2. **Import file** a `.md`, `.txt` or `.docx` file: it becomes a new document you own.
3. Click **Share**, add `carol@example.com` as **Viewer** (or Editor).
4. In a second browser or private window, sign in as **Carol**: the document is under **Shared with me**, read-only for a viewer.
5. Change Carol to **Editor** and let both users edit: a stale save shows a conflict banner instead of silently overwriting the other person's work.

## Features

- **Editing:** create, rename, edit and delete documents. Bold, italic, underline, headings 1-3, bulleted and numbered lists, quotes, undo/redo. Autosave about 0.8 s after you stop typing, a save status indicator, Ctrl/Cmd+S to save immediately, and a warning before closing a tab with unsaved changes.
- **File import:** `.txt`, `.md` and `.docx` up to 2 MB, converted into a new editable document. Unsupported, empty or oversized files get a clear error message. Other formats (PDF, images, attachments) are intentionally not supported.
- **Sharing:** every document has one owner. The owner can share by email as **Editor** or **Viewer**, change the role, or remove access. The sidebar separates **My documents** and **Shared with me**. Viewers get a read-only editor.
- **Persistence:** documents are stored as TipTap (ProseMirror) JSON in Postgres, so structure and formatting are preserved exactly.
- **Access control in the database:** Row Level Security, column-level privileges and one `share_document` function enforce who can read, edit, share and delete. The browser is never trusted.
- **Concurrent edits:** optimistic locking with a `version` column. If someone else saved first, you choose to load their version or overwrite with yours.

## Run locally

Prerequisites: Node.js 20+ and a free Supabase project.

```bash
npm install
cp .env.example .env.local   # then fill in your project URL and publishable/anon key
npm run dev                  # http://localhost:5173
```

Database setup (Supabase dashboard):
1. **SQL Editor:** run `supabase/migrations/0001_init.sql`.
2. **Authentication > Users > Add user:** create `alice@example.com`, `bob@example.com` and `carol@example.com` with the demo password and "Auto Confirm User" checked. A trigger creates each profile.
3. **SQL Editor:** run `supabase/seed.sql` for the demo documents (optional).

## Tests

```bash
npm test          # 16 tests, no Supabase project or network needed
npm run typecheck
```

- `tests/rls.test.ts` runs the real migration file in an in-process Postgres ([PGlite](https://pglite.dev)) and checks the access rules as Alice, Bob and Carol: private documents stay private, viewers cannot edit, editors cannot take ownership, share or delete, stale saves are rejected, revoking access works, and anonymous visitors get nothing.
- `tests/importFile.test.ts` covers text and Markdown conversion, title generation and file validation.

## Deploy

The frontend is a static build on GitHub Pages; Supabase provides auth, the API and Postgres.

```bash
npm run deploy    # vite build + publish dist/ to the gh-pages branch
```

## Project structure

```
src/
  App.tsx                    session handling, document list, hash routing (#/d/<id>)
  components/
    DocumentEditor.tsx       TipTap editor, autosave, conflict handling, rename, delete
    Toolbar.tsx              formatting controls
    ShareDialog.tsx          share by email, change role, remove access
    Sidebar.tsx              My documents / Shared with me, new document, file import
    Login.tsx                email + password sign-in with demo accounts
  lib/
    api.ts                   all Supabase calls
    importFile.ts            .txt / .md / .docx to HTML, validation
    editorExtensions.ts      one schema shared by the editor and the importer
supabase/
  migrations/0001_init.sql   tables, RLS policies, privileges, triggers, share_document()
  seed.sql                   demo documents
tests/                       Vitest tests (RLS + import)
```

More detail: [ARCHITECTURE.md](ARCHITECTURE.md) and [AI_WORKFLOW.md](AI_WORKFLOW.md).

## Known limitations

- No real-time co-editing or presence: two people can edit the same document, but changes are not merged live. Conflicts are detected on save.
- No self sign-up, password reset or email invitations: reviewers use the seeded accounts. Sharing works only with existing accounts.
- The free Supabase project pauses after a week without activity; it can be restored from the dashboard.
- The database runs in Supabase's South Asia (Mumbai) region (the "Auto" choice), so requests from the US take a little longer.
