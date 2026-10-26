---
title: Resolution Command
description: Run resolution for one persisted finding record by ID.
---

Run the finding's correction logic for one recorded occurrence.

## Contents

- [Usage](#usage)
- [Requirements and result evaluation](#requirements-and-result-evaluation)
- [Output and exit codes](#output-and-exit-codes)
- [Select records in the browser](#select-records-in-the-browser)

## Usage

```bash
php artisan health:resolve 1
```

The required `id` is the `FindingRecord` ID in `data_health_findings`, rather than the related model ID or a finding key. The command runs synchronously and does not open a selector.

## Requirements and result evaluation

The stored key must resolve to a registered finding, its affected model must be loadable, and the finding must implement `DataHealth\Contracts\CanResolve`.

The manager reconstructs the finding with the stored model and context, calls `resolve()`, and evaluates the return value:

| Return value | Evaluation |
| --- | --- |
| Boolean | Used directly. |
| Callable | Invoked through Laravel's container and must return a boolean. |
| Handler class name | Resolved through the container; must implement `DataHealth\Contracts\Resolver` and return a boolean. |

Resolution should return `true` only when the correction succeeded or its desired postcondition already holds. A final `true` marks the record `resolved`. A final `false` leaves its status unchanged.

The ID command is not restricted to active records. It evaluates the finding for the supplied record's current model and context.

To update only the record status, use `s` in the [record browser](/data-health-docs/cli/records/#ignore-and-mark-as-solved). The `health:resolve` command always executes resolution logic.

## Output and exit codes

| Outcome | Output for ID 1 | Status update | Exit code |
| --- | --- | --- | --- |
| `true` | `Finding record 1 resolved.` | Becomes `resolved`. | `0` |
| `false` | `Finding record 1 could not be resolved.` | No update by the manager. | `1` |
| Missing record | `Finding record 1 was not found.` | No update. | `1` |
| Unsupported action or exception | The exception message. | No success status update. | `1` |

The package does not wrap application-side changes and the record-status update in a transaction. If an action throws after changing application data, the command reports the error and does not undo those changes.

## Select records in the browser

```bash
php artisan health:records
```

In a terminal, check records with Space and press `r`. With nothing checked, that key acts on the highlighted row. The browser continues after failures and refreshes the list after each batch. Fallback environments provide a **Resolve records** menu.

See [Record Browser](/data-health-docs/cli/records/) for selection and [the resolution guide](/data-health-docs/guides/resolving-findings/) for implementing the action.
