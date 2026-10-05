---
title: Large Datasets
description: Spread expensive data-health checks across controlled batches.
---

Use persistent cursors to check a limited batch of local models at a time, including when each model requires a call to a rate-limited third-party API.

## Contents

- [When to split detection into batches](#when-to-split-detection-into-batches)
- [How persistent cursors work](#how-persistent-cursors-work)
- [Select the next models](#select-the-next-models)
- [Choose a cursor key](#choose-a-cursor-key)
- [Choose a batch size](#choose-a-batch-size)
- [Filter the candidate query](#filter-the-candidate-query)
- [Check records against a third-party API](#check-records-against-a-third-party-api)
- [Complete and restart a scan](#complete-and-restart-a-scan)
- [Handle failures and retries](#handle-failures-and-retries)
- [Prevent concurrent scans](#prevent-concurrent-scans)
- [Schedule batched checks](#schedule-batched-checks)
- [Monitor scan progress](#monitor-scan-progress)

## When to split detection into batches

A detector does not always need to inspect every candidate model in one run. Split work into batches when a complete scan would:

- consume too much memory or database time;
- exceed a scheduler or request timeout;
- compete with normal application queries;
- make too many calls to a third-party service;
- exceed an API rate limit; or
- concentrate too much work in one queue job.

Data Health provides a persistent cursor that selects the next models from an Eloquent query by increasing `id`. Each invocation processes a limited batch, and repeated invocations eventually cover the complete candidate set.

This is a good fit for recurring health checks where timely coverage matters but every model does not need to be rechecked during the same run.

:::note
Cursor-based checks provide rotating coverage, not queue-style exactly-once delivery. Use queued jobs or a dedicated workflow when every selected model must be acknowledged individually before progress advances.
:::

## How persistent cursors work

Each cursor stores a key and the last selected model ID in `data_health_cursors`. On every call, Data Health:

1. creates the cursor at ID `0` when it does not exist;
2. finds the greatest `id` currently matching the candidate query;
3. selects up to the requested limit where `id` is greater than the stored value;
4. stores the last selected ID; and
5. returns the selected Eloquent models in ID order.

When the selected batch reaches the greatest matching ID, Data Health resets the stored cursor to `0` while returning that final batch. The next call begins a new scan from the start.

If no matching IDs exist after the stored position, the cursor resets to `0` and returns an empty collection. A later call then starts at the beginning.

The cursor tracks selection progress, not finding records. A model may be checked without producing a finding, and a model may produce more than one finding when context distinguishes several occurrences.

## Select the next models

Use the `CheckCursor` facade inside a detectable finding:

```php
use App\Models\Customer;
use DataHealth\Contracts\CanDetect;
use DataHealth\Facades\CheckCursor;
use DataHealth\Finding;

class CustomerProfileIncomplete extends Finding implements CanDetect
{
    public static function detect(): int
    {
        $customers = CheckCursor::next(
            Customer::query()->where('active', true),
            self::class,
            500,
        );

        $detected = 0;

        foreach ($customers as $customer) {
            if (filled($customer->country_code)) {
                continue;
            }

            self::found($customer);
            $detected++;
        }

        return $detected;
    }
}
```

Each call checks at most 500 active customers. Repeated scheduled calls continue after the previously selected ID until the scan wraps.

The query must target an Eloquent model with a numeric `id` column because cursor progression uses `max('id')`, `where('id', '>', ...)`, and ascending ID order.

## Choose a cursor key

The second argument identifies independent progress through the candidate query. A finding class is the natural key:

```php
CheckCursor::next(Customer::query(), self::class, 500);
```

Different finding classes then advance independently even when they scan the same model table.

Use one stable key for one logical scan. Changing the class name used as the key creates a fresh cursor and restarts progress, so consider that operational effect when renaming a cursor-driven finding.

Do not reuse the same cursor key for different queries: the stored ID from one candidate set may skip or delay records in the other.

## Choose a batch size

The right limit depends on the cost of checking one model and how often detection runs.

For local comparisons, hundreds or thousands of models may be reasonable. For third-party requests, a batch may need to be tens of models or fewer. Start conservatively and measure:

- database query duration;
- memory use;
- third-party latency;
- API request quotas;
- scheduler or worker timeouts; and
- how long a complete scan takes.

Approximate a full scan duration with:

```text
number of candidates ÷ batch size × interval between runs
```

For example, 12,000 candidates checked in batches of 100 every five minutes require roughly ten hours for one complete pass.

Return the number of findings detected, not the number of models scanned, when the result is displayed as a finding count. Record the scanned count separately in logs or telemetry when it is operationally useful.

## Filter the candidate query

Apply stable filters before passing the query to `CheckCursor`:

```php
$query = Customer::query()
    ->where('active', true)
    ->whereNotNull('provider_id');
```

This prevents spending batch capacity on models that can never match the rule. Eager-load relationships needed by the check:

```php
$query->with(['account', 'subscriptions']);
```

Remember that the candidate set can change during a scan:

- a new model with a higher ID can be selected later in the current pass;
- an existing lower-ID model that begins matching may wait until the cursor wraps;
- a model that stops matching disappears from later batches; and
- deleted models create harmless gaps in the ID sequence.

Keep the query consistent between runs. Materially changing its filters while reusing the same cursor key makes the meaning of the stored position harder to reason about.

## Check records against a third-party API

Cursor batching is especially useful when local models must be compared with a remote system and checking every model at once would exceed a request quota.

The following finding checks a small batch of local subscriptions against a billing API:

```php
<?php

declare(strict_types=1);

namespace App\DataHealth;

use App\Models\Subscription;
use DataHealth\Attributes\Description;
use DataHealth\Attributes\Key;
use DataHealth\Contracts\CanDetect;
use DataHealth\Facades\CheckCursor;
use DataHealth\Finding;
use Illuminate\Support\Facades\Http;

#[Key('external-subscription-status-mismatch')]
#[Description('The local subscription status differs from the billing provider.')]
class ExternalSubscriptionStatusMismatch extends Finding implements CanDetect
{
    public static function detect(): int
    {
        $subscriptions = CheckCursor::next(
            Subscription::query()->whereNotNull('provider_id'),
            self::class,
            25,
        );

        $detected = 0;

        foreach ($subscriptions as $subscription) {
            $response = Http::baseUrl(config('services.billing.url'))
                ->withToken(config('services.billing.token'))
                ->timeout(10)
                ->get("/subscriptions/{$subscription->provider_id}");

            if ($response->failed()) {
                report(new \RuntimeException(
                    "Could not check subscription {$subscription->getKey()}",
                ));

                continue;
            }

            if ($response->json('status') === $subscription->status) {
                continue;
            }

            self::found($subscription, [
                'provider_id' => $subscription->provider_id,
            ]);

            $detected++;
        }

        return $detected;
    }

    /** @return array<string, mixed> */
    public function buildContext(): array
    {
        return $this->context;
    }
}
```

The cursor limits each run to 25 remote checks. The context stores only the stable provider ID, not the full response, credentials, or changing status value.

For APIs that support bulk lookups, prefer one request for all provider IDs in the selected batch. This reduces request overhead and often uses rate limits more efficiently.

:::caution
Treat a failed or incomplete API response as an unknown check, not proof of a data problem. Report the operational failure separately and avoid creating or resolving findings from missing remote data.
:::

## Complete and restart a scan

Suppose matching model IDs are `1` through `5` and the limit is `2`. Each run selects the next IDs, and the run that reaches ID `5` resets the stored position to `0`:

```text
IDs:  1  2  3  4  5

1st  [1  2]           stored position 2
2nd        [3  4]     stored position 4
3rd              [5]  stored position 0
4th  [1  2]           stored position 2
```

The position changes when the batch is selected, before those models are checked. If processing fails midway, the next run continues after the stored position rather than repeating the batch. See [Handle failures and retries](#handle-failures-and-retries).

The final non-empty batch resets the cursor immediately because it contains the greatest matching ID. There is no required empty invocation between complete passes.

This wraparound behavior continuously rechecks the candidate population, making the cursor suitable for recurring health monitoring rather than one-time migrations.

## Handle failures and retries

The cursor advances when a batch is selected, before your detector finishes processing it. If detection throws halfway through a batch, a retry normally receives the next batch rather than replaying every selected model.

Choose a failure strategy based on the check:

- catch and report failures per model when skipping until the next full pass is acceptable;
- use a smaller batch to reduce the number of delayed checks;
- dispatch one queued job per selected model when each check needs independent retries; or
- build an acknowledged work queue when no selected model may advance before success.

Do not resolve existing findings merely because a third-party request failed. Verification should return a definitive result only when the external state was retrieved successfully.

Because scans repeat, a temporarily failed model is checked again after the cursor completes the remaining candidates and wraps to the start.

## Prevent concurrent scans

Two callers using the same cursor key at the same time can select overlapping batches or race while updating the stored position. Run one instance of a logical scan at a time.

Data Health scheduled detections use Laravel's overlap protection and one-server scheduling. Asynchronous scheduled detections also use a unique job per finding class. These protections cover the normal scheduled workflow when every server shares the required cache store.

If the same detector can also be launched manually or from custom jobs, coordinate those entry points with a shared lock or avoid running them concurrently.

## Schedule batched checks

Add `Scheduled` to advance the cursor at a predictable interval:

```php
use DataHealth\Attributes\Scheduled;

#[Scheduled('*/5 * * * *')]
class ExternalSubscriptionStatusMismatch extends Finding implements CanDetect
{
    // ...
}
```

Each scheduler occurrence checks the next batch. Combine the batch size and cron interval to stay within the third-party provider's quota while completing a full pass often enough for the business requirement.

Use `Async` when remote latency should not occupy the scheduler process:

```php
use DataHealth\Attributes\Async;

#[Async(queue: 'data-health', connection: 'redis')]
#[Scheduled('*/5 * * * *')]
class ExternalSubscriptionStatusMismatch extends Finding implements CanDetect
{
    // ...
}
```

See [Scheduling and Queues](/guides/scheduling-and-queues/) for worker setup, uniqueness, overlap locks, and multi-server cache requirements.

## Monitor scan progress

The `data_health_cursors` table exposes the last selected ID for each key. It can show whether a scan is advancing, but an ID alone is not a reliable percentage because IDs may contain gaps and the candidate query can change.

Useful operational measurements include:

- models selected per run;
- findings detected per run;
- remote requests, failures, and rate-limit responses;
- duration per batch;
- time since the cursor last changed; and
- approximate time between complete passes.

Emit these measurements through your application's existing logging or telemetry system. Alert on stalled or repeatedly failing checks rather than on a particular cursor ID.

Continue with [Scheduling and Queues](/guides/scheduling-and-queues/) to automate the scan, or [Context](/guides/context/) to design stable identities for problems found in external data.
