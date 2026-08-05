# ADR-003: Claude Code CI Authentication Method

**Status:** Proposed — requires user decision before Milestone 1 begins
**Date:** 2026-07-27
**Author:** solution-architect agent
**Deciders:** Jonathan V Tran

---

## Section 1 — Context

The bug-fix pipeline defined in ADR-002 runs Claude Code headlessly (`claude -p`) inside a GitHub Actions job with no human present to complete an interactive login. Claude Code supports two distinct authentication paths for this: an Anthropic Console API key (`ANTHROPIC_API_KEY`, metered pay-as-you-go billing), or a long-lived OAuth token generated from an existing Claude Pro/Max subscription for non-interactive use. The user's explicit constraint is cost — they would prefer to reuse a subscription they already pay for rather than take on a second, metered billing relationship. However, a Pro/Max subscription is priced and licensed around individual interactive use; using it to power an automated, unattended pipeline that runs in response to end-user (admin) actions on a deployed product is a materially different usage pattern, and this ADR has not independently confirmed that Anthropic's current usage policy treats that as permitted for this use case. This decision should not be made on cost alone — cost, policy risk, and operational simplicity all need to be weighed together, and it should be revisited if it's the source of a problem.

## Section 2 — Decision

We will treat this as an explicit setup-time decision the user makes in Milestone 1, not something this architecture presupposes — the pipeline design is auth-method-agnostic (the workflow only needs one secret injected as an environment variable), so the choice does not block or reshape ADR-002.

Before Milestone 1 begins, the user should check current Anthropic documentation/usage policy for whether subscription-based CI/CD usage is permitted on their plan, and weigh that against the API-key path's cost, which is small at this feature's expected volume: an admin-gated pipeline processing a handful of approved bug fixes per month, at typical Claude Code fix-run token usage, likely lands in the range of well under a few dollars a month in aggregate API spend — a number worth confirming against current published rates rather than trusting this estimate, but small enough that "avoid a second subscription" and "avoid policy ambiguity" may not both be free to have at once.

## Section 3 — Consequences

### Positive consequences

- Deferring this decision keeps ADR-002's architecture clean and doesn't block the rest of the design on a billing/policy question outside this document's authority to resolve.
- Whichever path is chosen, switching later is a one-secret change (`ANTHROPIC_API_KEY` vs. the subscription OAuth token env var) with no workflow redesign required.

### Negative consequences / trade-offs

- **Subscription token path:** cheaper on paper, but usage-policy fit for an automated product feature (versus an individual developer using Claude Code interactively) is unconfirmed as of this writing and should be checked against current Anthropic terms before relying on it — if it turns out not to be permitted for this use pattern, the pipeline needs to fall back to the API-key path anyway, making the "savings" temporary.
- **API-key path:** clean, clearly-licensed, no policy ambiguity, and — per the volume estimate above — likely inexpensive at this feature's actual usage level; the trade-off is a second billing relationship to set up and monitor, not a technical cost.
- Either way, someone needs to actually generate the credential and add it as a GitHub Actions repo secret before the workflow in ADR-002 can run for the first time — this is a hard prerequisite, not a nice-to-have.

## Section 4 — Alternatives considered

### Alternative: Commit to the subscription-token path now

**Why it was considered:** Directly matches the user's stated cost preference and avoids opening a second billing relationship.
**Why it was rejected (as a settled decision, not as an option):** The usage-policy fit for this specific pattern — an automated pipeline triggered by end-user actions on a deployed product, not a human running Claude Code interactively — was not something this ADR could verify with confidence. Committing to it now risks building Milestone 1 around a credential path that later turns out to be against terms of service for this use case, which would be a harder problem to unwind than simply picking the other path up front.

### Alternative: Commit to the API-key path now

**Why it was considered:** Zero policy ambiguity, standard CI pattern, and the estimated cost at this feature's volume is small.
**Why it was rejected (as a settled decision, not as an option):** The user explicitly asked whether the existing subscription could be leveraged instead, specifically to avoid this cost — deciding for them without letting them weigh the (likely small) real dollar cost against the subscription option would override a preference they raised directly.

## Section 5 — Implementation notes

- Whichever path is chosen, the credential is injected into `.github/workflows/bug-fix.yml` as a single repo secret and referenced as an environment variable in the `claude -p` step — no other part of ADR-002's design changes.
- Before first real run: verify the exact current CLI command/token name for subscription-based headless auth (if that path is chosen) against current Claude Code documentation, since CLI mechanics can change between releases.
- Whichever path is chosen, scope the credential narrowly (a key/token usable only for what this workflow needs) and store it only as a GitHub Actions encrypted secret — never in the repo, never in a workflow log.

## Section 6 — References

- [ADR-002: Admin-Gated Bug-Report-to-PR Automation Pipeline](./ADR-002-admin-gated-bug-report-to-pr-pipeline.md)
