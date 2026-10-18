---
title: Record Browser
description: Browse and filter finding records, inspect details, and verify, resolve, ignore, or mark selected records as solved.
---

Use `health:records` to inspect persisted finding records and act on them from a terminal.

## Contents

- [Usage](#usage)
- [Filters and pagination](#filters-and-pagination)
- [Keyboard controls](#keyboard-controls)
- [Inspect details](#inspect-details)
- [Verify and resolve](#verify-and-resolve)
- [Ignore and mark as solved](#ignore-and-mark-as-solved)
- [Batch results and refresh](#batch-results-and-refresh)
- [Fallback menus](#fallback-menus)
- [Exit status](#exit-status)

## Usage

```bash
php artisan health:records
```

When standard input and output are terminals, the command opens an interactive table. Use `-n` to print one page and exit. Piped or redirected runs are non-interactive automatically.

Records are ordered by ID. The default filter is `active`, with 20 records per page. The table shows each record's ID, finding key, model type and ID, status, urgency, and available actions.

## Filters and pagination

| Option | Behavior |
| --- | --- |
| `--status=active` | `active`, `ignored`, `resolved`, or `all`. |
| `--finding=key-or-class` | Restrict the list to a registered finding key or fully qualified class name. |
| `--page=1` | A positive page number. Beyond the last page, the last available page is shown. |
| `--per-page=20` | Between 1 and 100 records per page. |
| `--interactive` | Explicitly request browsing; automatic when standard input and output are terminals. |
| `--no-interaction`, `-n` | Print a page and exit without prompting. |

```bash
php artisan health:records --status=all
php artisan health:records --finding=PaidOrderMarkedPending --per-page=10
php artisan health:records --status=ignored --page=2 -n
```

Pagination bounds the records loaded for display and selection. Invalid filters, unknown finding selectors, and invalid page sizes fail the command. An empty result set succeeds with `No finding records match these filters.`.

## Keyboard controls

| Key | Action |
| --- | --- |
| Up / Down, `k` / `j` | Move the highlighted row. |
| Space | Check or uncheck the highlighted row. |
| `a`, Ctrl+A | Toggle all rows on the current page. |
| `v` | Run verification on checked rows, or the highlighted row if none are checked. |
| `r` | Run resolution on checked rows, or the highlighted row if none are checked. |
| `i` | Ignore checked active rows, or the highlighted active row if none are checked. |
| `s` | Mark checked active or ignored rows as solved, or the highlighted row if none are checked. |
| Enter | Inspect the highlighted row, regardless of checked rows. |
| `n` / `p` | Next / previous page, when it exists. |
| `f` | Refresh records with the current filters. |
| `q` | Exit the browser. |

Selection is limited to the current page and resets after an action, inspection, refresh, or page change. Narrow terminals hide secondary columns and truncate long values to fit; inspect the row for its full values.

## Inspect details

Press Enter on a row to display its record ID, finding key, model identity, status, urgency, worklist, context, and last detection time. Inspection does not modify the record or affected model.

Stored context distinguishes occurrences when the same model has more than one record for a finding type. See [Context](/data-health-docs/guides/context/) for identity rules and [Metadata and Worklists](/data-health-docs/guides/metadata-and-worklists/) for urgency and worklist values.

## Verify and resolve

Press `v` to execute verification or `r` to execute the resolver. The finding must implement `CanVerify` or `CanResolve` for the requested action. The final result is evaluated through the manager, including boolean, callback, and handler results.

A final `true` marks the record `resolved`; `false` leaves its status unchanged and counts as a failed action. Exceptions also count as failures. See the [Verification](/data-health-docs/cli/verify/) and [Resolution](/data-health-docs/cli/resolve/) command references for direct ID execution.

With an explicit `--status=ignored`, `resolved`, or `all` filter, these actions are still available on records whose findings support them. Unsupported selected rows are skipped with a message while supported rows continue.

## Ignore and mark as solved

These are manual record-status actions in the browser. They require no finding contract and remain available when the stored finding key can no longer be discovered.

| Key | Eligible records | Result |
| --- | --- | --- |
| `i` | Active records. | Sets status to `ignored`. Already ignored or resolved rows are skipped. |
| `s` | Active or ignored records. | Sets status to `resolved`. Already resolved rows are skipped. |

Neither action calls verification or resolution logic or changes the affected model. **`s` records a manual conclusion; `r` runs the resolver to attempt a correction.**

Use `--status=ignored` or `--status=all` to review ignored records. Detection keeps an ignored occurrence ignored; detecting the same resolved identity again reactivates it. See [Record statuses](/data-health-docs/core-concepts/findings-and-records/#record-statuses) for the lifecycle rules.

## Batch results and refresh

Check rows with Space, then press an action key. Each record reports its result, followed by a summary:

```text
Finding record 12 marked as solved.
Action summary: 1 succeeded, 0 failed.
```

Failures do not stop the remaining selected records. The browser refreshes after each operation; ignored or resolved records leave the default active list. The page adjusts when the list shrinks. An empty result set closes the browser and returns to the main menu if launched through `health`.

A record that disappears or becomes ineligible before a manual status change is saved reports a failure. Save failures also leave the batch free to continue.

## Fallback menus

Where raw input is unavailable, including Laravel's Windows fallback, the command displays the table and a **Record actions** menu. Choose **Inspect a record**, **Verify records**, **Resolve records**, **Ignore records**, or **Mark records as solved**, then select from the offered records. The selection lists include only records supporting that action. An empty action selection runs nothing.

Next/previous page controls appear when those pages exist. **Refresh records** reruns the current filters. If terminal setup fails while opening the keyboard table, the browser switches to this menu flow.

## Exit status

Printing a page, viewing an empty list, or closing a browser with successful actions returns `0`. Invalid input, database errors, and failed actions return `1`. A failed batch is remembered even if later actions succeed; closing the browser still returns `1`. Unsupported rows skipped before execution do not count as failed actions. See [Automation and Exit Codes](/data-health-docs/cli/automation/) for non-interactive output and batch failure behavior.
