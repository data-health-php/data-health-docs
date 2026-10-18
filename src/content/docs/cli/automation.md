---
title: Automation and Exit Codes
description: Run Data Health commands without prompts, interpret results, and separate queue dispatch from worker execution.
---

Use direct Artisan commands to run Data Health from scripts and interpret their completion status.

## Contents

- [Run without prompts](#run-without-prompts)
- [Queue detection](#queue-detection)
- [Interpret exit codes](#interpret-exit-codes)
- [Batch failure behavior](#batch-failure-behavior)
- [Related reference](#related-reference)

## Run without prompts

Use the direct commands with `--no-interaction` (`-n`) for automation:

```bash
php artisan health:detect -n --no-progress
php artisan health:detect PaidOrderMarkedPending -n --no-progress
php artisan health:records --status=active --page=1 --per-page=100 -n
php artisan verify 12 -n
php artisan resolve 12 -n
```

Detection and record browsing are interactive by default only when both standard input and output are terminals. A pipe or redirected stream disables that automatic interaction. An explicit `-n` keeps the intent stable when a script is later run from a terminal.

```bash
php artisan health:records --status=all -n > finding-records.txt
php artisan health:detect -n --no-progress > detection.log
```

`health:records` prints a human-readable table, not JSON or CSV. It outputs one page per invocation. Use `--page` and `--per-page` to inspect additional pages. `--no-progress` hides only detection progress; individual results and the summary remain.

`--interactive` cannot be combined with `-n`. The `health` main menu rejects `-n`; use its direct child commands in scripts.

## Queue detection

```bash
php artisan health:detect --async --queue=data-health --connection=redis -n --no-progress
```

Command success confirms dispatch or an existing queued/running job. It does not confirm background completion. Configure the application connection, shared uniqueness locks, and workers as described in [Scheduling and Queues](/data-health-docs/guides/scheduling-and-queues/).

Async progress counts dispatch attempts by finding class. Worker failures follow the application's queue retry and failure handling. A `sync` connection executes the dispatched job during the command.

## Interpret exit codes

| Command | Success | Failure |
| --- | --- | --- |
| `health:detect` | `0` when no detection/dispatch fails, including empty selections and skipped unique jobs. | `1` for invalid selectors/options, detection failures, or dispatch failures. |
| `health:records` | `0` for a printed page, empty results, or a browser closed without failed actions. | `1` for invalid input, database errors, or any failed record action. |
| `verify ID`, `health:verify ID` | `0` for a final `true`. | `1` for `false`, missing records, unsupported actions, or exceptions. |
| `resolve ID`, `health:resolve ID` | `0` for a final `true`. | `1` for `false`, missing records, unsupported actions, or exceptions. |
| `health:make:finding` | `0` when the file is generated. | Nonzero for invalid options, an existing file without `--force`, or file creation failure. |
| `health` | `0` when closed after successful child operations. | `1` when interaction is disabled or a child operation failed. |

Framework argument validation can also reject a command before its handler runs, for example when a required ID or class name is missing. Treat any nonzero exit code as failure.

## Batch failure behavior

Detection continues after a failed finding. The record browser continues after a failed selected record. Neither turns a partial batch into success merely because later work succeeded.

The browser remembers failures until it closes. The main suite remembers child-command failures until **Exit**. Skipping an unsupported selected row before execution does not count as a failed action.

The commands do not roll back application data changed by a finding before it returned `false` or threw. Retries should account for possible partial work and use idempotent application logic where appropriate.

## Related reference

- [Detection options and progress](/data-health-docs/cli/detect/)
- [Record filters and keyboard actions](/data-health-docs/cli/records/)
- [Verification](/data-health-docs/cli/verify/) and [Resolution](/data-health-docs/cli/resolve/)
- [Finding generation and option validation](/data-health-docs/guides/generating-finding-classes/)
