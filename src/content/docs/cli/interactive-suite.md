---
title: Main Menu
description: Open the Data Health console suite and move between detection and record management.
---

Use `health` to move between detection and record management from one terminal menu.

## Contents

- [Usage](#usage)
- [Menu choices](#menu-choices)
- [Interaction and fallbacks](#interaction-and-fallbacks)
- [Exit status](#exit-status)

## Usage

```bash
php artisan health
```

The menu is the starting point for working through findings in a terminal. It uses Termwind for terminal styling and Laravel Prompts for selection.

## Menu choices

| Choice | What opens |
| --- | --- |
| **Detect findings** | The [detection selector](/data-health-docs/cli/detect/#interactive-selection). |
| **Browse, verify, and resolve records** | The [interactive record browser](/data-health-docs/cli/records/), including ignore and mark-as-solved actions. |
| **Exit** | Closes the suite. |

The suite returns to this menu after a child operation finishes. For example, detect a finding type, return to the menu, then open its records to inspect or act on the occurrences.

The generator is a separate entrypoint: use [`health:make:finding`](/data-health-docs/guides/generating-finding-classes/) to create a finding class.

## Interaction and fallbacks

The menu explicitly requests interactive mode for its child commands. On supported terminals the record browser uses a table with keyboard actions. Where raw input is unavailable, including Laravel's Windows fallback, it uses menus and separate selection prompts.

`health --no-interaction` fails with a message directing you to `health:detect` or `health:records`. Use those direct commands with `-n` for [automated runs](/data-health-docs/cli/automation/).

## Exit status

The suite exits `0` when its operations succeed. A child-command failure is remembered: later successful operations do not clear it, and choosing **Exit** then returns `1`.
