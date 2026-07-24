# ADR-001: Team-Tier Fundraiser Role and Guardian Role Formalization

**Status:** Proposed
**Date:** 2026-07-24
**Author:** solution-architect agent
**Deciders:** Jonathan V Tran

---

## Section 1 — Context

The app currently models access with three explicit tiers — `super_admin` (app), `club_admin`/`club_manager` (club), and five team-tier roles (`team_manager`, `treasurer`, `scheduler`, `head_coach`, `assistant_coach`) — plus an implicit, undocumented `parent` fallback for guardians with no staff role. The working tree already contains an uncommitted, unmerged cleanup (`sql/merge_team_admin_role_migration.sql`, and matching changes across `roles.js`, `roles.test.js`, `complete_schema.sql`, `docs/DOCUMENTATION.md`) that folds a near-duplicate `team_admin` role into `team_manager`, since the two granted effectively identical access and existed only as an accident of naming.

Fundraising and sponsor work today has no dedicated role: it is covered by `treasurer` (`TEAM_EDIT_SPONSORS`) or `team_manager`, both of which also carry ledger and budget edit rights. A club that wants to hand sponsor/fundraiser outreach to a volunteer who should not see or touch the ledger has no way to express that in the current model. Separately, `parent` is referenced only as a scattered fallback string (`useTeamContext.js`, `App.jsx`) and a DB `CHECK` constraint value — it has no entry in `roles.js`'s `ALL_ROLES`/`ROLE_COLORS`, so it isn't a first-class, discoverable part of the role model despite being the default state for the largest user population (guardians).

## Section 2 — Decision

We will add a new team-tier `fundraiser` role scoped to sponsor/fundraising work without ledger or budget-edit access, and formalize `parent` as a documented, first-class (but non-assignable) role in `roles.js`, building on top of — not reversing — the in-flight `team_admin` → `team_manager` consolidation already in the working tree.

`fundraiser` is granted `TEAM_VIEW_ROSTER` (know which families to solicit), `TEAM_VIEW_BUDGET` (see the funding target it's working toward), and `TEAM_VIEW_SPONSORS`/`TEAM_EDIT_SPONSORS` (its core job) — deliberately excluding `TEAM_EDIT_BUDGET` and both ledger permissions, so money custody stays exclusively with `treasurer`/`team_manager`. It is added to `TEAM_ASSIGNABLE_ROLES` so a `team_manager` can assign it the same way they assign `treasurer`/`scheduler` today, without club-admin involvement. `parent` gets a documented constant in `roles.js` (not folded into `ALL_ROLES`, since it must stay non-assignable and app-computed) so the fallback stops being a magic string scattered across three files.

## Section 3 — Consequences

### Positive consequences

- Clubs can delegate sponsor outreach and pledge tracking to a volunteer without also granting ledger visibility or budget-edit rights — closes the access gap that currently forces an over-grant to `treasurer` or `team_manager`.
- `parent` becomes a documented, single-source-of-truth concept instead of a string repeated in `useTeamContext.js`, `App.jsx`, and `UserManagement.jsx`'s `ROLE_COLORS` map, reducing drift risk the next time someone adds a role.
- The design is purely additive on top of the already-in-progress `team_admin` consolidation — no rework of that WIP is required, and no existing role's permission set changes.

### Negative consequences / trade-offs

- Requires a second Supabase `CHECK` constraint migration (`fundraiser` added to `user_roles`/`invitations`) on top of the one already pending for the `team_admin` merge — two migrations to run in sequence instead of one.
- Three UI files (`UserManagement.jsx`, `TeamUserManagement.jsx`, `TeamList.jsx`) each hardcode a `ROLE_COLORS` map and need a fourth entry added in lockstep, or they silently fall back to the generic muted badge style.
- No existing user gets the new role automatically — every club that wants a dedicated fundraiser has to manually reassign someone from `treasurer`/`team_manager` to `fundraiser`, which is a manual rollout step, not a data migration.
- Adds a fifth team-tier role to reason about in `getHighestTeamRole`'s priority list and in any future permission audit.

## Section 4 — Alternatives considered

### Alternative: Free-form per-user permission grid (no fixed roles)

**Why it was considered:** Would eliminate this whole class of problem — any future job (fundraiser, registrar, photographer) becomes a checkbox, not a code change.
**Why it was rejected:** This is a volunteer-run club app, not an enterprise multi-tenant SaaS; the fixed-role model with multi-role-per-user (already supported via the `user_roles` join table) already covers people who wear multiple hats. A permission grid multiplies admin-UI complexity and support burden for a marginal, currently-hypothetical need.

### Alternative: Model fundraising as a `treasurer` sub-permission toggle instead of a separate role

**Why it was considered:** Avoids adding a fifth team role and a new migration; `treasurer` already holds `TEAM_EDIT_SPONSORS`.
**Why it was rejected:** Conflates money custody with sponsor outreach — the entire point of the request is to let someone do fundraising _without_ ledger/budget access. A toggle on `treasurer` doesn't let you assign a fundraiser who isn't also a treasurer.

### Alternative: Revert the in-flight `team_admin`→`team_manager` merge and rename `team_manager` to `team_admin` to match the user's literal wording

**Why it was considered:** The user's phrasing named "team admin" explicitly.
**Why it was rejected:** Confirmed with the user this was a loose listing of admin tiers ("club admin, team admin" = the club-level and team-level lead), not a request to relitigate the naming. The uncommitted merge exists precisely because `team_admin`/`team_manager` were a confusing near-duplicate pair; reverting it for a pure rename would reintroduce the ambiguity it just resolved for no functional gain.

## Section 5 — Implementation notes

- `roles.js` is the single source of truth; every downstream file (`ROLE_COLORS` maps, dropdown `<optgroup>`s, help text) reads from it — implementers should not hardcode the new role's label/description a second time anywhere.
- The `team_admin` consolidation already sitting in the working tree should land first (or in the same PR) — the fundraiser work is additive on top of it, not a replacement.
- `parent` stays out of `ALL_ROLES`/`CLUB_ASSIGNABLE_ROLES`/`TEAM_ASSIGNABLE_ROLES` — it must never appear as an assignable option in an invite/assign dropdown, only as a display fallback.
- Fundraiser's permission set intentionally mirrors the existing `fundraiser` subagent's charter (tracks pledges/sponsors, drafts pitches, "never handles payments") — keep the two in sync if either changes.

## Section 6 — References

- [sql/merge_team_admin_role_migration.sql](../../../sql/merge_team_admin_role_migration.sql) — in-flight role consolidation this ADR builds on
- [src/utils/roles.js](../../../src/utils/roles.js) — current role/permission source of truth
