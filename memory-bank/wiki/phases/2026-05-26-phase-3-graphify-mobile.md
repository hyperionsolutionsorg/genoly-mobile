---
type: phase
phase: ai-memory-bank-phase-3-mobile
date: 2026-05-26
status: merged
commit: 07ab407
owner: claude
collaborator: graphify (CLI, AST-only path)
tags: [memory-bank, graphify, knowledge-graph, ai-tooling]
sources: ["[[karpathy-memory-bank-pattern]]"]
---

# AI memory bank Phase 3 (mobile) — Code knowledge graph

**One-line:** Mobile mirror of the workspace-wide Phase 3 work. Ran `graphify update .` (AST-only, no LLM), shipped `docs/GRAPH_REPORT.md` via Claude (narrative form), installed graphify hooks + AI tool adapters.

## What shipped

| Artifact | Path | Purpose |
|---|---|---|
| Code knowledge graph report (narrative) | `docs/GRAPH_REPORT.md` | ~280 lines mapping what's here today (Expo boilerplate) + planned packages (api-client / health-sync / types) + 5 blocking decisions + hard rules. Heavily forward-looking since mobile Phase 1 hasn't started. |
| Structured graph | `graphify-out/graph.json` | 425 nodes, 413 edges, 44 communities — AST-derived from current code. Gitignored (regenerable). |
| Interactive viewer | `graphify-out/graph.html` | Force-directed D3 viewer (force-directed). Gitignored. |
| Tree viewer | `graphify-out/GRAPH_TREE.html` | Hierarchical collapsible-tree viewer. Gitignored. |
| Auto-update hooks | `.git/hooks/post-commit` + `.git/hooks/post-checkout` | Re-run `graphify update .` on every commit / checkout. Local-only (not pushed to remote). |
| Claude Code hook | `.claude/settings.json` | PreToolUse hook that injects "use graphify query" reminder before Bash tool calls — active because `graph.json` exists. |
| OpenCode plugin | `.opencode/plugins/graphify.js` + `.opencode/opencode.json` | Same gating logic for OpenCode/Kimi sessions. |
| AGENTS.md integration | `AGENTS.md` "Code knowledge graph report" section | Tells AI tools to read `docs/GRAPH_REPORT.md` first; documents all 6 graphify CLI commands available. |
| CLAUDE.md pointer | One paragraph | Short reference back to AGENTS.md's section. |

## Why this went smoothly (unlike web)

The web repo's Phase 3 attempts (LM Studio + Ollama) all failed before we bypassed graphify and had Claude generate the report directly. For mobile we **skipped the LLM path entirely** — went straight to `graphify update .` (AST-only, no LLM, no API key needed) which produced graph.json + graph.html + AST-derived GRAPH_REPORT.md in ~15 seconds.

This is the recommended path for any future repos: **start with `graphify update .` instead of `graphify extract .`** — you get the full visual + queryable graph from AST alone, and only need cloud LLM access if you want semantic extraction of docs/markdown content on top.

For the narrative report (Claude-generated `docs/GRAPH_REPORT.md`), I leaned heavily on:
- This repo's existing `AGENTS.md` (which is comprehensive)
- The canonical `../genoly-family-web/docs/mobile-sync-architecture.md` (the design source-of-truth)
- The actual code structure of `apps/mobile/` + `packages/`
- The 5 blocking decisions captured in `[[mobile-step-1-token-store]]`

## Why mobile's report is shorter than web's (280 vs 557 lines)

- **Less code today.** Most of `packages/` is `.gitkeep` placeholders. The mobile codebase is mostly Expo boilerplate.
- **Heavy pointer to external doc.** The planned architecture is fully documented in `../genoly-family-web/docs/mobile-sync-architecture.md`; this report's §6 just enumerates the section headings rather than duplicating content.
- **5 blocking decisions are the actual roadmap.** Until those resolve, there's not much *current* structure to document — just *planned* structure.

When mobile Phase 1 actually ships and the packages fill in, the report should be regenerated (Claude or graphify-with-cloud-key, depending on what's available).

## Cross-references

- Workspace Phase 3 (web repo): [`../../../genoly-family-web/memory-bank/wiki/phases/2026-05-26-phase-3-graphify.md`](../../../../genoly-family-web/memory-bank/wiki/phases/2026-05-26-phase-3-graphify.md)
- Karpathy memory bank pattern: [[karpathy-memory-bank-pattern]]
- The 5 blocking decisions: [[mobile-step-1-token-store]]
- Mobile sync architecture (the design doc graphify report cross-references heavily): `../genoly-family-web/docs/mobile-sync-architecture.md`

## What's the same vs web

Same:
- Tool installation (`pipx install graphifyy`, `pipx inject graphifyy openai`)
- Adapter installs (`graphify claude install` + `graphify opencode install`)
- Hook installs (`graphify hook install`)
- `.gitignore` pattern (entire `graphify-out/` directory)
- Cleaned up auto-installed AGENTS.md / CLAUDE.md sections to point at `docs/GRAPH_REPORT.md`

Different:
- Skipped the LLM extraction attempt (web tried LM Studio + Ollama + failed; mobile went straight to AST-only path)
- Smaller report (mobile has less code today)
- Phase number disambiguation: web phase page is `2026-05-26-phase-3-graphify.md`; mobile is `2026-05-26-phase-3-graphify-mobile.md`

## Closes mobile's contribution to the 3-phase plan

| Phase | Status (mobile) |
|---|---|
| 1 (Karpathy hybrid foundation) | ✅ DONE 2026-05-22 via `d4fbecc` |
| 2 (mcp-memory-service) | ⏸️ STAY PARKED — workspace-wide decision 2026-05-26 |
| 3 (Graphify) | ✅ DONE 2026-05-26 (this phase) |

The original 3-phase AI memory bank plan is now fully complete across both repos.
