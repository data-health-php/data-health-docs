---
title: Resolving Findings
description: Correct the problem represented by a finding and update its lifecycle safely.
---

Resolution performs an application-specific correction and marks the finding record resolved only after that correction succeeds.

## Contents

- [Resolution and verification](#resolution-and-verification)
- [The CanResolve contract](#the-canresolve-contract)
- [Return a boolean](#return-a-boolean)
- [Return a container-invoked callback](#return-a-container-invoked-callback)
- [Use a dedicated resolver class](#use-a-dedicated-resolver-class)
- [Update data safely](#update-data-safely)
- [Status changes](#status-changes)
- [Resolve new findings automatically](#resolve-new-findings-automatically)
- [Handle failures and retries](#handle-failures-and-retries)
- [Describe resolution](#describe-resolution)
- [Test resolution](#test-resolution)

## Resolution and verification

Verification checks whether a problem was already corrected elsewhere. Resolution attempts to correct it.

For a paid order that is still pending:

- verification reads the order and succeeds when it is no longer both paid and pending;
- resolution changes the order's status to `paid`; and
- detection can reactivate the finding if the inconsistent state returns later.

Resolution is optional. Some findings identify conditions that require human judgment, coordination with another team, or an action Data Health should not automate. Those findings can remain detectable and verifiable without implementing `CanResolve`.

Only add a resolver when the correct outcome is deterministic and the application can perform it safely.

## The CanResolve contract

Implement `DataHealth\Contracts\CanResolve` on an actionable finding:

```php
use DataHealth\Contracts\CanResolve;
use DataHealth\Finding;

class PaidOrderMarkedPending extends Finding implements CanResolve
{
    public function resolve(): bool
    {
        // Correct the problem and return whether it succeeded.
    }
}
```

The method may return:

- a boolean result;
- a callable that returns a boolean; or
- the class name of an implementation of `Resolver`.

In every form, return `true` only after the corrective operation has completed successfully. Return `false` when the operation completed but could not resolve the problem.

Run resolution through the Data Health facade so a successful result also updates the finding record:

```php
use DataHealth\Facades\DataHealth;

$resolved = DataHealth::resolve($record);
```

Calling `$finding->resolve()` directly performs only the finding's application logic and does not update its record status.

## Return a boolean

Simple corrections can live directly in the finding:

```php
use App\Models\Order;

public function resolve(): bool
{
    /** @var Order $order */
    $order = $this->model;

    return $order->update([
        'status' => 'paid',
    ]);
}
```

Eloquent's `update()` returns a boolean, which makes it suitable for a direct resolver when the update itself completely represents success.

For multi-step corrections, do not return `true` after only the first step. Complete the entire operation, verify its required postconditions when appropriate, and then return the final outcome.

## Return a container-invoked callback

Return a callable when a compact resolver needs container-injected application services:

```php
use App\Models\Customer;
use App\Services\CustomerMerger;

public function resolve(): callable
{
    /** @var Customer $customer */
    $customer = $this->model;

    $duplicateId = $this->context['duplicate_customer_id'];

    return function (CustomerMerger $merger) use ($customer, $duplicateId): bool {
        return $merger->merge(
            duplicate: $customer,
            canonicalId: $duplicateId,
        );
    };
}
```

Data Health invokes the callable with `app()->call()`. Parameters may therefore use services registered in Laravel's container, while the closure can capture the affected model and persisted context.

Use callbacks for concise orchestration. Move complex, reusable, or independently tested operations into a dedicated resolver class.

## Use a dedicated resolver class

Create a class implementing `DataHealth\Contracts\Resolver` when resolution deserves its own dependency boundary:

```php
<?php

declare(strict_types=1);

namespace App\DataHealth\Resolvers;

use App\Models\Customer;
use App\Services\CustomerMerger;
use DataHealth\Contracts\Resolver;
use DataHealth\Models\FindingRecord;

class DuplicateCustomerResolver implements Resolver
{
    public function __construct(
        private readonly CustomerMerger $merger,
    ) {}

    public function resolve(FindingRecord $record): bool
    {
        /** @var Customer $duplicate */
        $duplicate = $record->model;

        return $this->merger->merge(
            duplicate: $duplicate,
            canonicalId: $record->context['canonical_customer_id'],
        );
    }
}
```

Return the resolver class from the finding:

```php
use App\DataHealth\Resolvers\DuplicateCustomerResolver;

public function resolve(): string
{
    return DuplicateCustomerResolver::class;
}
```

Data Health resolves the class through Laravel's container and passes it the full finding record. Returning a class that does not implement `Resolver` causes resolution to fail with a runtime exception.

## Update data safely

Resolvers modify production data, so treat them with the same care as application commands or service-layer operations.

A safe resolver should:

- confirm the problem still applies before changing data;
- be idempotent when practical, so retrying does not corrupt state;
- use database transactions for related local writes that must succeed together;
- use row locks when concurrent application updates could conflict;
- preserve domain events and invariants expected by the rest of the application;
- avoid destructive guesses when the correct outcome is ambiguous; and
- record application-specific audit information when required.

For example, a resolver can recheck and lock an order inside a transaction:

```php
use App\Models\Order;
use Illuminate\Support\Facades\DB;

public function resolve(): bool
{
    /** @var Order $order */
    $order = $this->model;

    return DB::transaction(function () use ($order): bool {
        $current = Order::query()
            ->lockForUpdate()
            ->findOrFail($order->getKey());

        if ($current->paid_at === null) {
            return true;
        }

        if ($current->status !== 'pending') {
            return true;
        }

        return $current->update(['status' => 'paid']);
    });
}
```

Returning `true` when the problem has already disappeared makes this resolver safe to retry: its desired postcondition is satisfied even when another process performed the correction first.

External API changes cannot usually share a database transaction. Design those operations around the provider's idempotency features, verify responses explicitly, and avoid marking the finding resolved when the remote outcome is unknown.

## Status changes

A successful final result marks the finding record as resolved:

```php
DataHealth::resolve($record);
// true

$record->refresh()->status->value;
// 'resolved'
```

A `false` result leaves the record status unchanged:

```php
DataHealth::resolve($record);
// false

$record->refresh()->status->value;
// 'active'
```

Data Health changes the record status after the resolver returns successfully. The application-data update and status update are not automatically wrapped in one transaction by the package.

If detection finds the same identity again later, the resolved record becomes active. Resolution records the current success; it does not permanently suppress recurrence.

Data Health Filament exposes the resolve action only for active records whose finding implements `CanResolve`, and asks for confirmation before running it.

## Resolve new findings automatically

Add `AutoResolve` when every newly detected occurrence should immediately attempt its resolver:

```php
use DataHealth\Attributes\AutoResolve;
use DataHealth\Contracts\CanResolve;
use DataHealth\Finding;

#[AutoResolve]
class PaidOrderMarkedPending extends Finding implements CanResolve
{
    public function resolve(): bool
    {
        // ...
    }
}
```

When `found()` creates a new record, Data Health calls its resolver immediately:

- a `true` result creates the record and then marks it resolved;
- a `false` result leaves the new record active; and
- an exception leaves resolution incomplete and propagates to the caller.

Automatic resolution runs only when the finding record is first created. It does not automatically retry an existing active record, and it does not rerun merely because detection reactivates a previously resolved record.

:::caution
Use automatic resolution only for deterministic, low-risk, idempotent corrections. Detection now causes a write to application data as part of reporting the finding.
:::

## Handle failures and retries

Resolution can finish in three ways:

| Outcome | Meaning | Record status |
| --- | --- | --- |
| `true` | The problem was corrected or its desired postcondition already holds. | Becomes `resolved`. |
| `false` | The operation completed but could not correct the problem. | Remains unchanged. |
| Exception | The operation could not reach a reliable conclusion. | Remains unchanged; the exception propagates. |

Use `false` for an expected business outcome, such as a correction being unsafe without additional information. Throw for infrastructure failures, invalid state, or partial operations that require investigation.

Before retrying, consider whether the first attempt may have changed some data. Idempotent resolvers and explicit postcondition checks make retries safer. For multi-system workflows, store or use an idempotency key and reconcile unknown external outcomes before repeating the request.

Do not catch every exception and return `false`; that hides operational failures as ordinary unresolved findings.

## Describe resolution

Use `Description` on the method to tell operators what the action will change:

```php
use DataHealth\Attributes\Description;

#[Description('Changes the order status from pending to paid.')]
public function resolve(): bool
{
    // ...
}
```

Data Health Filament displays this text in the confirmation dialog and action tooltip. Be explicit about destructive changes, external side effects, or actions that cannot be undone.

## Test resolution

Test both the application data and the finding record:

```php
use App\DataHealth\PaidOrderMarkedPending;
use App\Models\Order;
use DataHealth\Enums\RecordStatus;
use DataHealth\Facades\DataHealth;

it('marks a paid pending order as paid', function () {
    $order = Order::factory()->create([
        'paid_at' => now(),
        'status' => 'pending',
    ]);

    $record = PaidOrderMarkedPending::found($order);

    expect(DataHealth::resolve($record))->toBeTrue()
        ->and($order->refresh()->status)->toBe('paid')
        ->and($record->refresh()->status)->toBe(RecordStatus::Resolved);
});
```

Also test the failure path, repeated execution, stale model state, and exceptions from injected services. For `AutoResolve`, assert separately that successful new findings become resolved and failed ones remain active.

Continue with [Scheduling and Queues](/guides/scheduling-and-queues/) to automate detection, or [Managing Findings](/filament/managing-findings/) to expose resolution actions through Filament.
