# Submission: AI-Native Full Stack Developer Assignment

**Candidate:** Safa Şahinyılmaz
**Project:** Ajaia Docs, a lightweight collaborative document editor

## Links

| What | Where |
|---|---|
| Live app | https://safa330.github.io/ajaia-docs/ |
| Walkthrough video | see `VIDEO_URL.txt` |
| Source repository | https://github.com/safa330/ajaia-docs |

## Demo accounts

| User | Email | Password |
|---|---|---|
| Alice | `alice@hotmail.com` | `ajaia-demo-2026` |
| Bob | `bob@hotmail.com` | `ajaia-demo-2026` |
| Carol | `carol@hotmail.com` | `ajaia-demo-2026` |

To see sharing from both sides, sign in as two users in two browsers (or a normal and a private window). Alice and Bob have seeded documents shared with each other; Carol starts empty. Sample import files are in `samples/`.

## What is in this folder

| File | Contents |
|---|---|
| `SUBMISSION.md` | This file |
| `README.md` | Features, local setup and run instructions, tests, deployment, known limitations |
| `ARCHITECTURE.md` | Architecture note: what I prioritized and why, data model, access rules, tradeoffs |
| `AI_WORKFLOW.md` | AI workflow note: tools, where AI helped, what was changed or rejected, how it was verified |
| `LIVE_URL.txt` | Live product URL |
| `VIDEO_URL.txt` | Walkthrough video URL |
| `ajaia-docs-source.zip` | Full source code (same as the GitHub repository) |

## Status

**Working end to end**
- Sign-in with seeded accounts.
- Documents: create, rename, edit with rich text, autosave, delete.
- Import of .txt, .md and .docx files as new documents.
- Sharing by email as editor or viewer, role changes, removing access, "My documents" vs "Shared with me".
- Persistence in Postgres; conflict detection for simultaneous edits.
- 16 automated tests; live deployment.

**Not built (deliberate cuts)**
- Real-time co-editing and presence, comments, version history, export.
- Self sign-up, password reset, email invitations.

**What I would build next with 2-4 more hours**
1. Real-time co-editing with Yjs over Supabase Realtime, with presence indicators.
2. Version history: snapshots written by a trigger, with restore.
3. Invitations for people who do not have an account yet, plus sign-up.
4. Browser end-to-end tests (Playwright) for the two-user sharing flow.

## Time

About four hours, inside the 240-minute timer (started 17:05 Istanbul time, UTC+3).
