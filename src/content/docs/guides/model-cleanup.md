---
title: Model Cleanup
description: Remove finding records when their affected Eloquent models are deleted.
---

Data Health offers global and model-specific cleanup strategies for polymorphic finding records that would otherwise outlive their affected models.

## Contents

- [Why cleanup is necessary](#why-cleanup-is-necessary)
- [Choose a cleanup strategy](#choose-a-cleanup-strategy)
- [Enable global cleanup](#enable-global-cleanup)
- [Use model-specific cleanup](#use-model-specific-cleanup)
- [Access a model's findings](#access-a-models-findings)
- [Soft deletes](#soft-deletes)
- [Restore deleted models](#restore-deleted-models)
- [Mass deletion and database deletion](#mass-deletion-and-database-deletion)
- [Performance and transactions](#performance-and-transactions)
- [Test cleanup](#test-cleanup)

## Why cleanup is necessary

Finding records refer to affected models through a polymorphic type and ID. Polymorphic relationships do not provide a conventional foreign key that can cascade automatically when any supported model table is deleted.

Without application-level cleanup, deleting an affected model can leave a finding record whose `model_type` and `model_id` no longer resolve to a model. Verification, resolution, and links to the affected record can then fail or become meaningless.

Data Health can listen for Eloquent's `deleted` event and remove every finding record matching the deleted model's morph class and primary key.

Cleanup deletes the finding records themselves, including active, ignored, and resolved records for that model.

## Choose a cleanup strategy

Data Health provides two strategies:

| Strategy | Scope | Default |
| --- | --- | --- |
| Global cleanup | Listens for deletion of every Eloquent model in the application. | Disabled |
| `HasFindingRecords` concern | Listens only on model classes using the concern. | Opt-in per model |

Use global cleanup when findings may belong to many model types and consistent cleanup is more important than avoiding a deletion query for unrelated models.

Use the concern when only a known set of model types can have findings or when you want cleanup and a `findingRecords` relationship explicitly declared on those models.

Both strategies remove the same matching records. When global cleanup is enabled, the concern detects that configuration and does not perform a second delete query.

## Enable global cleanup

Set the environment option before the application boots:

```dotenv
DATA_HEALTH_AUTO_DELETE_ENABLED=true
```

The corresponding configuration is:

```php
'auto_delete' => [
    'enabled' => true,
],
```

Data Health then registers one wildcard Eloquent listener. Whenever an Eloquent model dispatches `deleted`, the listener removes records matching:

```text
model_type = deleted model's morph class
model_id   = deleted model's primary key
```

The listener ignores deletion events for `FindingRecord` itself, preventing finding cleanup from recursively trying to clean up finding records as affected models.

When Laravel configuration is cached, rebuild the cache after changing the environment value. The listener is registered during service-provider boot, so changing configuration later in the same process does not retroactively register it.

## Use model-specific cleanup

Add `HasFindingRecords` to each model whose findings should be removed on deletion:

```php
<?php

declare(strict_types=1);

namespace App\Models;

use DataHealth\Concerns\HasFindingRecords;
use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    use HasFindingRecords;
}
```

The concern registers a `deleted` model callback and removes records for that order. It works without enabling global cleanup:

```dotenv
DATA_HEALTH_AUTO_DELETE_ENABLED=false
```

This is the most explicit strategy: reading the model shows that it participates in Data Health, and unrelated model deletions do not execute cleanup queries.

## Access a model's findings

The concern also adds a polymorphic `findingRecords` relationship:

```php
$order->findingRecords;
```

Query it like an ordinary Eloquent relationship:

```php
use DataHealth\Enums\RecordStatus;

$activeFindings = $order->findingRecords()
    ->where('status', RecordStatus::Active)
    ->orderByDesc('last_detected_at')
    ->get();
```

The relationship includes findings in every status unless the query filters them.

Global cleanup does not add this relationship to models. If an application wants both global cleanup and relationship access, it may still use the concern; the concern skips its own delete query while global cleanup is enabled.

## Soft deletes

Laravel models using `SoftDeletes` dispatch the `deleted` event when they are soft-deleted. Both Data Health cleanup strategies therefore remove their finding records at the time of the soft delete, even though the model row remains in its table.

This behavior treats a soft-deleted model as outside the active dataset. It also means finding history is not retained automatically for a model in the trash.

Force deletion also dispatches model deletion events and triggers the same cleanup behavior.

If your application must retain finding history for soft-deleted models, do not use these automatic cleanup strategies without adapting that retention requirement in application code.

## Restore deleted models

Restoring a soft-deleted model does not restore its deleted finding records. Data Health records are operational state rather than a restorable snapshot of every previous finding.

After restoration, run the relevant detection again:

```php
PaidOrderMarkedPending::detect();
```

Applicable problems are recreated as new finding records. Problems that no longer apply remain absent.

For expensive detectors, schedule or dispatch the appropriate targeted check from the application's restoration workflow instead of scanning the complete dataset immediately.

## Mass deletion and database deletion

Eloquent mass deletion does not instantiate each model and therefore does not dispatch its model events:

```php
Order::query()
    ->where('status', 'cancelled')
    ->delete();
```

Automatic Data Health cleanup does not run for these deleted rows. The same limitation applies to direct query-builder deletes, raw SQL, database maintenance, and external processes that bypass Eloquent events.

When cleanup is required, delete models individually:

```php
Order::query()
    ->where('status', 'cancelled')
    ->eachById(fn (Order $order) => $order->delete());
```

For intentionally large bulk operations, deleting models individually may be too expensive. In that case, remove matching finding records explicitly as part of the same maintenance operation, using the affected morph type and IDs before or alongside the model deletion.

:::caution
Do not assume database-level cascading will remove polymorphic finding records; there is no foreign key from `data_health_findings` to every possible affected table.
:::

## Performance and transactions

Global cleanup adds one matching delete query to every Eloquent model deletion, even for model types that have never had findings. This is why it is disabled by default.

The model-specific concern limits that cost to participating model classes. Choose it when deletion volume is high and the set of affected model types is well known.

Cleanup runs synchronously during the Eloquent deletion event. When model deletion occurs inside a database transaction on the same connection, the finding-record delete participates in that surrounding transaction; rolling back the transaction also rolls back the cleanup query.

For high-volume deletes:

- process models in bounded chunks;
- ensure the package's model type and ID lookup remains indexed;
- avoid loading unrelated relationships; and
- decide explicitly whether individual model events or a purpose-built bulk cleanup is the right tradeoff.

## Test cleanup

For concern-based cleanup, assert that deleting one model removes only its records:

```php
use App\DataHealth\PaidOrderMarkedPending;
use App\Models\Order;
use DataHealth\Models\FindingRecord;

it('deletes findings with their affected order', function () {
    $order = Order::factory()->create();
    $otherOrder = Order::factory()->create();

    $record = PaidOrderMarkedPending::found($order);
    $otherRecord = PaidOrderMarkedPending::found($otherOrder);

    $order->delete();

    expect(FindingRecord::find($record->id))->toBeNull()
        ->and(FindingRecord::find($otherRecord->id))->not->toBeNull();
});
```

Test global cleanup with a model that does not use `HasFindingRecords`, enable the configuration before booting the service provider in the test application, and assert the same deletion behavior.

For soft-deletable models, test both soft deletion and restoration so the application's expected re-detection workflow is explicit. Add a separate test for any bulk-delete path because model-event cleanup does not cover it.

The Guides section is now complete. Continue with [Filament Overview](/filament/overview/) to add an operational interface, or use [Configuration](/reference/configuration/) as a concise package reference.
