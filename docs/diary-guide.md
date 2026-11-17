# Using Phase

[Open Phase](https://jon32446.github.io/phase/) · [Back to the README](../README.md)

## Record and correct your history

Choose **Log today** or tap a past calendar date. Record no bleeding, spotting, light, medium, or heavy bleeding, and mark period starts separately. You can correct old entries at any time.

Blank days have no entry. Choose **No bleeding** when you want to record that observation. You do not need to log every day for your period-start history to be useful.

Use **Select days** to edit bleeding observations across multiple dates or months. If an edit would conflict with an existing period-start marker, Phase asks you to resolve it before saving.

### Undo an edit

The save confirmation offers **Undo**. If you dismiss the confirmation or change tabs, **Undo last edit** remains in the header.

Undo covers the last changed edit, batch, or history-review answer. It remains available until your next successful changed edit or a reload. Unchanged saves, cancelled edits, failed saves, navigation, and elapsed time do not replace it. Successful backup restores and complete deletion clear Undo.

## Understand your history

History shows your recorded starts, the intervals between them, descriptive length ranges, and your saved answers about gaps.

Check-ins ask whether all period starts are recorded for a particular span. You can say that the history is complete, that a start is missing but you have forgotten the date, or that you are unsure. These answers do not change your daily observations or invent missing dates.

Correcting a period start can make an earlier answer need review. Use **Check this history** or **Change answer**, choose what you remember, and approve replacing the earlier answer. If you remember the actual date, choose **Remember a missing start date?** to record it.

Answers cover fixed dates and do not extend automatically. Re-reviewing overlapping answers replaces their whole covered span with your approval. Adding a remembered start does not by itself resolve an existing missing-start report. An unsure answer preserves that warning until you explicitly resolve or remove it.

### How summaries and estimates use history

The usable-interval summary includes confirmed complete intervals and provisional intervals without reported missing starts or unresolved reviews. Their counts are shown separately. Missing and unresolved intervals are excluded. Confirmed complete long intervals keep their actual lengths.

The Calendar can show a next-period range when at least three eligible intervals exist among the latest six recorded intervals. It takes the shortest and longest eligible lengths and adds two days of padding on each side. The earliest estimated date is at least one day after the latest start. The display includes the sample count and any provisional-history caveat. **About this estimate** explains the method in the app.

Relevant unresolved history withholds an estimate, even when an affected interval is short. Known-missing completed intervals are excluded. A passed estimate is labelled as passed rather than moved forward.

A long interval does not automatically mean a period start is missing. Gap checks compare with your personal median only when at least three other usable intervals exist. Otherwise they explain that history is limited without applying a population-based duration cutoff. Dismissing a check-in does not confirm the history or unlock an estimate. Dismissed and unsure spans are not prompted again unless their recorded starts change. After you confirm history since the latest start, automatic check-ins wait at least seven days before asking again.

The estimated range is an engineering heuristic, not a calibrated confidence interval. Timing can vary. Phase cannot diagnose health conditions. Do not rely on its estimates for contraception.

## Back up or move your diary

In Settings, **Save a backup** downloads `phase-backup.json`. It includes observations, period starts, history-review answers, and check-in dismissals. Everything is read locally without uploading your diary.

Keep this unencrypted file somewhere secure. Browser storage can be lost, including when you clear site data. Installation and offline caching do not provide a backup.

### Restore a backup

Choose a JSON backup with **Preview restore**. Phase validates the file and shows counts for your existing diary and the incoming data before asking for confirmation.

**Restoring replaces your entire diary. It does not merge entries and cannot be undone.** Save a backup of your current diary first if you want to keep it. An empty backup intentionally replaces the diary with no records.

Invalid backups and failed writes leave existing data intact. If your stored diary changes while a preview is open, open a fresh preview before confirming.

To move between devices, browsers, or hosting addresses, save a backup in the old location and restore it in the new one. There is no automatic sync.

### Export a spreadsheet

Open **Need a spreadsheet instead?** in Settings and choose **Export observations CSV**. The resulting `phase-observations.csv` includes recorded daily observations and period-start markers. It leaves out unrecorded days, history reviews, and check-in dismissals.

CSV is for working with observations in other tools. Use JSON for a complete backup that Phase can restore. Both formats are unencrypted.

## Delete saved data

**Delete all data** requires explicit confirmation and cannot be undone. It clears the saved diary and session Undo. It does not remove downloaded exports, records on other devices or browsers, or unrelated apps' data.

Restore and deletion ask other open Phase tabs to reload and discard old drafts and Undo. If your browser cannot notify those tabs, close them to clear their old displays. Their old Undo cannot restore removed records.

Deletion also works offline once the app is loaded. Cached application files remain available and contain no health records.

## Offline use and updates

Visit Phase online first and check **Settings > Here, even offline** for confirmation that setup succeeded. After that, the same address can load offline. Installation is optional and its availability varies by browser.

Phase checks for updates when you open it or return to it. Once an update has downloaded, **A fresh version is ready** offers **Restart to update**. Finish or cancel any editing, day selection, restore/deletion preview, or save first.

Restart preserves saved records but clears memory-only Undo. Minimizing the app does not apply an update or discard a draft. Other open windows are not automatically restarted. If you close all Phase windows, a downloaded update can activate before the next visit.

A failed update leaves the current offline version available. Clearing site data or browser storage eviction can remove both your diary and the offline files.
