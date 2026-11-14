# AI workflow note

## Tools

- **Claude Code (Claude Opus 5.5)** in the Claude desktop app. It read the brief, proposed the scope, stack and time plan, wrote the code, tests and documentation, ran the type check, tests and builds, and carried out setup steps in the browser after I approved them: creating the Supabase project, running the migration, and publishing to GitHub Pages.
- No other AI tools were used for this assignment.

## How the work was split

- **Claude proposed and built; I reviewed and decided.** I approved the plan and scope cuts, approved creating the Supabase project and a public GitHub repository, created the demo accounts myself, tested the main flows by hand, and recorded the walkthrough.
- I chose Supabase with Row Level Security partly because I use it in my own project (11 tables, 60+ RLS policies), so I can read and judge the generated SQL instead of trusting it.

## Where AI materially sped things up

- Turning an open brief into a scoped plan with a time budget in about five minutes.
- The SQL schema, RLS policies and the PGlite test harness: the slowest part to write by hand, and the most important to get right.
- React components, autosave logic and these documents.
- Setup: project creation, schema migration and deployment took minutes instead of an hour.

## What was changed or rejected

These came up while reviewing generated code and configuration, before anything shipped:

1. **Ownership takeover.** A simple update policy (`owner or editor may update`) would also let an editor set `owner_id` to themselves. Changed to column-level privileges (signed-in users can only write `title` and `content`) plus a trigger. A test covers it.
2. **Every email visible to every user.** A "profiles readable by any signed-in user" policy is the easy default. It is the same class of bug I once found in my own project during a security audit (emails readable through the API), so profiles are visible only to collaborators. Tested.
3. **Silent overwrites.** Plain autosave means last write wins, and two collaborators can lose each other's work without noticing. Added a `version` column with optimistic locking and a conflict banner. Tested at the database level.
4. **RLS recursion.** Policies on `documents` and `document_shares` that query each other recurse; replaced with `SECURITY DEFINER` helper functions.
5. **TipTap v3 rejected for v2.** v3 changes how the React integration re-renders (toolbar state needs extra wiring). Under a four-hour limit, the stable v2 API was the lower-risk choice.
6. **A misleading green build.** The first production build without environment variables "passed", but the bundler had removed almost the whole app as dead code behind the setup screen. Caught by inspecting the bundle; the configured build was checked to include everything and to load the `.docx` converter lazily.
7. **Platform defaults not trusted.** The migration revokes default table privileges and grants only what is needed, including explicit `EXECUTE` on the policy helpers, so access does not depend on project-level settings.

## How correctness was verified

- **Automated:** 16 tests. 11 run the real migration in an in-process Postgres (PGlite) as three users, checking reads, edits, sharing, deletion, stale saves, revocation and anonymous access. 5 cover file import and validation. Plus a TypeScript type check and a production build.
- **Live API:** an anonymous request to the documents table on the deployed project returns `permission denied`.
- **Manual, end to end:** (pending)
- **UX:** (pending)

## Time

About four hours, inside the 240-minute timer (started 17:05 Istanbul time, UTC+3).
