---
title: Console Suite
description: Find the dedicated CLI command reference and keyboard workflows.
---

The console documentation now has its own **CLI** sidebar group. Start with the [CLI Overview](/data-health-docs/cli/overview/) for all entrypoints, aliases, and interactive defaults.

## Contents

- [Open the suite](#open-the-suite)
- [Choose findings and watch detection progress](#choose-findings-and-watch-detection-progress)
- [List and filter records](#list-and-filter-records)
- [Inspect, verify, and resolve records](#inspect-verify-and-resolve-records)
- [Use direct commands in scripts](#use-direct-commands-in-scripts)

## Open the suite

Run `php artisan health` to open the menu. See [Main Menu](/data-health-docs/cli/interactive-suite/) for the available choices and return behavior.

## Choose findings and watch detection progress

Run `php artisan health:detect` in a terminal to select finding types. See [Detection](/data-health-docs/cli/detect/) for selectors, exclusions, progress, queues, and exit codes.

## List and filter records

Run `php artisan health:records` to browse records. See [Record Browser filters](/data-health-docs/cli/records/#filters-and-pagination) for statuses, finding selectors, page size, and non-interactive output.

## Inspect, verify, and resolve records

The [Record Browser](/data-health-docs/cli/records/#keyboard-controls) documents every key, including `v` for verification, `r` for resolution, `i` for ignore, and `s` for manually marking a record solved. Enter inspects a row without changing it.

## Use direct commands in scripts

Use `-n` for non-interactive runs. See [Automation and Exit Codes](/data-health-docs/cli/automation/) for examples, dispatch semantics, and partial failures.
