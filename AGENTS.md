# Project rules

- Use paragraph-per-line format for docs, no soft-wrapping.
- Keep README.md, PLAN.md and TODO.md up-to-date after changes.
- README.md serves repository readers: introduce the project, summarise current capabilities, preserve the privacy commitment with explicit outstanding-work caveats, and provide portable run, hosting, and test instructions.
- PLAN.md holds first-release requirements, approved decisions, remaining work, and acceptance criteria. TODO.md holds optional future ideas, not release requirements.
- Do not append task summaries, machine-specific environment observations, or agent operating instructions to README.md, PLAN.md, or TODO.md. Agent operating instructions belong here.
- Never commit without explicit permission from the user.
- Project is written with Vanilla JavaScript, HTML, and CSS - all source is in the repo, no external dependencies for the published page.
- Ask before installing or upgrading packages, downloading browsers, or installing system dependencies. Prefer project-local tooling and reuse existing browser binaries where compatible.
- Ask before resolving open UX, behavioural, or prediction-policy decisions; do not silently turn proposals in PLAN.md into requirements.
- Use synthetic health data in tests and examples. Never put real user records in logs, URLs, screenshots, issues, or committed fixtures.
