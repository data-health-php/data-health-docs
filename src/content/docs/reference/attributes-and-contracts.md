---
title: Attributes and Contracts
description: Reference the public extension points.
---

Use this reference when defining a finding or integrating Data Health with application code.

## Contents

- [Complete finding example](#complete-finding-example)
- [Finding base class](#finding-base-class)
- [Attributes](#attributes)
- [Detection contract](#detection-contract)
- [Verification contracts](#verification-contracts)
- [Resolution contracts](#resolution-contracts)
- [Facades and manager methods](#facades-and-manager-methods)
- [Finding record operations](#finding-record-operations)
- [Enums](#enums)

## Complete finding example

```php
namespace App\DataHealth;

use App\Models\Order;
use DataHealth\Attributes\Async;
use DataHealth\Attributes\AutoResolve;
use DataHealth\Attributes\Description;
use DataHealth\Attributes\Key;
use DataHealth\Attributes\Scheduled;
use DataHealth\Attributes\Urgency;
use DataHealth\Attributes\Worklist;
use DataHealth\Contracts\CanDetect;
use DataHealth\Contracts\CanResolve;
use DataHealth\Contracts\CanVerify;
use DataHealth\Enums\FindingUrgency;
use DataHealth\Finding;

#[Key('paid-order-marked-pending')]
#[Description('A paid order is still marked as pending.')]
#[Urgency(FindingUrgency::SOON)]
#[Worklist('billing-operations')]
#[Scheduled('*/15 * * * *')]
#[Async(queue: 'data-health', connection: 'redis')]
#[AutoResolve]
class PaidOrderMarkedPending extends Finding implements CanDetect, CanVerify, CanResolve
{
    public static function detect(): int
    {
        $count = 0;

        Order::query()
            ->whereNotNull('paid_at')
            ->where('status', 'pending')
            ->eachById(function (Order $order) use (&$count): void {
                self::found($order);
                $count++;
            });

        return $count;
    }

    #[Description('Check whether the order is no longer both paid and pending.')]
    public function verify(): bool
    {
        $order = $this->model->fresh();

        return $order === null
            || $order->paid_at === null
            || $order->status !== 'pending';
    }

    #[Description('Mark the order as paid.')]
    public function resolve(): bool
    {
        return $this->model->update(['status' => 'paid']);
    }
}
```

Use only the attributes and contracts the finding needs. In particular, `AutoResolve` causes resolution immediately after a new record is created, so it should be reserved for safe, idempotent fixes.

## Finding base class

Every finding extends `DataHealth\Finding`.

| Member | Signature | Meaning |
| --- | --- | --- |
| Constructor | `__construct(Model $model, array $context = [])` | Receives the affected model and, when reconstructed from a record, its stored context. |
| Record a finding | `static found(mixed ...$args): FindingRecord` | Constructs the finding with the supplied arguments and records or refreshes its identity. |
| Build context | `buildContext(): array` | Returns the context persisted for a newly detected finding; defaults to an empty array. |
| Key | `static key(): string` | Returns the `Key` value or, by default, the class basename. |
| Urgency | `static getUrgency(): ?FindingUrgency` | Returns the class-level urgency or `null`. |
| Worklist | `static getWorklist(): ?string` | Returns the class-level worklist or `null`. |
| Description | `static getDescription(): ?string` | Returns the class-level description or `null`. |
| Method description | `static getMethodDescription(string $method): ?string` | Returns a `Description` attached to the named method. |
| Auto-resolution | `isAutomaticallyResolved(): bool` | Reports whether the class has `AutoResolve`. |

`found()` accepts the finding constructor arguments. The default constructor therefore supports `MyFinding::found($model)` and `MyFinding::found($model, $context)`. Override the constructor only when the finding genuinely needs another input shape.

## Attributes

All attributes are in `DataHealth\Attributes`.

| Attribute | Target and constructor | Effect |
| --- | --- | --- |
| `Key` | Class: `new Key(string $key)` | Gives the finding a stable stored identity instead of using its class basename. |
| `Description` | Class or method: `new Description(string $description)` | Describes the finding type or its `detect()`, `verify()`, or `resolve()` action in user interfaces. |
| `Urgency` | Class: `new Urgency(FindingUrgency $urgency)` | Sets urgency on newly created records; the default is `NORMAL`. |
| `Worklist` | Class: `new Worklist(string $worklist)` | Assigns newly created records to a named operational worklist. |
| `Scheduled` | Class: `new Scheduled(string $expression)` | Registers a `CanDetect` finding with Laravel's scheduler using a five-field cron expression. |
| `Async` | Class: `new Async(?string $queue = null, ?string $connection = null)` | Dispatches scheduled detection to a unique queued job, optionally selecting its queue and connection. |
| `AutoResolve` | Class, no arguments | Calls the finding's resolver immediately after a new record is created. |

Changing `Urgency` or `Worklist` does not rewrite existing records; those values are copied when a record is first created. Descriptions are read from code at runtime and are not stored in the findings table.

Use a globally unique, permanent `Key` if the class may be renamed or if classes in different namespaces share a basename. Changing a key makes existing records impossible to reconstruct until they are migrated to the new key.

## Detection contract

Implement `DataHealth\Contracts\CanDetect` to make a finding detectable:

```php
public static function detect(): int|callable|null;
```

| Return value | Meaning |
| --- | --- |
| `int` | Number of findings detected; useful for manual UI feedback. |
| `callable` | Work that a supporting caller may execute through Laravel's container. Filament manual detection executes it; scheduled detection calls `detect()` itself and does not execute a returned callable. |
| `null` | Detection completed without reporting a count. |

The method is responsible for querying the source and calling `YourFinding::found(...)` for each problem. Returning a number alone does not create records.

## Verification contracts

Implement `DataHealth\Contracts\CanVerify` to check whether an existing record's problem has disappeared:

```php
public function verify(): bool|callable|string;
```

The result may be:

- a boolean;
- a callable returning a boolean, invoked through Laravel's container; or
- the class name of a service implementing `DataHealth\Contracts\Verifier`.

A dedicated verifier has this signature:

```php
use DataHealth\Models\FindingRecord;

public function verify(FindingRecord $record): bool;
```

When the final result is `true`, Data Health changes the record status to `resolved`. A `false` result leaves the current status unchanged.

## Resolution contracts

Implement `DataHealth\Contracts\CanResolve` to offer an application-defined fix:

```php
public function resolve(): bool|callable|string;
```

As with verification, return a boolean, a callable returning a boolean, or the class name of a service implementing `DataHealth\Contracts\Resolver`:

```php
use DataHealth\Models\FindingRecord;

public function resolve(FindingRecord $record): bool;
```

A final `true` result marks the record `resolved`; `false` leaves its status unchanged. Exceptions are not converted to `false` and should be handled by the application where appropriate.

## Facades and manager methods

`DataHealth\Facades\DataHealth` proxies the public `DataHealthManager` operations:

| Method | Result |
| --- | --- |
| `found(Finding $finding): FindingRecord` | Creates, refreshes, or reactivates a finding record. Prefer the finding class's `found()` helper for normal detection code. |
| `getFindingForRecord(FindingRecord $record): Finding` | Reconstructs the finding from its stored key, model, and context. |
| `verify(FindingRecord $record): bool` | Executes the finding's verification behavior and updates status on success. |
| `resolve(FindingRecord $record): bool` | Executes the finding's resolution behavior and updates status on success. |

`$record->getFinding()` is the record-oriented convenience for `DataHealth::getFindingForRecord($record)`. Both reconstruct the same finding instance from its stored key, affected model, and context; use whichever reads more naturally at the call site.

`DataHealth\Facades\CheckCursor` exposes one operation for bounded scans:

```php
CheckCursor::next(Builder $query, string $check, int $limit): Collection;
```

Pass a query ordered by its numeric primary key, the finding class as `$check`, and a positive batch size. See [Large Datasets](/guides/large-datasets/) for behavior and third-party API patterns.

## Finding record operations

Verification and automatic resolution should go through the `DataHealth` facade so the package executes the finding behavior before changing status. The remaining lifecycle operations are direct changes to the public `FindingRecord` model:

```php
use DataHealth\Enums\RecordStatus;

// Ignore this occurrence.
$record->update(['status' => RecordStatus::Ignored]);

// Reopen an ignored or resolved occurrence.
$record->update(['status' => RecordStatus::Active]);

// Mark it resolved without verification or resolution logic.
$record->update(['status' => RecordStatus::Resolved]);
```

These updates intentionally do not call `verify()` or `resolve()`. Rediscovery keeps an ignored record ignored, while rediscovery changes a resolved record back to active.

Use the polymorphic relationship to assign an application model without depending on the Filament integration:

```php
$record->assignee()->associate($user);
$record->save();

// Remove the assignment later.
$record->assignee()->dissociate();
$record->save();
```

Data Health stores assignment but does not define eligible assignee types or authorization rules in the core package. Those decisions belong to the application.

## Enums

`DataHealth\Enums\FindingUrgency` contains:

| Case | Stored value |
| --- | --- |
| `IMMEDIATE` | `immediate` |
| `SOON` | `soon` |
| `NORMAL` | `normal` |
| `DEFERRED` | `deferred` |

`DataHealth\Enums\RecordStatus` contains:

| Case | Stored value | Meaning |
| --- | --- | --- |
| `Active` | `active` | The problem currently requires attention. |
| `Ignored` | `ignored` | An operator has chosen not to act on the record. |
| `Resolved` | `resolved` | Verification, resolution, or a manual action has marked the problem complete. |
