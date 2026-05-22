# Claude Code pointer (genoly-mobile)

See `AGENTS.md` in this directory for the repo-level operating manual.

That's the cross-tool schema — every AI tool (Claude Code, OpenCode/Kimi, Cursor, Cline, Aider, etc.) reads it via its own auto-discovery convention. This `CLAUDE.md` file exists only so Claude Code's auto-discovery finds the right place.

## Reading order

1. `/Users/snalluri/Personal/Code/Geno/AGENTS.md` (workspace operating manual)
2. `/Users/snalluri/Personal/Code/Geno/master-context.md` (cross-repo state snapshot)
3. `./AGENTS.md` (this repo's operating manual)
4. `./memory-bank/index.md` (content catalog)
5. Last 10 entries of `./memory-bank/log.md`
6. `./memory-bank/wiki/current/*` (current focus, progress, handoff, overview)

After that, wait for the user's instruction.

## Mobile-specific reading additions

For implementation work, also read:
- `../genoly-family-web/docs/mobile-sync-architecture.md` (client-side architecture — token lifecycle, offline queue, retry policy, error matrix, permission flow, clock-drift, background fetch, subscription compliance)
- `../genoly-family-web/docs/fitness-api-contract.md` (the 20 server endpoints this app talks to)
- `./FORK_PROCEDURE.md` (if working on fork-impact assessment)
