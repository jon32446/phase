# Project rules

- Use paragraph-per-line format for docs, no soft-wrapping.
- Keep README.md and TODO.md up-to-date after changes.
- README.md serves repository readers: introduce the project, summarise current capabilities, preserve the privacy commitment with explicit outstanding-work caveats, and provide portable run, hosting, and test instructions.
- docs/first-release-plan.md archives the completed first-release requirements, approved decisions, and acceptance criteria. Preserve it as the first-release baseline. TODO.md holds optional future ideas, not release requirements.
- Do not append task summaries, machine-specific environment observations, or agent operating instructions to README.md, docs/first-release-plan.md, or TODO.md. Agent operating instructions belong here.
- Never commit without explicit permission from the user.
- Project is written with Vanilla JavaScript, HTML, and CSS - all source is in the repo, no external dependencies for the published page.
- Ask before installing or upgrading packages, downloading browsers, or installing system dependencies. Prefer project-local tooling and reuse existing browser binaries where compatible.
- Ask before resolving open UX, behavioural, or prediction-policy decisions; do not silently turn proposals in project documentation into requirements.
- Use synthetic health data in tests and examples. Never put real user records in logs, URLs, screenshots, issues, or committed fixtures.

## App copy

Write warm, direct, concrete copy that helps someone use their diary. Avoid "X, not Y" contrast slogans and editorial taglines. Prefer short sentences to semicolon-linked explanations, and rewrite the thought where needed instead of mechanically swapping punctuation.

| Avoid | Use |
|---|---|
| "An estimate, not a promise." | "Your next period may start around these dates. The timing can vary." |
| "A diary, not a diagnosis." | "Phase cannot diagnose health conditions. Do not rely on its estimates for contraception." |
| "A blank day means not recorded, not no bleeding." | "Blank days have no entry. Choose 'No bleeding' when you want to record that observation." |
| "Exports are unencrypted; store them securely." | "Keep this unencrypted file somewhere secure." |

Keep ordinary negatives such as "I'm not sure", "Your change was not saved", and "cannot be undone". Preserve uncertainty, privacy caveats, and explicit data-loss and contraception warnings. Never replace a precise warning with reassuring language that weakens its meaning.
