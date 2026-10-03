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

Implementing `CanDetect` also makes the finding eligible for scheduled detection, manual execution from Data Health Filament, and other integrations that operate on detectable finding classes.

## Write a focused detection query

Filter unhealthy records in the database whenever the rule can be expressed as a query. This avoids loading healthy models only to discard them in PHP.

The finding from the [Quick Start](/start-here/quick-start/) detects paid orders that are still pending:

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

`eachById()` avoids loading the entire result set into memory. For checks that should intentionally inspect only a limited portion of a table per run, use the persistent cursor described in [Large Datasets](/guides/large-datasets/).

:::tip
Eager-load relationships used by the detection rule to avoid an N+1 query for every candidate model.
:::

## Report problems with found

Call the finding class's inherited `found()` method for every occurrence:

```php
$record = PaidOrderMarkedPending::found($order);
```

`found()` constructs the finding, builds its persisted context, and asks Data Health to create or refresh the corresponding `FindingRecord`. It returns that record if detection code needs to inspect or act on it.

The first constructor argument is normally the affected Eloquent model. Additional arguments are passed to the finding constructor, which accepts context as its second argument by default:

```php
SomeFinding::found($model, [
    'reason' => 'unexpected-state',
]);
```

Every reported finding must belong to a persisted model with a stable primary key. Save newly created models before passing them to `found()`.

## Pass context to a finding

Context distinguishes multiple occurrences of the same finding for the same model. A customer missing two required document types, for example, can have one record for each type:

```php
MissingRequiredDocument::found($customer, [
    'document_type' => 'tax-certificate',
]);
```

Passing constructor context alone does not persist it. The finding must return the values from `buildContext()`:

```php
/** @return array<string, mixed> */
public function buildContext(): array
{
    return $this->context;
}
```

Use stable context that identifies the occurrence rather than values that change on every scan. See [Context](/guides/context/) for hashing, identity, and design guidance.

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

A callable allows a supporting caller to invoke deferred detection through Laravel's container:

```php
public static function detect(): callable
{
    return function (OrderReconciler $reconciler): bool {
        $reconciler->detectProblems();

        return true;
    };
}
```

Data Health Filament invokes callable results for manual detection. Direct callers must invoke the returned callable themselves, and scheduled detection executes the `detect()` method itself rather than treating its return value as additional work. Prefer immediate detection with an integer result unless a specific caller requires a callable.

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

Use `CanVerify` when an existing finding can determine that its underlying problem no longer applies. See [Verifying Findings](/guides/verifying-findings/) for verification workflows.

## Run detection manually

Call a detectable finding directly from application code, a command, a job, or Tinker:

```php
use App\DataHealth\PaidOrderMarkedPending;

$detected = PaidOrderMarkedPending::detect();
```

For periodic execution, add the `Scheduled` attribute as described in [Scheduling and Queues](/guides/scheduling-and-queues/). Data Health Filament can also expose detectable findings as manual actions; see [Finding Types and Detection](/filament/finding-types-and-detection/).

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

Continue with [Context](/guides/context/) when a model can have multiple occurrences of the same problem, or [Large Datasets](/guides/large-datasets/) when one run should process only a controlled batch.
