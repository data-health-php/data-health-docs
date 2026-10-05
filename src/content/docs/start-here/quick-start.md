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

:::note[Adapt this example]
This is an adaptation recipe for an existing Laravel application, not scaffolding for a blank project. It assumes you have completed [Installation](/data-health-docs/start-here/installation/), run the Data Health migrations, and have an `Order` model with the fields above. Replace the model, query, and valid status values with a real inconsistency from your application.
:::

## Create the finding

Create `app/DataHealth/PaidOrderMarkedPending.php`:

```php
<?php

declare(strict_types=1);

namespace App\DataHealth;

use App\Models\Order;
use DataHealth\Attributes\Description;
use DataHealth\Attributes\Key;
use DataHealth\Contracts\CanDetect;
use DataHealth\Contracts\CanResolve;
use DataHealth\Contracts\CanVerify;
use DataHealth\Finding;

#[Key('paid-order-marked-pending')]
#[Description('A paid order is still marked as pending.')]
class PaidOrderMarkedPending extends Finding implements CanDetect, CanResolve, CanVerify
{
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

    public function verify(): bool
    {
        $order = $this->order()->refresh();

        return $order->paid_at === null || $order->status !== 'pending';
    }

    public function resolve(): bool
    {
        return $this->order()->update([
            'status' => 'paid',
        ]);
    }

    private function order(): Order
    {
        /** @var Order $order */
        $order = $this->model;

        return $order;
    }
}
```

The `Key` attribute gives the finding a stable database identity even if the PHP class is renamed later, while `Description` provides a human-readable explanation for interfaces such as Data Health Filament.

The three contracts enable different parts of the lifecycle:

- `CanDetect` allows the class to search for inconsistent orders.
- `CanVerify` allows an existing record to check whether its problem still applies.
- `CanResolve` allows the finding to correct the order itself.

## How detection works

The `detect()` method queries only orders matching the unhealthy state and calls `found()` for each one. Data Health then creates a finding record identified by:

- the stable finding key;
- the order's morph type;
- the order's primary key; and
- the finding's context.

This example does not need additional context because there can be only one instance of this problem per order. Calling `found()` repeatedly for the same order therefore refreshes the existing record instead of creating duplicates.

Returning the number of detected orders makes the method useful from commands, jobs, tests, and the Filament manual-detection interface.

:::tip
Defining a finding does not run detection automatically. Call `detect()` yourself or configure [Scheduling and Queues](/data-health-docs/guides/scheduling-and-queues/) when detection should run periodically.
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

Call the finding's detection method:

```php
use App\DataHealth\PaidOrderMarkedPending;

PaidOrderMarkedPending::detect();
// 1
```

The return value is the number of orders detected during this run.

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

The record remains linked to its order through a polymorphic Eloquent relationship. Its active status means that the inconsistency still requires attention.

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
// 1

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

Running detection now returns zero because no order matches the unhealthy state:

```php
PaidOrderMarkedPending::detect();
// 0
```

If the same order becomes inconsistent later, detection reactivates its existing finding record instead of inserting another one. This preserves the identity of the problem while allowing it to recur throughout the model's lifetime.

## Next steps

You now have a complete finding that can be detected, verified, and resolved. Continue with:

- [Findings and Records](/data-health-docs/core-concepts/findings-and-records/) for a deeper explanation of identity, context, and statuses;
- [Detecting Problems](/data-health-docs/guides/detecting-problems/) for detection patterns and testing guidance;
- [Scheduling and Queues](/data-health-docs/guides/scheduling-and-queues/) to run detection automatically; or
- [Filament Installation](/data-health-docs/filament/installation/) to manage findings through a Filament panel.
