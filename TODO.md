# Possible later additions

These are optional ideas, not commitments or first-release requirements.

The implemented slices now include single-day editing, cross-month bulk editing with direct conflict-free actions, explicit starts, and one-step Undo for whole edits or batches. These later ideas remain outside those slices and do not replace the remaining first-release work in PLAN.md.

- [ ] Improve origin isolation, for example by hosting Phase on a dedicated origin rather than alongside other apps on `username.github.io`. Moving origins requires an explicit export/import migration because browser storage does not move with the site.

- [ ] Add optional symptom logging, starting with a small, user-chosen set rather than a compulsory questionnaire.

- [ ] Show richer bleeding-duration and intensity summaries while distinguishing complete observations from gaps.

- [ ] Measure prediction accuracy using saved forecasts or clearly labelled walk-forward backtests. Report sample count, date error, and estimated-window coverage without using future information.

- [ ] Explore better-calibrated period estimates when suitable evaluation data exists. Retain transparent baselines and explanations for withheld estimates.

- [ ] Add symptom patterns by relative cycle day only when there are enough observations to make the display useful.

- [ ] Add optional notes with careful export handling and no implicit medical interpretation.

- [ ] Add keyboard range selection, shift-click, or touch gestures for faster calendar editing without replacing the discoverable selection mode.

- [ ] Explore a year overview and faster navigation to distant historical dates.

- [ ] Add user-configurable calendar preferences, such as the first day of the week and display date format.

- [ ] Add localisation without remote translation services or runtime assets.

- [ ] Broaden browser testing to Firefox, WebKit, and real mobile devices after agreeing on the necessary tooling and downloads.

- [ ] Improve backup reminders and browser-storage persistence handling without suggesting that either guarantees recovery.

- [ ] Consider CSV import if there is a concrete interoperability need. Define format mapping, validation, and date/conflict handling first.

- [ ] Support additional context for excluding intervals, such as explicitly recorded contraception changes or postpartum recovery, without inferring sensitive circumstances from bleeding patterns.

- [ ] Consider optional cervical mucus, BBT, and LH observations as a separate project phase. Observation logging and physiological inference are different features; neither should turn calendar estimates into contraception guidance.

- [ ] Consider clinically reviewed, non-diagnostic guidance only with an explicit evidence, audience, and wording review. Generic thresholds should not become automatic diagnoses.

- [ ] Explore improved standalone distribution if avoiding even static-host request metadata becomes a user requirement.
