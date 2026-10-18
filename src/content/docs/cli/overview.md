---
title: CLI Overview
description: Choose the right Artisan entrypoint for generating, detecting, reviewing, and acting on Data Health findings.
---

Data Health exposes six Artisan commands. Start with `php artisan health` for the menu, or use a direct command for the task at hand.

## Contents

- [Commands](#commands)
- [Interactive defaults](#interactive-defaults)
- [Record actions](#record-actions)
- [Built-in help](#built-in-help)

## Commands

All commands below run through `php artisan`.

| Entrypoint | Purpose | Reference |
| --- | --- | --- |
| `health` | Open the menu for detection and record management. | [Main Menu](/data-health-docs/cli/interactive-suite/) |
| `health:detect [findings...]` | Detect problems for all or selected finding classes. | [Detection](/data-health-docs/cli/detect/) |
| `health:records` | Browse records, inspect details, and run batch actions. | [Record Browser](/data-health-docs/cli/records/) |
| `verify ID` | Verify one finding record; alias: `health:verify ID`. | [Verification](/data-health-docs/cli/verify/) |
| `resolve ID` | Execute resolution for one finding record; alias: `health:resolve ID`. | [Resolution](/data-health-docs/cli/resolve/) |
| `health:make:finding NAME` | Generate a finding class and method placeholders. | [Finding Generator](/data-health-docs/guides/generating-finding-classes/) |

## Interactive defaults

`health:detect` and `health:records` are interactive by default when **both standard input and standard output are attached to a terminal**:

```bash
php artisan health:detect
php artisan health:records
```

Detection opens a finding selector. Records opens a keyboard-controlled table, or Laravel's menu fallback where raw keyboard input is unavailable. Use `--interactive` to request interaction explicitly.

Use `--no-interaction` (`-n`) to run without prompting. Piped or redirected runs are non-interactive automatically:

```bash
php artisan health:detect -n --no-progress
php artisan health:records --status=all -n
```

`--interactive` and `--no-interaction` cannot be combined. The `health` menu requires interaction and rejects `-n`. Direct verification, resolution, and generation do not open the record browser or finding selector.

## Record actions

Record IDs identify rows in `data_health_findings`, rather than related application models. See [Findings and Records](/data-health-docs/core-concepts/findings-and-records/) for identity and lifecycle rules. Finding keys and class names identify finding types and are used by detection and the record filter.

| Action | Behavior |
| --- | --- |
| Verify (`v`) | Runs verification; a final `true` marks the record resolved. |
| Resolve (`r`) | Runs the resolver; a final `true` marks the record resolved. |
| Ignore (`i`) | Changes an active record to `ignored`. |
| Mark as solved (`s`) | Changes an active or ignored record to `resolved` directly. |

Ignore and mark as solved are actions in the record browser. They update record status without calling verification or resolution logic or changing the affected model. Use `r` when the resolver should perform a correction. For a web interface to the same records, see [Filament Integration](/data-health-docs/filament/overview/).

See the [Record Browser](/data-health-docs/cli/records/#keyboard-controls) for every key and [Automation and Exit Codes](/data-health-docs/cli/automation/) for scripting behavior.

## Built-in help

```bash
php artisan help health:detect
php artisan help health:records
php artisan help health:make:finding
```
