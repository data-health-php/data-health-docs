---
title: Scheduling and Queues
description: Run finding detection automatically with Laravel's scheduler and queue system.
---

Use the `Scheduled` and `Async` attributes to run detection periodically, prevent overlapping work, and move expensive checks onto a queue.

## Contents

- [Execution paths](#execution-paths)
- [Requirements](#requirements)
- [Schedule detection](#schedule-detection)
- [Write cron expressions](#write-cron-expressions)
- [Enable or disable scheduled detection](#enable-or-disable-scheduled-detection)
- [Prevent overlapping work](#prevent-overlapping-work)
- [Run on multiple application servers](#run-on-multiple-application-servers)
- [Dispatch detection to a queue](#dispatch-detection-to-a-queue)
- [Choose a queue and connection](#choose-a-queue-and-connection)
- [Unique detection jobs](#unique-detection-jobs)
- [Configure a shared cache](#configure-a-shared-cache)
- [Operate the scheduler and workers](#operate-the-scheduler-and-workers)
- [Troubleshoot scheduled detection](#troubleshoot-scheduled-detection)

## Execution paths

Detection reaches `detect()` through one of three paths:

```text
Direct
application code ──────────────────────────► detect()

Scheduled
scheduler ──► overlap lock ──► detect()

Scheduled + Async
scheduler ──► overlap lock ──► unique job ──► worker ──► detect()
```

A direct call runs in the current process. Both scheduled paths are registered with Laravel's scheduler and run on one server per occurrence when every scheduler host shares a lock-capable cache. The overlap lock belongs to that scheduler occurrence: without `Async`, the occurrence calls `detect()` directly; with `Async`, it dispatches one job and returns. A unique job prevents another job for the same finding from being dispatched while the first is queued or running, and the queue worker is what calls `detect()`.

## Requirements

A scheduled finding must be discoverable, implement `CanDetect`, define a static `detect()` method, and have a valid `Scheduled` cron expression.

```php
use DataHealth\Contracts\CanDetect;
use DataHealth\Finding;

class PaidOrderMarkedPending extends Finding implements CanDetect
{
    public static function detect(): int
    {
        // Detect and record findings.

        return 0;
    }
}
```

Scheduled execution runs `detect()` itself. Return an integer or `null`; a callable returned by `detect()` is not invoked as additional scheduled work.

See [Detecting Problems](/data-health-docs/guides/detecting-problems/) for query, result, and idempotency guidance before automating a finding.

## Schedule detection

Add `Scheduled` to the finding with a five-field cron expression:

```php
use DataHealth\Attributes\Scheduled;

#[Scheduled('*/5 * * * *')]
class PaidOrderMarkedPending extends Finding implements CanDetect
{
    public static function detect(): int
    {
        // ...
    }
}
```

This finding becomes due every five minutes. Data Health registers it with Laravel's scheduler when the application boots in the console, so you do not need to register each finding in `routes/console.php` or an application service provider.

## Write cron expressions

The expression passed to `Scheduled` uses standard cron fields:

```text
┌──────── minute (0–59)
│ ┌────── hour (0–23)
│ │ ┌──── day of month (1–31)
│ │ │ ┌── month (1–12)
│ │ │ │ ┌ day of week (0–7)
│ │ │ │ │
* * * * *
```

| Expression | Runs |
| --- | --- |
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every five minutes |
| `0 * * * *` | At the start of every hour |
| `0 2 * * *` | Daily at 02:00 |
| `0 3 * * 1` | Mondays at 03:00 |

Data Health validates expressions while registering the schedule. An invalid expression throws an exception rather than silently creating a schedule that never runs.

Use Laravel's configured application timezone when reasoning about due times, and inspect registered events with:

```bash
php artisan schedule:list
```

## Enable or disable scheduled detection

Scheduled detection is enabled by default. Disable all Data Health schedule registration with:

```dotenv
DATA_HEALTH_SCHEDULER_ENABLED=false
```

The corresponding configuration value is `data-health.scheduler.enabled`. Disabling it does not prevent direct calls to `detect()`, manual Filament detection, or custom jobs; it only prevents Data Health from registering scheduled events.

When Laravel configuration is cached, rebuild the cache after changing the environment value.

## Prevent overlapping work

Every Data Health scheduled event uses Laravel's overlap protection. If one occurrence still holds its scheduler lock when the next becomes due, the new occurrence does not start.

This protects slow database scans and third-party checks whose runtime may exceed their interval. The lock is scoped to the finding class, so different findings may still run concurrently.

Detection should remain repeatable despite locking: processes can fail after partial work, locks eventually expire, and the same detector may also be triggered manually.

## Run on multiple application servers

Data Health configures each scheduled finding to run on one scheduler server per cron occurrence. Every application server may execute Laravel's scheduler, but only the server that obtains the shared event lock runs the finding.

This works only when scheduler servers use the same compatible cache store. Local file or array caches cannot coordinate independent hosts.

## Dispatch detection to a queue

Without `Async`, `detect()` runs inside the scheduler process. Add `Async` to dispatch a queued detection job instead:

```php
use DataHealth\Attributes\Async;
use DataHealth\Attributes\Scheduled;

#[Async]
#[Scheduled('*/5 * * * *')]
class PaidOrderMarkedPending extends Finding implements CanDetect
{
    public static function detect(): int
    {
        // ...
    }
}
```

Use asynchronous detection when a check is slow, performs network requests, needs queue retries, or should not occupy the scheduler process.

:::note
If the selected queue connection is `sync`, the job still runs immediately. Configure a non-synchronous connection for actual background execution.
:::

## Choose a queue and connection

Both `Async` arguments are optional. With no arguments, Laravel uses the application's defaults:

```php
#[Async]
```

Choose a queue while keeping the default connection:

```php
#[Async(queue: 'data-health')]
```

Or choose both explicitly:

```php
#[Async(queue: 'data-health', connection: 'redis')]
```

Run a worker that consumes the selected destination:

```bash
php artisan queue:work redis --queue=data-health
```

Long-running checks should use controlled batches rather than relying on a very large worker timeout; see [Large Datasets](/data-health-docs/guides/large-datasets/).

## Unique detection jobs

Queued Data Health detection jobs are unique by finding class. While one job for a finding is queued or running, another job for that same finding cannot be dispatched successfully.

This prevents a frequent schedule from building a backlog of identical full scans. Different finding classes have different unique IDs and may be queued independently.

Job uniqueness relies on a cache lock. It prevents duplicate queued jobs but does not make detection transactional or exactly-once: a failed job may already have recorded some findings, so detection must remain safe to retry.

## Configure a shared cache

Laravel uses cache locks for overlap prevention, one-server scheduling, and unique queued jobs. Multi-server deployments must use a shared cache store that supports atomic locks, such as:

- `database`;
- `memcached`;
- `dynamodb`; or
- `redis`.

Scheduler processes, manual dispatchers, and queue workers that must coordinate need the same central cache configuration. If each server uses an isolated cache, every server may believe it owns the lock.

## Operate the scheduler and workers

Data Health registers events with Laravel, but the application must still run Laravel's scheduler.

In production, configure the usual system cron entry:

```text
* * * * * cd /path-to-your-project && php artisan schedule:run >> /dev/null 2>&1
```

For local development, run:

```bash
php artisan schedule:work
```

When findings use `Async`, operate the corresponding queue workers as separately supervised processes. Deployments should restart long-running scheduler and worker processes so they load new finding classes and application code.

Useful operational signals include detection duration, findings reported, job failures, lock contention, queue latency, and the time of the last successful run.

## Troubleshoot scheduled detection

If a finding does not run, check these items in order:

1. **Discovery:** Confirm its path and namespace follow [Finding Discovery](/data-health-docs/core-concepts/finding-discovery/).
2. **Capability:** Confirm the class implements `CanDetect`.
3. **Attribute:** Confirm `Scheduled` contains a valid cron expression.
4. **Configuration:** Confirm `data-health.scheduler.enabled` is `true` in the running process.
5. **Registration:** Run `php artisan schedule:list` and look for the finding.
6. **System scheduler:** Confirm cron or `schedule:work` is actually running.
7. **Due time:** Confirm the expression and application timezone match your expectation.
8. **Locks:** Check whether a previous occurrence still owns an overlap lock; clear stale scheduler locks with Laravel's scheduler cache-clear command when appropriate.
9. **Queue connection:** For `Async`, confirm the selected connection is not `sync` when background work is expected.
10. **Queue worker:** Confirm a worker consumes the selected connection and queue, and inspect failed jobs.
11. **Shared cache:** Confirm every server uses the same lock-capable store.
12. **Deployment:** Restart long-running scheduler and worker processes after changing findings.

Continue with [Metadata and Worklists](/data-health-docs/guides/metadata-and-worklists/) to make automated findings easier to triage, or [Finding Types and Detection](/data-health-docs/filament/finding-types-and-detection/) to run detection manually.
