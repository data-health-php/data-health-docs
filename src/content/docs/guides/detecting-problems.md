---
title: Detecting Problems
description: Find inconsistent models and report durable finding records without creating duplicates.
---

Detection is the application-specific process that searches for unhealthy data and reports each occurrence to Data Health with `found()`.

## Contents

- [When to implement detection](#when-to-implement-detection)
- [The CanDetect contract](#the-candetect-contract)
- [Write a focused detection query](#write-a-focused-detection-query)
- [Report problems with found](#report-problems-with-found)
- [Pass context to a finding](#pass-context-to-a-finding)
- [Return a useful result](#return-a-useful-result)
- [Design detection to be repeatable](#design-detection-to-be-repeatable)
- [What repeat detection does](#what-repeat-detection-does)
- [Detection does not resolve missing results](#detection-does-not-resolve-missing-results)
- [Run detection manually](#run-detection-manually)
- [Test detection behavior](#test-detection-behavior)

## When to implement detection

Implement detection when Data Health can search for every current occurrence of a problem. Typical detection sources include:

- an Eloquent query that selects invalid model states;
- calculated values that disagree with stored values;
- missing or conflicting relationships;
- results returned by another service; and
- rules that require inspecting several fields or records together.

Detection is optional. If application code already knows exactly when a problem occurs, it can report the finding directly:

```php
PaidOrderMarkedPending::found($order);
```

For example, an import pipeline may report malformed source data at the point it is encountered, while a periodic reconciliation check is better represented by `detect()`.

Use detection when the rule can be rerun safely and should find the same current problems each time.

## The CanDetect contract

A detectable finding implements `DataHealth\Contracts\CanDetect` and defines a static `detect()` method:

```php
use DataHealth\Contracts\CanDetect;
use DataHealth\Finding;

class PaidOrderMarkedPending extends Finding implements CanDetect
{
    public static function detect(): null
    {
        // Search for problems and report each one.

        return null;
    }
}
```

The method is static because detection searches for occurrences before a particular affected model or finding object exists.

Implementing `CanDetect` also makes the finding eligible for `health:detect`, scheduled detection, manual execution from Data Health Filament, and other integrations that operate on detectable finding classes.

## Write a focused detection query

Filter unhealthy records in the database whenever the rule can be expressed as a query. This avoids loading healthy models only to discard them in PHP.

The finding from the [Quick Start](/data-health-docs/start-here/quick-start/) detects paid orders that are still pending:

```php
use App\Models\Order;

Order::query()
    ->whereNotNull('paid_at')
    ->where('status', 'pending');
```

Process the result in a memory-safe way and report each occurrence:

```php
public static function detect(): null
{
    Order::query()
        ->whereNotNull('paid_at')
        ->where('status', 'pending')
        ->eachById(function (Order $order): void {
            self::found($order);
        });

    return null;
}
```

`eachById()` avoids loading the entire result set into memory. For checks that should intentionally inspect only a limited portion of a table per run, use the persistent cursor described in [Large Datasets](/data-health-docs/guides/large-datasets/).

:::tip
Eager-load relationships used by the detection rule to avoid an N+1 query for every candidate model.
:::

## Report problems with found

Call the finding class's inherited `found()` method for every occurrence:

```php
$record = PaidOrderMarkedPending::found($order);
```

`found()` constructs the finding and asks Data Health to create or refresh the corresponding `FindingRecord`. It returns that record if detection code needs to inspect or act on it.

Every reported finding must belong to a persisted model with a stable primary key. Save newly created models before passing them to `found()`.

## Pass context to a finding

Pass context as the second argument when the same finding can occur more than once for one model. A customer missing two required document types, for example, can have one record for each type:

```php
MissingRequiredDocument::found($customer, [
    'document_type' => 'tax-certificate',
]);
```

The context becomes part of finding identity, so each document type produces a separate record. See [Context](/data-health-docs/guides/context/) for choosing stable values and using context during verification and resolution.

## Return a useful result

The `CanDetect` contract permits `int`, `callable`, or `null` results.

Return `null` by default to keep detection focused on reporting findings:

```php
public static function detect(): null
{
    // Search for problems and report each one with self::found().

    return null;
}
```

An integer count is optional. Return the number of findings reported when a caller needs it, such as for interface feedback or operational telemetry. Counting is not required to create finding records.

A callable allows a supporting caller to invoke deferred detection through Laravel's container. It should return an integer or `null`:

```php
public static function detect(): callable
{
    return function (OrderReconciler $reconciler): null {
        $reconciler->detectProblems();

        return null;
    };
}
```

The `health:detect` command, queued `DetectFinding` jobs, and Data Health Filament manual detection invoke callable results through Laravel's container. Direct callers must invoke the returned callable themselves. Synchronous scheduled detection also evaluates callable and detector-class results through `DetectFinding`. Add `Async` only to `detect()` to queue package-managed detection; direct calls remain synchronous. An integer count is optional.

## Design detection to be repeatable

Production detection should be safe to run more than once. A repeatable detector:

- reports the same identity for the same occurrence;
- does not modify healthy application data;
- does not rely on process-local state from a previous run;
- can resume after a partial failure without creating duplicates; and
- limits memory use and external requests appropriately.

Data Health provides idempotent record creation through its identity constraint, but the detection query and any surrounding application behavior remain your responsibility.

Avoid wrapping a large scan in one database transaction. If detection fails halfway through, findings already reported remain valid and the next run can safely refresh them.

## What repeat detection does

Finding identity combines the finding key, affected model type, model ID, and context hash. Reporting that same identity again updates the existing record rather than inserting another one.

The existing status determines what happens:

| Current status | Result of detecting it again |
| --- | --- |
| `active` | Remains active and refreshes `last_detected_at`. |
| `ignored` | Remains ignored and refreshes `last_detected_at`. |
| `resolved` | Becomes active and refreshes `last_detected_at`. |

This means a resolved problem can recur without losing its original record identity, while an intentionally ignored occurrence stays ignored even when detection continues to observe it.

## Detection does not resolve missing results

A detector reports the problems it sees; it does not automatically resolve active records that were absent from the latest scan.

Absence can be ambiguous: the model may have been filtered out, an external service may have been unavailable, or a batched scan may not have reached that model yet. Automatically resolving every unseen record would therefore produce false resolutions.

Use `CanVerify` when an existing finding can determine that its underlying problem no longer applies. See [Verifying Findings](/data-health-docs/guides/verifying-findings/) for verification workflows.

## Run detection manually

```bash
php artisan health:detect PaidOrderMarkedPending -n
```

Without `-n`, a terminal session opens finding selection automatically. Piped or redirected runs execute without prompting. The [Detection command reference](/data-health-docs/cli/detect/) covers every argument, option, queue override, and progress behavior.

### Command parameters

Use finding keys or class names to select candidates and `--except` to exclude them. See [Detection arguments and options](/data-health-docs/cli/detect/#arguments-and-options) for the complete reference.

### Queue a manual run

Add `--async` to dispatch detection jobs and optionally override their queue and connection. See [Queue a run](/data-health-docs/cli/detect/#queue-a-run) for command options and [Scheduling and Queues](/data-health-docs/guides/scheduling-and-queues/) for worker setup.

### Output and exit status

The command reports each finding and a final summary. See [Progress and output](/data-health-docs/cli/detect/#progress-and-output) for what those counts measure and [Exit status](/data-health-docs/cli/detect/#exit-status) for success and failure behavior.

### Call detection from PHP

Call a detectable finding directly from application code, a job, or Tinker:

```php
use App\DataHealth\PaidOrderMarkedPending;

PaidOrderMarkedPending::detect();
```

For periodic execution, add the `Scheduled` attribute as described in [Scheduling and Queues](/data-health-docs/guides/scheduling-and-queues/). Data Health Filament can also expose detectable findings as manual actions; see [Finding Types and Detection](/data-health-docs/filament/finding-types-and-detection/).

## Test detection behavior

A focused test should prove both that unhealthy models are reported and that healthy models are ignored:

```php
use App\DataHealth\PaidOrderMarkedPending;
use App\Models\Order;
use DataHealth\Enums\RecordStatus;
use DataHealth\Models\FindingRecord;

it('detects paid orders that are still pending', function () {
    $unhealthy = Order::factory()->create([
        'paid_at' => now(),
        'status' => 'pending',
    ]);

    Order::factory()->create([
        'paid_at' => now(),
        'status' => 'paid',
    ]);

    PaidOrderMarkedPending::detect();

    $record = FindingRecord::query()->sole();

    expect($record->status)->toBe(RecordStatus::Active)
        ->and($record->model->is($unhealthy))->toBeTrue();
});
```

Run detection twice in another test and assert that only one record exists for the same identity. When context is involved, test that equivalent context reuses a record and genuinely different context creates another one.

Continue with [Context](/data-health-docs/guides/context/) when a model can have multiple occurrences of the same problem, or [Large Datasets](/data-health-docs/guides/large-datasets/) when one run should process only a controlled batch.
