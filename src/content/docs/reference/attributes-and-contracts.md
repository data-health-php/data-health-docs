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
use DataHealth\Attributes\AutoVerify;
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
use Illuminate\Support\Facades\DB;

#[Key('paid-order-marked-pending')]
#[Description('A paid order is still marked as pending.')]
#[Urgency(FindingUrgency::SOON)]
#[Worklist('billing-operations')]
#[Scheduled('*/15 * * * *')]
#[AutoVerify(2)]
class PaidOrderMarkedPending extends Finding implements CanDetect, CanVerify, CanResolve
{
    #[Async(queue: 'data-health', connection: 'redis')]
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

    #[Description('Check whether the order is no longer both paid and pending.')]
    public function verify(): bool
    {
        $order = $this->model->refresh();

        if (! $order instanceof Order) {
            throw new \LogicException('Expected an Order model.');
        }

        return $order->paid_at === null || $order->status !== 'pending';
    }

    #[Description('Recheck the order and mark it paid if still applicable.')]
    public function resolve(): bool
    {
        if (! $this->model instanceof Order) {
            throw new \LogicException('Expected an Order model.');
        }

        return DB::transaction(function (): bool {
            $order = Order::query()->lockForUpdate()->findOrFail($this->model->getKey());

            if ($order->paid_at === null || $order->status !== 'pending') {
                return true;
            }

            return $order->update(['status' => 'paid']);
        });
    }
}
```

Use only the attributes and contracts the finding needs. `AutoResolve` attempts a fix immediately after creation, while `AutoVerify` queues a read-only check immediately or after a short delay.

## Finding base class

Every finding extends `DataHealth\Finding`.

| Member | Signature | Meaning |
| --- | --- | --- |
| Constructor | `__construct(Model $model, array $context = [])` | Receives the affected model and, when reconstructed from a record, its stored context. |
| Record a finding | `static found(mixed ...$args): FindingRecord` | Constructs the finding with the supplied arguments and records or refreshes its identity. |
| Key | `static key(): string` | Returns the `Key` value or, by default, the class basename. |
| Urgency | `static getUrgency(): ?FindingUrgency` | Returns the class-level urgency or `null`. |
| Worklist | `static getWorklist(): ?string` | Returns the class-level worklist or `null`. |
| Description | `static getDescription(): ?string` | Returns the class-level description or `null`. |
| Method description | `static getMethodDescription(string $method): ?string` | Returns a `Description` attached to the named method. |
| Async detection | `static getAsync(): ?Async` | Returns `Async` on `detect()`, or `null`; rejects invalid placement. |
| Auto-resolution | `isAutomaticallyResolved(): bool` | Reports whether the class has `AutoResolve`. |
| Auto-verification delay | `getAutoVerifyDelay(): ?int` | Returns the `AutoVerify` delay in minutes, or `null` when automatic verification is disabled. |

`found()` accepts the finding constructor arguments. The default constructor therefore supports `MyFinding::found($model)` and `MyFinding::found($model, $context)`. Data Health persists the constructor context directly and uses it when calculating finding identity.

## Attributes

All attributes are in `DataHealth\Attributes`.

| Attribute | Target and constructor | Effect |
| --- | --- | --- |
| `Key` | Class: `new Key(string $key)` | Gives the finding a stable stored identity instead of using its class basename. |
| `Description` | Class or method: `new Description(string $description)` | Describes the finding type or its `detect()`, `verify()`, or `resolve()` action in user interfaces. |
| `Urgency` | Class: `new Urgency(FindingUrgency $urgency)` | Sets urgency on newly created records; the default is `NORMAL`. |
| `Worklist` | Class: `new Worklist(string $worklist)` | Assigns newly created records to a named operational worklist. |
| `Scheduled` | Class: `new Scheduled(string $expression)` | Registers a `CanDetect` finding with Laravel's scheduler using a five-field cron expression. |
| `Async` | Only the `detect()` method: `new Async(?string $queue = null, ?string $connection = null)` | Queues manual and scheduled detection. Class-level usage and placement on other methods are rejected during finding discovery. |
| `AutoResolve` | Class, no arguments | Calls the finding's resolver immediately after a new record is created. |
| `AutoVerify` | Class: `new AutoVerify(int $delay = 0)` | Queues verification after a new record is created, optionally delayed by a non-negative number of minutes. |

Move existing class-level `Async` attributes onto `detect()`. Verification and resolution stay synchronous and return boolean results. `AutoVerify` independently queues verification with application queue defaults; detection routing does not affect it.

Changing `Urgency` or `Worklist` does not rewrite existing records; those values are copied when a record is first created. Descriptions are read from code at runtime and are not stored in the findings table.

Use a globally unique, permanent `Key` if the class may be renamed or if classes in different namespaces share a basename. Changing a key makes existing records impossible to reconstruct until they are migrated to the new key.

## Detection contract

Implement `DataHealth\Contracts\CanDetect` to make a finding detectable:

```php
public static function detect(): int|callable|string|null;
```

| Return value | Meaning |
| --- | --- |
| `null` | Recommended inline result after reporting occurrences. |
| `int` | Optional count of occurrences reported. Core execution discards it; Filament manual detection displays it. |
| `callable` | Work returning an integer or `null`, invoked through Laravel's container by `health:detect`, queued `DetectFinding` jobs, and Filament manual detection. Synchronous scheduled detection invokes it through the container too. |
| `class-string<Detector>` | A container-resolved detector for core manual, scheduled, and queued detection. Filament manual detection currently does not resolve this form. |

The method is responsible for querying the source and calling `YourFinding::found(...)` for each problem. Returning a number alone does not create records.

Inline `detect(): null` is the ordinary implementation. Keep corrections in resolution;
explicit `AutoResolve` can invoke a correction when `found()` creates a new record.
Core detection evaluates returned callables and handlers, while direct PHP calls only
return them and leave evaluation to the caller. Filament manual detection also does
not honor `Async` routing.

A dedicated detector implements `DataHealth\Contracts\Detector`:

```php
use App\Models\Order;
use DataHealth\Contracts\Detector;

class PaidOrderDetector implements Detector
{
    public function detect(): null
    {
        Order::query()
            ->whereNotNull('paid_at')
            ->where('status', 'pending')
            ->eachById(fn (Order $order) => PaidOrderMarkedPending::found($order));

        return null;
    }
}
```

Return `PaidOrderDetector::class` from the finding's `detect(): string` method to
delegate. The `Detector` interface accepts `detect(): ?int`; returning `null` is the
recommended narrower implementation. Existing integer and callable integrations
remain supported.


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

Verification checks one occurrence using its model, identifying context, and relevant related data. Do not change business data or rerun detection; shared read-only predicates are appropriate. Throw for an unexpected model, invalid required context, or an unavailable check.

When the final result is `true`, Data Health changes the record status to `resolved`. A `false` result leaves the current status unchanged.

`AutoVerify` dispatches this verification after a new record's transaction commits. It runs only for newly created records and only while the record remains active. Use `#[AutoVerify(2)]` to delay the queued check by two minutes; asynchronous and delayed execution requires a configured queue worker.

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

Resolution rechecks this occurrence and applies a known correction through application logic. Return `true` when corrected or already gone, `false` for an expected inability to correct it, and throw for invalid input or operational failures. Implementing `CanResolve` exposes an action; `AutoResolve` separately opts into immediate execution on first record creation.

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

Pass a query ordered by its numeric primary key, the finding class as `$check`, and a positive batch size. See [Large Datasets](/data-health-docs/guides/large-datasets/) for behavior and third-party API patterns.

## Finding record operations

Manual verification and resolution should go through the `DataHealth` facade so the package executes the finding behavior before changing status. The remaining lifecycle operations are direct changes to the public `FindingRecord` model:

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
