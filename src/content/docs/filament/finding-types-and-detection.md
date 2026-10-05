---
title: Finding Types and Detection
description: Inspect discovered finding classes and run supported detection from Filament.
---

The Finding types page is a live catalogue of the finding classes discovered by the core package, including their capabilities and manual detection actions.

## Contents

- [The finding type catalogue](#the-finding-type-catalogue)
- [Information shown](#information-shown)
- [Search finding types](#search-finding-types)
- [Detectable findings](#detectable-findings)
- [Run detection manually](#run-detection-manually)
- [Detection results](#detection-results)
- [Callable detection](#callable-detection)
- [Failures and long-running checks](#failures-and-long-running-checks)
- [Scheduled and manual detection](#scheduled-and-manual-detection)
- [Use the standalone table](#use-the-standalone-table)

## The finding type catalogue

Registering `DataHealthPlugin` adds the **Finding types** page after the Finding records resource in the configured navigation group.

Unlike the records resource, this page does not query persisted occurrences. It reads the finding classes currently discovered by Data Health and describes their deployed capabilities.

Use it to confirm discovery, review available actions, check which findings are scheduled, or run a detector before any records exist. The table is not paginated because it represents registered types rather than database records.

## Information shown

Each row represents one finding class and includes its stable key, description, worklist, urgency, verification and resolution capabilities, and scheduled status.

Missing descriptions and worklists use neutral placeholders, while findings without an urgency attribute display the normal default.

The catalogue also knows whether a finding supports detection, asynchronous scheduling, and automatic resolution, although the table emphasizes the capabilities most useful to operators.

## Search finding types

Search matches the finding key, fully qualified class name, and description without case sensitivity.

Search by technical key when debugging discovery, or use description terms when operators know the business problem but not its class name.

Worklist and urgency are displayed but are not separate catalogue filters. Use Finding records to filter persisted occurrences by those fields.

## Detectable findings

The detect action appears only when a class implements `CanDetect`:

```php
use DataHealth\Contracts\CanDetect;
use DataHealth\Finding;

class PaidOrderMarkedPending extends Finding implements CanDetect
{
    public static function detect(): int
    {
        // ...
    }
}
```

A finding may still appear without detection support. It can be reported directly by application code and may support verification or resolution.

## Run detection manually

Select the row's detect action and confirm the dialog. If `detect()` has a method-level `Description`, the dialog displays it so the operator knows what the scan will do.

Detection executes synchronously in the Livewire request and calls the same method used by application code. It does not change the finding's schedule or create a separate manual configuration.

## Detection results

After successful completion, Filament displays a **Detection complete** notification. An integer result adds a correctly pluralized count such as `1 finding detected` or `12 findings detected`.

Return the number of findings reported, rather than the number of models scanned, when operators should interpret the value as a finding count. Boolean and `null` results complete without a count.

## Callable detection

Manual detection supports the callable return type allowed by `CanDetect`. Filament invokes the callable through Laravel's container:

```php
public static function detect(): callable
{
    return function (OrderReconciler $reconciler): bool {
        $reconciler->detect();

        return true;
    };
}
```

Callable parameters may use container-resolved dependencies. The resulting boolean completes without a numeric count.

Scheduled Data Health detection does not invoke a returned callable, so use this form only when manual or custom callers are intended.

## Failures and long-running checks

If detection throws, the success notification is not sent and the exception follows the application's Filament and Laravel error handling. Findings reported before the exception remain persisted.

Avoid unbounded scans that can exceed web request timeouts. Prefer database chunking, persistent cursor batches, scheduled asynchronous detection, or a custom action that dispatches application-owned work.

See [Large Datasets](/data-health-docs/guides/large-datasets/) and [Scheduling and Queues](/data-health-docs/guides/scheduling-and-queues/).

## Scheduled and manual detection

Both paths call the same method and produce the same finding identities. Running both does not create duplicates when key, model, and context remain stable.

The Scheduled indicator reflects the `Scheduled` attribute. It does not prove that system cron is running, cache locks work, or a queue worker is consuming asynchronous jobs.

## Use the standalone table

Render the same catalogue outside a panel:

```blade
<livewire:data-health-filament::finding-types-table />
```

The standalone table includes the same search, capability columns, confirmation dialog, and detection action. Protect the containing route because the component adds no authorization.

Continue with [Standalone Components](/data-health-docs/filament/standalone-components/) for setup, or [Managing Findings](/data-health-docs/filament/managing-findings/) to work with detected records.
