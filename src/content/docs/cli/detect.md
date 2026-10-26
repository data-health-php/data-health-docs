---
title: Detection Command
description: Select finding classes, run detection with progress, or dispatch unique detection jobs.
---

Use `health:detect` to run detection for discovered finding classes or dispatch their detection jobs.

## Contents

- [Usage](#usage)
- [Arguments and options](#arguments-and-options)
- [Select and exclude findings](#select-and-exclude-findings)
- [Interactive selection](#interactive-selection)
- [Progress and output](#progress-and-output)
- [Queue a run](#queue-a-run)
- [Exit status](#exit-status)

## Usage

```bash
php artisan health:detect [findings...]
```

The command operates on discovered finding classes implementing `DataHealth\Contracts\CanDetect`. It honors `Async` on `detect()`, otherwise runs synchronously, and ignores cron timing and `data-health.scheduler.enabled`. Findings do not need `Scheduled` for a manual run.

For implementing the finding's detection logic, see [Detecting Problems](/data-health-docs/guides/detecting-problems/).

## Arguments and options

| Argument or option | Behavior |
| --- | --- |
| `findings...` | Optional registered keys or fully qualified class names. Omit to include every detectable finding as a candidate. |
| `--except=...` | Exclude a key or class. Repeat for multiple exclusions. |
| `--interactive` | Explicitly request selection; it is automatic when standard input and output are terminals. |
| `--no-interaction`, `-n` | Run the validated candidates without selection. |
| `--no-progress` | Hide the progress bar while keeping results and the summary. |
| `--async` | Dispatch a unique detection job per selected finding regardless of attributes. |
| `--sync` | Run all selected findings synchronously, ignoring `Async`; cannot be combined with `--async`. |
| `--queue=...` | Override the detection queue; requires `--async` and a non-empty value. |
| `--connection=...` | Override the connection; requires `--async` and a non-empty value. |

## Select and exclude findings

```bash
php artisan health:detect PaidOrderMarkedPending MissingRequiredDocument
php artisan health:detect 'App\DataHealth\PaidOrderMarkedPending' -n
php artisan health:detect --except=ExpensiveFinding --except=ExternalAuditFinding -n
```

An explicit `Key` attribute supplies the registered key; otherwise the class basename is used. See [Finding Discovery](/data-health-docs/core-concepts/finding-discovery/) for how classes and keys enter the registry. Keys and classes can be mixed. Duplicate selections run once, and exclusions take precedence.

All selectors, including exclusions, must identify registered detectable findings. They are validated before detection or dispatch begins. Unknown selectors and findings without `CanDetect` fail the command before any work starts.

## Interactive selection

```bash
php artisan health:detect
```

When both standard input and output are terminals, this opens the selector automatically. Use arrows to move, Space to toggle findings, and Enter to run the selection. Nothing is selected initially. Submitting an empty selection succeeds without running detection.

Explicit selectors restrict the candidates and exclusions are applied before selection. Interactive selection also supports `--async` and queue overrides.

For immediate execution without the selector, use `-n`. Piped or redirected runs also execute without prompting. An explicit `--interactive` cannot be combined with `-n`.

## Progress and output

The bar shows the current finding and advances once per selected finding class, including failures and skipped jobs. It does not measure rows scanned or finding records created inside the detector. Use `--no-progress` for log-oriented runs.

```text
Completed: PaidOrderMarkedPending
Detection summary: 1 completed, 0 skipped, 0 failed.
```

Each finding is reported individually. A failure does not prevent the remaining findings from running. The final summary counts completed or queued, skipped, and failed finding classes.

A detector may return an integer, `null`, a callable, or a class implementing `Detector`. Detection invokes returned callables and resolves detector classes through Laravel's container. Core detection discards optional integer results, including results from callbacks and handlers. Progress counts finding classes, rather than reported occurrences. Filament manual detection can display an integer result.

## Queue a run

```bash
php artisan health:detect --async -n
php artisan health:detect PaidOrderMarkedPending --async --queue=data-health --connection=redis -n
```

`--async` queues selected findings whether or not they have `Async` or `Scheduled` attributes. Without execution flags, `Async` on `detect()` queues the manual run. Use `--sync` to force synchronous execution. Combining `--sync` and `--async` is an error.

Queue and connection values come from `Async` on `detect()` or application defaults. Class-level usage and placement on other methods are rejected during discovery. Command-line overrides take precedence independently. Configure a non-`sync` connection and a running worker for background execution; see [Scheduling and Queues](/data-health-docs/guides/scheduling-and-queues/#queue-a-manual-run).

Jobs already queued or running for the same finding class are skipped using Laravel's unique-job lock. A dispatch failure releases that job's lock so another run can retry.

Async progress measures dispatch, and command success confirms dispatch or an existing queued/running job. Worker execution and failures happen separately.

## Exit status

- `0`: no detection or dispatch failed, including an empty selection or skipped jobs.
- `1`: invalid input, detection failure, or dispatch failure.

An empty selection reports `No detectable findings selected.`. See [Automation and Exit Codes](/data-health-docs/cli/automation/) for scripting and partial failures, or [Troubleshooting](/data-health-docs/reference/troubleshooting/#the-detection-command-runs-no-findings-or-fails) when a run fails or selects no findings. Inspect the complete help with `php artisan help health:detect`.
