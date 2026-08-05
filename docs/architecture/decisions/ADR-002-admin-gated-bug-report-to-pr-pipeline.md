# ADR-002: Admin-Gated Bug-Report-to-PR Automation Pipeline

**Status:** Proposed
**Date:** 2026-07-27
**Author:** solution-architect agent
**Deciders:** Jonathan V Tran

---

## Section 1 — Context

The app has no structured way to capture a bug report today — issues surface as ad hoc messages, with no screenshot, no reproduction steps, and no link to a code change. There is also no CI/CD pipeline in the repo at all (`.github/` does not exist); every fix currently starts from a manual Claude Code session against the local working tree. The repo is public on GitHub (`trantechsolutions/nola-dfc-manager`), deployed to Vercel, and backed by Supabase (Postgres, Auth, Storage, Realtime, Edge Functions). The app stores sensitive data for minors — player records and, as of the most recent commit, medical release forms and medical documents that were just re-scoped to a narrow admin/guardian audience specifically because broader access was judged too risky. Any new intake surface that collects a screenshot must be designed against that same bar, since a bug-report screenshot can just as easily capture a child's PII or a medical form in the background. The existing RBAC model (`src/utils/roles.js`) already distinguishes an app/club administrative tier (`super_admin`, `club_admin`) from team-operational roles (`team_manager`, `treasurer`, `scheduler`, `fundraiser`, `head_coach`, `assistant_coach`), so a submission-scope decision can be expressed without inventing a new permission axis.

## Section 2 — Decision

We will build a four-stage pipeline — **in-app intake → admin triage/approval → GitHub Actions-driven Claude Code run → pull request** — where submission is restricted to `super_admin`/`club_admin`, and no AI code-modification run starts until a second admin action explicitly approves that specific report.

Two properties make this safe to build on top of an already security-conscious app. First, the approval step is a genuine second gate, not a formality: it exists to stop a bad, duplicate, or out-of-scope report from burning a Claude Code run and cluttering the PR list before any compute is spent. Second, the screenshot — the one artifact in this feature most likely to carry sensitive data — never leaves the Supabase/GitHub Actions trust boundary: it is stored in a private bucket, referenced only by short-lived signed URLs, downloaded into a git-ignored path inside the Actions runner, and guaranteed-deleted at the end of the job. It is never committed, never placed in a PR body, and never exposed as a public URL. The pipeline produces a PR only — it never merges, matching how every other change lands in this repo today.

## Section 3 — Consequences

### Positive consequences

- Turns "someone mentioned a bug" into a structured, auditable record (`bug_reports` table) with reporter, timestamp, repro steps, and eventual PR link — closes a gap that exists today with zero tracking.
- The admin approval gate means Claude Code only runs on reports a human already judged worth attempting, bounding both cost and PR noise.
- Reuses infrastructure already in place and already trusted with sensitive data: Supabase Storage private-bucket + signed-URL pattern (same shape as the medical-document fix just shipped), Supabase Realtime (just repaired app-wide) for live triage-queue status, and the existing RBAC tiering for the submit/approve gate.
- Establishes the repo's first CI/CD surface (`.github/workflows/`), which the project can extend later (tests-on-PR, lint gates) beyond this one workflow.

### Negative consequences / trade-offs

- Adds a real, if small, ongoing compute/API cost per approved report (see ADR-003 for the auth-method decision that determines exactly how this is billed).
- Introduces GitHub Actions and a repo-scoped GitHub token as new operational dependencies with their own secret-rotation and permission-scoping burden.
- Claude Code will not always produce a correct or even compiling fix; the pipeline must handle "no usable diff" as a first-class outcome, not an edge case, and report it back into the triage queue rather than silently failing.
- Two-step approval adds latency (report sits until an admin reviews it) — acceptable given the user's explicit preference for a cost/safety gate over speed, but worth naming since a future ask for "faster turnaround" would reopen this trade-off.
- The admin who approves a fix is implicitly vouching for repro-steps quality; a vague report will produce a vague (or wrong) fix, and that failure mode isn't automatically detectable by the pipeline.

## Section 4 — Alternatives considered

### Alternative: Fully automatic run on submission (no approval gate)

**Why it was considered:** Fastest path from "bug seen" to "PR opened," and simpler to build (one fewer state transition, no triage UI).
**Why it was rejected:** Explicitly rejected by the user in favor of a human gate — the app is public-facing enough, and the population that would gain submit access broad enough, that an unreviewed report could trigger real spend and PR clutter on a garbage or duplicate report. This is the exact reason a second admin-only action was chosen over folding approval into the RBAC check on submission.

### Alternative: Any authenticated user can submit

**Why it was considered:** Casts a wider net for catching real bugs, since parents/guardians using the app day-to-day are more likely to hit UI bugs than admins are.
**Why it was rejected:** User explicitly scoped submission to admin/staff roles to keep the trust bar on submitters high, consistent with how this repo already treats every other sensitive-surface decision (see the medical-document access narrowing in the immediately preceding commit).

### Alternative: Direct-to-storage public screenshot URL referenced in the PR body

**Why it was considered:** Simplest possible implementation — skip signed URLs, just link the image directly in the GitHub Actions payload and PR description.
**Why it was rejected:** The repo is public; a public storage URL embedded in a PR is permanently visible to anyone, indefinitely, and this app's screenshots can incidentally capture medical/PII content in the background of a UI bug report. This conflicts directly with the access-narrowing the app just underwent for medical documents.

## Section 5 — Implementation notes

- New table `bug_reports` (see ER diagram below) with RLS restricting insert/select/update to `super_admin`/`club_admin`.
- New private Supabase Storage bucket `bug-report-screenshots` (not public), with storage policies mirroring the `player-documents` bucket policy pattern established in `sql/fix_documents_delete_rls_guardian_scope.sql`.
- New GitHub Actions workflow `.github/workflows/bug-fix.yml`, triggered only on `repository_dispatch` (event type `bug-fix-request`) — never on `pull_request_target`, never fork-triggerable.
- The Supabase → GitHub dispatch call must originate from a server-side Edge Function that independently re-verifies the caller's admin role and the report's `approved` status before calling the GitHub API — the client must never be able to forge a dispatch payload directly.
- See ADR-003 for the still-open decision on how the Actions workflow authenticates to Claude Code.

## Section 6 — References

- [ADR-001: Team-Tier Fundraiser Role and Guardian Role Formalization](./ADR-001-team-tier-fundraiser-role-and-guardian-formalization.md)
- [ADR-003: Claude Code CI Authentication Method](./ADR-003-claude-code-ci-authentication-method.md)
- `sql/fix_medical_release_admin_scope.sql`, `sql/fix_documents_delete_rls_guardian_scope.sql` — precedent for private-bucket + role-scoped RLS pattern this ADR reuses.
