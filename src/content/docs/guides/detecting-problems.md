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
    public static function detect(): int
    {
        // Search for problems and report each one.

        return 0;
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

Process the result in a memory-safe way and keep count of the occurrences reported:

```php
public static function detect(): int
{
    $detected = 0;

    Order::query()
        ->whereNotNull('paid_at')
        ->where('status', 'pending')
        ->eachById(function (Order $order) use (&$detected): void {
            self::found($order);

            $detected++;
        });

    return $detected;
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

Returning an integer count is the clearest default:

```php
public static function detect(): int
{
    $detected = 0;

    // Report findings and increment $detected.

    return $detected;
}
```

The count can be displayed by an interface, written to a command's output, asserted in a test, or recorded as operational telemetry. Return `null` when the caller does not need a result.

A callable allows a supporting caller to invoke deferred detection through Laravel's container. It should return an integer or `null`:

```php
public static function detect(): callable
{
    return function (OrderReconciler $reconciler): ?int {
        $reconciler->detectProblems();

        return null;
    };
}
```

The `health:detect` command, queued `DetectFinding` jobs, and Data Health Filament manual detection invoke callable results through Laravel's container. Direct callers must invoke the returned callable themselves. Synchronous scheduled detection calls `detect()` itself without invoking a returned callable; scheduled detections using `Async` execute it in the queued job. Prefer immediate detection with an integer result when the finding must also support synchronous scheduling.

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

Run every discovered finding implementing `CanDetect` from Artisan:

```bash
php artisan health:detect
```

The command runs detection synchronously by default. It includes findings without `Scheduled` and ignores cron timing and `data-health.scheduler.enabled`. An `Async` attribute does not queue a synchronous command run.

### Command parameters

| Parameter | Behavior |
| --- | --- |
| `findings...` | Optional finding keys or fully qualified class names. Omit to run all detectable findings. |
| `--except=...` | Exclude a finding by key or fully qualified class name. Repeat for multiple exclusions. |
| `--async` | Dispatch one unique detection job per selected finding. |
| `--queue=...` | Override the detection queue; requires `--async` and a non-empty value. |
| `--connection=...` | Override the queue connection; requires `--async` and a non-empty value. |

Select one or more findings by their registered keys or class names:

```bash
php artisan health:detect PaidOrderMarkedPending MissingRequiredDocument
php artisan health:detect 'App\DataHealth\PaidOrderMarkedPending'
```

An explicit `Key` attribute supplies the registered key; otherwise the class basename is used. Exclusions take precedence over explicit selections, and duplicate selections run once:

```bash
php artisan health:detect --except=ExpensiveFinding --except=RemoteServiceFinding
```

All selectors, including exclusions, must resolve to discovered findings implementing `CanDetect`. The command validates every selector before any detection or dispatch begins. Unknown or non-detectable findings cause a nonzero exit code without running the selection.

### Queue a manual run

```bash
php artisan health:detect --async
php artisan health:detect PaidOrderMarkedPending --async --queue=data-health --connection=redis
```

With `--async`, every selected finding is queued, including findings without `Async` or `Scheduled`. Queue routing uses each finding's `Async` attribute when present, then the application's defaults. The `--queue` and `--connection` options override those values independently.

Use a non-`sync` connection and a worker consuming the selected queue for background execution. Queued or running detections for the same finding class are skipped using Laravel's unique-job lock. See [Scheduling and Queues](/data-health-docs/guides/scheduling-and-queues/#queue-a-manual-run) for worker and cache setup.

### Output and exit status

The command reports each completed, queued, skipped, or failed detection and prints a summary:

```text
Completed: PaidOrderMarkedPending
Detection summary: 1 completed, 0 skipped, 0 failed.
```

The summary counts finding classes processed, rather than the number of records reported by their `detect()` methods. Individual detection or dispatch failures are reported while the remaining findings continue. Any failure produces a nonzero exit code; an empty selection succeeds with `No detectable findings selected.`

For async runs, success confirms dispatch or that a job was already queued or running. It does not confirm that the worker completed detection. A failed dispatch releases its uniqueness lock so a later command can retry.

Both command execution and queued jobs invoke callable detection results through Laravel's container. View the complete command help with `php artisan help health:detect`.

### Call detection from PHP

Call a detectable finding directly from application code, a job, or Tinker:

```php
use App\DataHealth\PaidOrderMarkedPending;

$detected = PaidOrderMarkedPending::detect();
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

    expect(PaidOrderMarkedPending::detect())->toBe(1);

    $record = FindingRecord::query()->sole();

    expect($record->status)->toBe(RecordStatus::Active)
        ->and($record->model->is($unhealthy))->toBeTrue();
});
```

Run detection twice in another test and assert that only one record exists for the same identity. When context is involved, test that equivalent context reuses a record and genuinely different context creates another one.

Continue with [Context](/data-health-docs/guides/context/) when a model can have multiple occurrences of the same problem, or [Large Datasets](/data-health-docs/guides/large-datasets/) when one run should process only a controlled batch.
