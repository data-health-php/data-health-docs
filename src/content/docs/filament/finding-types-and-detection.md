---
title: Finding Types and Detection
description: Inspect discovered finding classes and run supported detection from Filament.
---

The **Finding types** page lists classes discovered by the core package, even before they produce records. Each row shows the finding key, description, worklist, urgency, verification and resolution capabilities, and scheduled status.

Search matches keys, fully qualified class names, and descriptions without case sensitivity. Worklist and urgency have no separate catalogue filters.

## Run detection manually

Classes implementing `CanDetect` have a **Detect** action. Confirm the dialog to run the detector; a method-level `Description` supplies the dialog text when available. Findings without `CanDetect` still appear in the catalogue and can be reported by application code.

Detection runs synchronously in the Livewire request. It does not honor `Async` routing or change the finding's schedule. The Scheduled indicator reflects the `Scheduled` attribute, not whether cron or queue workers are running.

A successful run shows **Detection complete**. Return `null` for no count, or an integer to report the number of findings detected, such as `12 findings detected`.

## Callable detection

Returned callables are invoked through Laravel's container, allowing dependency injection:

```php
public static function detect(): callable
{
    return function (OrderReconciler $reconciler): null {
        $reconciler->detect();

        return null;
    };
}
```

Filament manual detection currently does not support returned `Detector` class strings, which core detection supports.

## Failures and long-running checks

Exceptions follow application error handling and prevent the success notification. Findings reported before an exception remain persisted.

Keep manual scans within web request limits. For longer work, use [scheduled asynchronous detection](/data-health-docs/guides/scheduling-and-queues/) or an application-owned action that dispatches a job. See [Large Datasets](/data-health-docs/guides/large-datasets/) for batching patterns.

Manual and scheduled detection use the same finding identities, so stable keys, models, and context prevent duplicate records.

To embed this catalogue outside a panel, use the [standalone finding-types table](/data-health-docs/filament/standalone-components/#available-components).
