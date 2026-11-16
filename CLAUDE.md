# CampusBazaar

CampusBazaar is a university-focused student marketplace built with React, CSS, Node.js, Express and MySQL, with real-time auction updates using WebSockets/Socket.IO.

## Key commands

- Inspect `package.json` files before running project commands; use the scripts that actually exist.
- Run the relevant test, lint, type-check and build scripts after changing code.
- Do not invent command names or claim a check passed unless it was run successfully.
- If a required check is missing or cannot run, report that clearly.

## Important project constraints

- Treat the project's SRS, use-case specifications, DFD and feasibility report as the requirements source of truth when those documents are available.
- Keep the official name **CampusBazaar** in new user-facing branding, page titles and project documentation.
- The product is a marketplace for university students; it is not a marketplace for buying or selling universities.
- Preserve the documented roles and permissions: Student/User, Buyer, Seller and Administrator. Enforce authorization on the server.
- Do not add features or workflows that are not required or approved.
- University email verification is part of the authentication direction; do not add a separate login use case to the documented use-case plan.
- Validate untrusted input on the server and use parameterized SQL queries.
- Keep credentials and secrets out of source control; use the project's existing environment-variable conventions.
- Do not change the database schema, API contracts or architecture without inspecting dependencies and explaining the impact first.

## Auction correctness — critical

- The server and database are authoritative for auction status, current bid, end time and winner.
- Validate every bid against the latest persisted auction state; never trust a browser's displayed bid or countdown.
- Prevent concurrent bids from being accepted against the same stale state; use the database's transaction/locking capabilities where appropriate.
- Reject bids that are invalid, do not exceed the current valid bid, or arrive after the server-side end time.
- Persist an accepted bid before broadcasting it to connected clients.
- Do not invent tie-breaking, payment, escrow, shipping or dispute workflows. If a missing rule blocks implementation, ask before deciding.

## Working approach

- Inspect the relevant files and existing patterns before editing; do not assume the repository structure or installed tools.
- Make the smallest complete change for the requested task. Avoid broad refactors and unnecessary dependencies.
- Follow the conventions already present in the codebase; use configured formatters and linters rather than documenting style rules here.
- Keep existing working behaviour unless the task explicitly requires changing it.
- Test the changed path and review the diff for unrelated edits, security issues and accidental secrets.
- Report what changed, which checks were run, their actual results, and any unresolved issue.
- Ask one focused question when an essential product or technical decision is missing; otherwise proceed only with a clearly stated, low-risk assumption.

## Further documentation

- Read the SRS and use-case specifications when implementing or changing product behaviour.
- Read the DFD when changing data flows or process boundaries.
- Read the feasibility report when evaluating technology or deployment choices.
- Follow [docs/business-rules.md](docs/business-rules.md) for team-approved rules the SRS leaves open (bids, durations, categories, reviews, moderation).
- Keep detailed schemas, setup steps, test procedures and feature-specific rules in focused documentation near the relevant code; link that documentation here only when it exists and is needed regularly.
- Update this file only when a durable, project-wide fact or recurring pitfall is discovered. Remove obsolete guidance instead of continually appending rules.
