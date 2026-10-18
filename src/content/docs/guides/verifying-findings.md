---
title: Verifying Findings
description: Check whether an active finding still applies without changing the affected data.
---

Verification rechecks an existing finding against current application data and resolves its record when the original problem no longer applies.

## Contents

- [Verification and detection](#verification-and-detection)
- [The CanVerify contract](#the-canverify-contract)
- [Return a boolean](#return-a-boolean)
- [Verify a record with Artisan](#verify-a-record-with-artisan)
- [Access the model and context](#access-the-model-and-context)
- [Return a container-invoked callback](#return-a-container-invoked-callback)
- [Use a dedicated verifier class](#use-a-dedicated-verifier-class)
- [Automatically verify new records](#automatically-verify-new-records)
- [Status changes](#status-changes)
- [Handle unknown and failed checks](#handle-unknown-and-failed-checks)
- [Describe verification](#describe-verification)
- [Test verification](#test-verification)

## Verification and detection

Detection searches for current problems and creates or refreshes finding records. Verification starts from one existing record and asks whether that specific occurrence still exists.

For example, detection may report an order because it has a payment timestamp but is still pending. After another process updates the order, verification can confirm that the inconsistency is gone and mark the finding resolved.

Verification should normally be read-only. It observes the affected model and any related systems but does not correct them. Use [Resolving Findings](/data-health-docs/guides/resolving-findings/) when the operation should change application data.

| Operation | Starts with | Purpose |
| --- | --- | --- |
| Detection | A finding class | Search for every current occurrence. |
| Verification | A finding record | Check whether one recorded occurrence still applies. |
| Resolution | A finding record | Attempt to correct one recorded occurrence. |

Verification is particularly useful when problems can be fixed outside Data Health, such as through ordinary application workflows, imports, webhooks, or manual administration.

## The CanVerify contract

Implement `DataHealth\Contracts\CanVerify` on a finding that knows how to recheck its condition:

```php
use DataHealth\Contracts\CanVerify;
use DataHealth\Finding;

class PaidOrderMarkedPending extends Finding implements CanVerify
{
    public function verify(): bool
    {
        // Return true when the problem no longer applies.
    }
}
```

The method may return:

- a boolean result;
- a callable that returns a boolean; or
- the class name of an implementation of `Verifier`.

In every form, `true` means **the finding no longer applies** and `false` means **the finding still applies**.

:::caution
Do not return `true` when the problem is present. Verification uses `true` as confirmation that Data Health may mark the record resolved.
:::

## Return a boolean

For checks that need only the finding's model and context, perform verification directly and return a boolean:

```php
use App\Models\Order;

public function verify(): bool
{
    /** @var Order $order */
    $order = $this->model->refresh();

    return $order->paid_at === null || $order->status !== 'pending';
}
```

The original problem requires both a payment timestamp and the pending status. If either part is no longer true, the finding no longer applies and verification succeeds.

Refreshing the model prevents verification from relying on attributes that were loaded when the finding record was retrieved rather than the latest stored state.

Run verification through the Data Health facade:

```php
use DataHealth\Facades\DataHealth;

$verified = DataHealth::verify($record);
```

Calling the facade ensures the record status is updated after successful verification. Calling `$finding->verify()` directly returns the check result but does not update its `FindingRecord`.

## Verify a record with Artisan

Run verification synchronously for a persisted finding record:

```bash
php artisan verify 1
```

The required `id` argument is the `FindingRecord` ID from `data_health_findings`.
Use the record ID, rather than the affected model's ID or the finding's key.
The finding must implement `CanVerify`.

The command calls the Data Health manager, which evaluates the finding's
`verify()` return value. It supports booleans, callables invoked through Laravel's
container, and `Verifier` handler classes resolved through the container.

| Outcome | Output | Record status | Exit code |
| --- | --- | --- | --- |
| `true` | `Finding record 1 verified.` | Becomes `resolved`. | `0` |
| `false` | `Finding record 1 could not be verified.` | Remains unchanged. | `1` |
| Missing record | `Finding record 1 was not found.` | No record is updated. | `1` |
| Unsupported action or exception | The exception message. | No success status update is applied. | `1` |

## Access the model and context

Data Health reconstructs the finding with the model and context stored on its record. Inline verification can use both through the inherited properties:

```php
use App\Models\Customer;

public function verify(): bool
{
    /** @var Customer $customer */
    $customer = $this->model;

    $documentType = $this->context['document_type'];

    return $customer
        ->documents()
        ->where('type', $documentType)
        ->exists();
}
```

This finding was created because the document did not exist, so finding it now means the problem has been fixed.

Persist every stable value needed to identify and recheck an occurrence. See [Context](/data-health-docs/guides/context/) for context design and identity rules.

## Return a container-invoked callback

Return a callable when verification needs a service that should be injected by Laravel's container:

```php
use App\Models\Subscription;
use App\Services\BillingProvider;

public function verify(): callable
{
    /** @var Subscription $subscription */
    $subscription = $this->model;

    return function (BillingProvider $billing) use ($subscription): bool {
        $remote = $billing->findSubscription(
            $subscription->provider_id,
        );

        return $remote->status === $subscription->status;
    };
}
```

Data Health invokes the callback with `app()->call()`, so its parameters may use container-resolvable dependencies. The callback must ultimately return a boolean.

Callbacks keep a small dependency-assisted check close to its finding. When verification logic is substantial or shared, use a dedicated verifier instead.

## Use a dedicated verifier class

A verifier class separates operational logic from the finding definition and supports constructor injection, reuse, and focused testing.

Create a class that implements `DataHealth\Contracts\Verifier`:

```php
<?php

declare(strict_types=1);

namespace App\DataHealth\Verifiers;

use App\Models\Subscription;
use App\Services\BillingProvider;
use DataHealth\Contracts\Verifier;
use DataHealth\Models\FindingRecord;

class ExternalSubscriptionStatusVerifier implements Verifier
{
    public function __construct(
        private readonly BillingProvider $billing,
    ) {}

    public function verify(FindingRecord $record): bool
    {
        /** @var Subscription $subscription */
        $subscription = $record->model;

        $remote = $this->billing->findSubscription(
            $subscription->provider_id,
        );

        return $remote->status === $subscription->status;
    }
}
```

Return its class name from the finding:

```php
use App\DataHealth\Verifiers\ExternalSubscriptionStatusVerifier;

public function verify(): string
{
    return ExternalSubscriptionStatusVerifier::class;
}
```

Data Health resolves the verifier from Laravel's container and passes it the complete finding record. Returning a class that does not implement `Verifier` causes verification to fail with a runtime exception.

## Automatically verify new records

Add `AutoVerify` when every newly created record should be checked automatically through Laravel's queue:

```php
use DataHealth\Attributes\AutoVerify;
use DataHealth\Contracts\CanVerify;
use DataHealth\Finding;

#[AutoVerify]
class PaidOrderMarkedPending extends Finding implements CanVerify
{
    public function verify(): bool
    {
        $order = $this->model->refresh();

        return $order->paid_at === null || $order->status !== 'pending';
    }
}
```

The verification job is dispatched after the database transaction that created the finding record commits. With the default `sync` queue connection, it runs immediately after creation. With an asynchronous queue connection, a worker must be running.

Pass a number of minutes to allow a short consistency window before verification:

```php
#[AutoVerify(2)]
class PaidOrderMarkedPending extends Finding implements CanVerify
{
    // ...
}
```

This dispatches the job with a two-minute delay. The queue backend and worker must support delayed jobs.

Automatic verification is scheduled only when `found()` creates a record. Rediscovering an existing active, ignored, or resolved record does not schedule another job. When a delayed job runs, it verifies the record only if the record is still active, so an operator action taken during the delay is preserved.

`AutoVerify` does not replace `CanVerify`: applying the attribute to a finding that does not implement the contract causes the queued job to fail. Exceptions from `verify()` also remain queue failures and follow the application's normal retry and failure handling.

## Status changes

When the final verification result is `true`, Data Health updates the record to `resolved`:

```php
DataHealth::verify($record);
// true

$record->refresh()->status->value;
// 'resolved'
```

When the result is `false`, the record's status remains unchanged:

```php
DataHealth::verify($record);
// false

$record->refresh()->status->value;
// 'active'
```

If detection later observes the same finding identity again, it reactivates the resolved record. Verification therefore records the current conclusion without preventing a real problem from recurring.

Data Health Filament exposes verification only for active records whose finding implements `CanVerify`.

## Handle unknown and failed checks

A failed verification result and an unavailable verification are not the same thing:

- Return `false` when the check completed and confirmed that the problem still applies.
- Throw an exception when the check could not reach a reliable conclusion.

For example, a timeout from a third-party service does not prove that local and remote data still disagree. Allowing that failure to throw keeps the record unchanged and lets your application's exception handling report the operational problem.

Avoid swallowing every exception and returning `false`; doing so presents infrastructure failures as confirmed unhealthy data. If temporary failures are expected, catch only the exceptions you can classify and emit appropriate logs or telemetry.

Verification should also avoid side effects. If checking requires changing data, the behavior belongs in a resolver instead.

## Describe verification

Add `Description` to the method to explain the check in user interfaces:

```php
use DataHealth\Attributes\Description;

#[Description('Checks whether the order is no longer both paid and pending.')]
public function verify(): bool
{
    // ...
}
```

Data Health Filament uses this description for the verification action and falls back to a generic explanation when no method description is present.

Write descriptions from an operator's perspective: explain what will be checked, especially when verification contacts another service or may take noticeable time.

## Test verification

Test both outcomes and the resulting record status:

```php
use App\DataHealth\PaidOrderMarkedPending;
use App\Models\Order;
use DataHealth\Enums\RecordStatus;
use DataHealth\Facades\DataHealth;

it('resolves the finding after the order is corrected', function () {
    $order = Order::factory()->create([
        'paid_at' => now(),
        'status' => 'pending',
    ]);

    $record = PaidOrderMarkedPending::found($order);

    expect(DataHealth::verify($record))->toBeFalse()
        ->and($record->refresh()->status)->toBe(RecordStatus::Active);

    $order->update(['status' => 'paid']);

    expect(DataHealth::verify($record))->toBeTrue()
        ->and($record->refresh()->status)->toBe(RecordStatus::Resolved);
});
```

For callback or verifier implementations, also test container dependency resolution and exception behavior. Mock remote services at their application boundary rather than testing against a live provider.

Continue with [Resolving Findings](/data-health-docs/guides/resolving-findings/) to correct problems automatically, or [Managing Findings](/data-health-docs/filament/managing-findings/) to expose verification to operators.
