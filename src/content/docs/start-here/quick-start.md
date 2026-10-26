---
title: Quick Start
description: Build a finding that detects paid orders incorrectly marked as pending and resolves them.
---

In this guide, you will create a finding for orders that have been paid but are still marked as pending, record an affected order, and then verify or resolve the problem.

## Contents

- [The data problem](#the-data-problem)
- [Create the finding](#create-the-finding)
- [How detection works](#how-detection-works)
- [Create an inconsistent order](#create-an-inconsistent-order)
- [Run detection](#run-detection)
- [Inspect the finding record](#inspect-the-finding-record)
- [Verify an external correction](#verify-an-external-correction)
- [Resolve the finding](#resolve-the-finding)
- [What happens when detection runs again](#what-happens-when-detection-runs-again)
- [Next steps](#next-steps)

## The data problem

Assume your application has an `App\Models\Order` model with a nullable `paid_at` timestamp and a string `status` column. A paid order should have the `paid` status, so the following state is inconsistent:

```text
paid_at: 2026-10-02 10:00:00
status:  pending
```

The finding will consider an order unhealthy when `paid_at` is not null and `status` is `pending`.

## Create the finding

Generate `app/DataHealth/PaidOrderMarkedPending.php` with detection, verification, and resolution placeholders:

```bash
php artisan health:make:finding PaidOrderMarkedPending --verify --resolve
```

The generator includes `CanDetect` by default. You can customize the default interfaces and add metadata or scheduling options; see [Generating Finding Classes](/data-health-docs/guides/generating-finding-classes/).

Replace the generated placeholders with the implementation below and add its `Description` attribute:

```php
<?php

declare(strict_types=1);

namespace App\DataHealth;

use App\Models\Order;
use DataHealth\Attributes\Description;
use DataHealth\Contracts\CanDetect;
use DataHealth\Contracts\CanResolve;
use DataHealth\Contracts\CanVerify;
use DataHealth\Finding;
use Illuminate\Support\Facades\DB;

#[Description('A paid order is still marked as pending.')]
class PaidOrderMarkedPending extends Finding implements CanDetect, CanVerify, CanResolve
{
    public static function detect(): null
    {
        Order::query()
            ->whereNotNull('paid_at')
            ->where('status', 'pending')
            ->eachById(fn (Order $order) => self::found($order));

        return null;
    }

    public function verify(): bool
    {
        $order = $this->model->refresh();

        if (! $order instanceof Order) {
            throw new \LogicException('Expected an Order model.');
        }

        return $order->paid_at === null || $order->status !== 'pending';
    }

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

The `Description` attribute provides a human-readable explanation for interfaces such as Data Health Filament.

The resolver locks and rechecks the current order before updating it. If another process already corrected it or changed it to another valid state, it returns `true` without overwriting that state. Reuse an existing application action when it owns this transition.

The three contracts enable different parts of the lifecycle:

- `CanDetect` allows the class to search for inconsistent orders.
- `CanVerify` allows an existing record to check whether its problem still applies.
- `CanResolve` allows the finding to correct the order itself.

Implementing resolution exposes an action; it does not execute automatically. `#[AutoResolve]` separately opts into resolution on first record creation. Assess this capability for every finding, and omit it when a correction requires human judgment.

## How detection works

The `detect()` method queries only orders matching the unhealthy state and calls `found()` for each one. Data Health then creates a finding record identified by:

- the finding key (`PaidOrderMarkedPending`, derived from the class name by default);
- the order's morph type;
- the order's primary key; and
- the finding's [context](/data-health-docs/guides/context/).

This example does not need additional context because there can be only one instance of this problem per order. Calling `found()` repeatedly for the same order therefore refreshes the existing record instead of creating duplicates.

The method returns `null`. Optional counts and delegation are advanced integrations described in the [contract reference](/data-health-docs/reference/attributes-and-contracts/#detection-contract). Calling `found()` is what creates or refreshes finding records.

:::tip
Defining a finding does not run detection automatically. Run `php artisan health:detect`, call `detect()` yourself, or configure [Scheduling and Queues](/data-health-docs/guides/scheduling-and-queues/) when detection should run periodically.
:::

## Create an inconsistent order

Open Laravel Tinker:

```bash
php artisan tinker
```

Create an order that is paid but still pending, supplying any other attributes required by your application's model:

```php
use App\Models\Order;

$order = new Order();
$order->paid_at = now();
$order->status = 'pending';
$order->save();
```

## Run detection

The command below runs immediately with `-n`. Omit that flag in a terminal to choose findings interactively. See [CLI Overview](/data-health-docs/cli/overview/) for the complete command suite.

From another terminal in your Laravel application, run this finding through Artisan:

```bash
php artisan health:detect PaidOrderMarkedPending -n
```

The command runs detection synchronously and reports `Completed: PaidOrderMarkedPending` followed by a summary. Omit the finding name to run all discovered `CanDetect` findings. Use `--async` to queue a run; see the [Detection command](/data-health-docs/cli/detect/) for selection, exclusions, and queue routing.

You can also call the finding's detection method in the Tinker session:

```php
use App\DataHealth\PaidOrderMarkedPending;

PaidOrderMarkedPending::detect();
// null
```

Detection reports the matching order and returns `null`. Inspect the finding record to see the result.

## Inspect the finding record

Retrieve the record created for the order:

```php
use DataHealth\Models\FindingRecord;

$record = FindingRecord::query()
    ->where('key', PaidOrderMarkedPending::key())
    ->where('model_type', $order->getMorphClass())
    ->where('model_id', $order->getKey())
    ->firstOrFail();

$record->status->value;
// 'active'

$record->model->is($order);
// true

$record->context;
// []
```

The record remains linked to its order through a polymorphic Eloquent relationship. Its active status means that the inconsistency still requires attention. To inspect it from a terminal, run `php artisan health:records`; see [Record Browser](/data-health-docs/cli/records/) for filters, details, and actions.

## Verify an external correction

Verification is useful when the underlying data may have been corrected somewhere else. While the order is still pending, verification returns `false` and leaves the record active:

```php
use DataHealth\Facades\DataHealth;

DataHealth::verify($record);
// false

$record->refresh()->status->value;
// 'active'
```

Correct the order outside Data Health and verify it again:

```php
$order->update(['status' => 'paid']);

DataHealth::verify($record);
// true

$record->refresh()->status->value;
// 'resolved'
```

A verifier returns `true` when the recorded problem no longer applies. Data Health responds by marking the finding record as resolved.

## Resolve the finding

To demonstrate resolution, make the order inconsistent again and rerun detection:

```php
$order->update(['status' => 'pending']);

PaidOrderMarkedPending::detect();
// null

$record->refresh()->status->value;
// 'active'
```

Data Health reactivates the existing record because the same problem has returned. Resolve it through the facade:

```php
DataHealth::resolve($record);
// true

$order->refresh()->status;
// 'paid'

$record->refresh()->status->value;
// 'resolved'
```

The finding's `resolve()` method changes the order, and its successful `true` response tells Data Health to mark the record as resolved.

## What happens when detection runs again

Running detection now reports no findings because no order matches the unhealthy state. The method still returns `null`:

```php
PaidOrderMarkedPending::detect();
// null
```

If the same order becomes inconsistent later, detection reactivates its existing finding record instead of inserting another one. This preserves the identity of the problem while allowing it to recur throughout the model's lifetime.

## Next steps

You now have a complete finding that can be detected, verified, and resolved. Continue with:

- [Findings and Records](/data-health-docs/core-concepts/findings-and-records/) for a deeper explanation of identity, context, and statuses;
- [Detecting Problems](/data-health-docs/guides/detecting-problems/) for detection patterns and testing guidance;
- [Scheduling and Queues](/data-health-docs/guides/scheduling-and-queues/) to run detection automatically; or
- [Filament Installation](/data-health-docs/filament/installation/) to manage findings through a Filament panel.
