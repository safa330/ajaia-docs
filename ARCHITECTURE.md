# Architecture note

## Shape of the system

```
Browser (GitHub Pages, static)            Supabase
┌────────────────────────────┐   HTTPS   ┌──────────────────────────────────────┐
│ React + TipTap editor       │ ───────▶ │ Auth (email + password, JWT)          │
│ supabase-js (anon key)      │          │ PostgREST API                         │
│ file import (.txt/.md/.docx)│          │ Postgres: RLS policies, privileges,   │
└────────────────────────────┘          │ triggers, share_document() function   │
                                          └──────────────────────────────────────┘
```

There is no custom application server. The browser calls Supabase directly with a public key, so **every access rule lives in Postgres**: Row Level Security policies, column-level privileges, triggers and one `SECURITY DEFINER` function for sharing. A bug or a modified client cannot read or change data the user is not allowed to. This was the main reason for the choice: one enforcement point that is testable and does not depend on the UI.

## Data model

| Table | Purpose |
|---|---|
| `profiles` | One row per auth user (id, email, display name), created by a trigger on `auth.users`. |
| `documents` | `owner_id`, `title`, `content` (TipTap JSON in `jsonb`), `version`, timestamps. |
| `document_shares` | `(document_id, user_id)` with role `viewer` or `editor`. |

Content is stored as editor JSON, not HTML. Formatting is preserved exactly, and nothing outside the editor schema can be stored or rendered.

## Access rules

| Action | Owner | Editor | Viewer | Anyone else |
|---|---|---|---|---|
| Read document | yes | yes | yes | no |
| Edit title/content | yes | yes | no | no |
| Share / change role / remove access | yes | no | no | no |
| Delete | yes | no | no | no |

- Signed-in users may only write `title` and `content` (column privileges), so nobody can change `owner_id`, `version` or timestamps; a trigger also blocks ownership changes.
- Sharing goes through `share_document(doc_id, email, role)`. It checks that the caller owns the document, validates the role, finds the recipient by email, and rejects sharing with yourself.
- Profiles (emails) are visible only to yourself and to people you share documents with. A public profiles table would let any user list every email address.
- Policy helpers are `SECURITY DEFINER` functions to avoid RLS recursion between `documents` and `document_shares`.

These rules are covered by `tests/rls.test.ts`, which runs the same migration file in PGlite as three different users.

## Saving and concurrent edits

- Autosave runs about 800 ms after the last keystroke. Only one save request is in flight at a time; edits made meanwhile are sent next.
- Every save includes the `version` it started from (`... where id = ? and version = ?`). A trigger increments the version.
- If the version is stale, the editor shows a conflict banner: **Load their version** or **Overwrite with mine**. Without this, two people editing the same document would silently overwrite each other (last write wins).
- Unsaved changes trigger a browser warning on tab close, and are flushed when switching documents.

## File import

Import runs in the browser: `.txt` (paragraphs and line breaks), `.md` (via `marked`) and `.docx` (via `mammoth`, loaded on demand). The resulting HTML is converted to editor JSON with the same extension set the editor uses, so only supported nodes and marks survive. Files are limited to 2 MB, and unsupported, empty or unreadable files get a specific error. The original file is not stored: the product goal was "turn a file into an editable document", not file storage.

## What I prioritized, and why

1. **A correct sharing model**, because access control is where a collaborative tool can do real harm. It is enforced and tested in the database.
2. **An editing flow that does not lose work**: autosave, a save status, retry on failure, and conflict detection.
3. **Clear scope in the UI**: supported file types are listed, viewers see why they cannot edit, and errors are written as sentences.

## Deliberate cuts

| Cut | Why | Next step |
|---|---|---|
| Real-time co-editing and presence | CRDT sync (Yjs + a websocket provider) is a project of its own; conflict detection covers the risk of silent data loss. | Yjs over Supabase Realtime, presence avatars. |
| Sign-up, password reset, invitations | Seeded accounts are enough to review sharing; email flows need SMTP setup. | Invite by email for people without an account. |
| Comments, suggestions, version history | Not required; each needs its own data model and UI. | A `document_versions` table written by a trigger. |
| Attachments and file storage | Import covers the "file into workflow" requirement. | Supabase Storage bucket with RLS that mirrors document access. |
| Export | Optional. | Markdown/PDF export from the editor JSON. |

## Tradeoffs I accepted

- **Supabase instead of a custom API server:** faster to ship and easy to deploy, but business logic lives in SQL, which some teams find harder to maintain. Keeping the rules in one migration file, with tests, makes this manageable.
- **Static hosting with hash routing (`#/d/<id>`):** works on GitHub Pages without server rewrites; the URLs are less clean.
- **`share_document` says "No account found":** this lets a signed-in user check whether an email has an account. That is acceptable for an internal tool; a public product would send an invitation instead.
- **Free tier:** the project pauses after a week of inactivity, and the region is Mumbai (Supabase "Auto"), which adds latency for US users.
