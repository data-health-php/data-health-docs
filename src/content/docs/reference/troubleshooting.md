---
title: Troubleshooting
description: Diagnose common Data Health integration problems.
---

Work from the symptom below, then confirm that cached configuration and long-running processes contain the same code and settings as the web process.

## Contents

- [A finding is not discovered](#a-finding-is-not-discovered)
- [A finding key cannot be resolved](#a-finding-key-cannot-be-resolved)
- [Duplicate findings appear](#duplicate-findings-appear)
- [Context creates unexpected identities](#context-creates-unexpected-identities)
- [Scheduled detection does not run](#scheduled-detection-does-not-run)
- [A scheduled detection overlaps or remains locked](#a-scheduled-detection-overlaps-or-remains-locked)
- [Asynchronous detection runs synchronously](#asynchronous-detection-runs-synchronously)
- [A queued detection is not processed](#a-queued-detection-is-not-processed)
- [Verification or resolution is unavailable](#verification-or-resolution-is-unavailable)
- [Verification or resolution fails](#verification-or-resolution-fails)
- [Deleted models keep their findings](#deleted-models-keep-their-findings)
- [Restored models have no findings](#restored-models-have-no-findings)
- [A cursor appears stuck or skips records](#a-cursor-appears-stuck-or-skips-records)
- [Filament actions are missing](#filament-actions-are-missing)
- [Affected-model links are missing](#affected-model-links-are-missing)
- [Assignment is missing or incomplete](#assignment-is-missing-or-incomplete)
- [Configuration changes have no effect](#configuration-changes-have-no-effect)

## A finding is not discovered

Check the discovery contract in this order:

1. The configured directory exists relative to the Laravel application's base path.
2. The configured root namespace maps the directory to the correct autoloadable prefix; a trailing backslash is optional.
3. The class namespace and filename mirror their path below that directory.
4. The class is concrete and extends `DataHealth\Finding`.
5. Composer can autoload the application namespace.
6. The process has been restarted after deployment when it is long-running.

For the default mapping, `app/DataHealth/PaidOrderMarkedPending.php` must declare `App\DataHealth\PaidOrderMarkedPending`.

If configuration is cached, inspect the active value rather than only the source file:

```bash
php artisan tinker
```

```php
config('data-health.directories');
```

See [Finding Discovery](/data-health-docs/core-concepts/finding-discovery/) for custom paths and namespaces.

## A finding key cannot be resolved

Data Health reconstructs a finding record by matching its stored `key` to a currently discovered class. Resolution fails when the class is no longer discovered, its basename changed, or its `Key` attribute changed.

Restore the old key temporarily or migrate existing rows to the new key:

```php
DB::table('data_health_findings')
    ->where('key', 'OldFindingKey')
    ->update(['key' => 'new-stable-key']);
```

Ensure the destination key belongs to exactly one discovered class before migrating. Prefer an explicit, permanent `Key` attribute for findings that may be renamed.

## Duplicate findings appear

The database considers `key`, `model_type`, `model_id`, and `context_hash` together. Rows that look similar in an interface may still have different context, keys, or morph types.

Compare those four columns first. Common causes include:

- context containing a timestamp, generated UUID, or other changing value;
- list values returned in a different order;
- a renamed finding without a stable `Key`;
- a changed Laravel morph map; or
- concurrent writes without the published unique identity index.

Confirm that `data_health_findings_identity_unique` exists. Do not remove the unique index: application-level `firstOrCreate()` alone cannot prevent every race between workers.

## Context creates unexpected identities

Associative keys are recursively sorted before hashing, so their insertion order does not matter. List order remains significant, and every value contributes to the hash.

Keep identity context deterministic. Sort lists when their order has no meaning, normalize dates and numeric values, and leave volatile display-only values out of context. Changing the structure of `buildContext()` affects future identity matching but does not rewrite stored hashes.

See [Context](/data-health-docs/guides/context/) for stable and unstable examples.

## Scheduled detection does not run

Run through the complete execution chain:

1. The finding is discovered.
2. It implements `DataHealth\Contracts\CanDetect`.
3. It has a valid `Scheduled` five-field cron expression.
4. `data-health.scheduler.enabled` is `true` in the running process.
5. `php artisan schedule:list` shows the event and the expected next run time.
6. Laravel's system cron or `php artisan schedule:work` is running.
7. The application timezone matches the intended schedule.
8. A previous execution is not holding the overlap lock.
9. For `Async`, an appropriate queue worker is running.

Data Health registers schedules only in console processes. Changing code or configuration does not update an already-running scheduler or worker; restart it after deployment.

## A scheduled detection overlaps or remains locked

Each scheduled finding uses Laravel's overlap prevention and one-server execution. A still-running or stale lock can prevent the next occurrence.

First confirm whether an earlier process is genuinely running. If it is not, clear Laravel's scheduler locks:

```bash
php artisan schedule:clear-cache
```

In a multi-server deployment, all scheduler hosts need the same lock-capable cache store. An `array`, local file, or otherwise isolated store cannot coordinate independent servers. Avoid clearing locks while a valid detection run is still active because doing so may allow overlapping work.

## Asynchronous detection runs synchronously

The `Async` attribute dispatches a job, but Laravel's `sync` queue connection executes dispatched jobs immediately. Select a background connection globally or on the attribute:

```php
#[Async(queue: 'data-health', connection: 'redis')]
```

Then run a worker for the selected destination. Also verify that the finding has both `Scheduled` and `Async`; `Async` affects scheduled detection and does not transform arbitrary direct calls to `detect()` into queued work.

## A queued detection is not processed

Confirm all of the following:

- a worker is running on the attribute's connection and queue;
- the queue name matches exactly;
- failed jobs have been inspected;
- the worker was restarted after code changes;
- the application can deserialize and autoload the finding class; and
- the cache store used for unique jobs is available.

For example:

```bash
php artisan queue:work redis --queue=data-health
php artisan queue:failed
```

Detection jobs are unique by finding class. A queued or running job for the same finding may intentionally prevent another from being dispatched. If jobs remain unique unexpectedly, inspect the shared cache and failed worker state rather than repeatedly dispatching duplicates.

## Verification or resolution is unavailable

Verification is available only when the finding implements `CanVerify`; resolution requires `CanResolve`. The method must have the corresponding public signature:

```php
public function verify(): bool|callable|string;
public function resolve(): bool|callable|string;
```

The stored key must also resolve to that finding class, and the affected model must still be loadable so Data Health can reconstruct the finding. Add `Description` to the method to provide a useful action label, but note that a description alone does not enable the capability.

## Verification or resolution fails

The final result must be a boolean. A callable is invoked through Laravel's container, and a returned class name must implement `Verifier` or `Resolver` respectively. Typical failures are:

- returning an unsupported string or value;
- naming a class that does not implement the required contract;
- an unresolvable dependency in the callable or handler constructor;
- relying on missing or stale context; or
- trying to use an affected model that has been deleted.

A `false` result is not an exception and leaves status unchanged. Exceptions propagate to the caller, and Data Health does not wrap the fix in a database transaction. Make fixes idempotent and add an application transaction when several writes must succeed together.

## Deleted models keep their findings

This is the default retention behavior. To remove finding records when their affected model is deleted, set:

```dotenv
DATA_HEALTH_AUTO_DELETE_ENABLED=true
```

Rebuild cached configuration and make sure the deletion happens through Eloquent model events. Bulk query deletes do not dispatch per-model `deleted` events, and direct database deletes bypass Eloquent completely.

## Restored models have no findings

With automatic cleanup enabled, deleting a soft-deletable model removes its finding records. Restoring that model does not recreate them. Run the relevant detector again after restoration if current problems should be represented.

If findings must survive soft deletion as audit records, leave automatic cleanup disabled or implement an application-specific lifecycle policy.

## A cursor appears stuck or skips records

`CheckCursor` scans ascending numeric `id` values and resets after reaching the maximum ID present in the supplied query. Check that:

- the query targets a model with a numeric `id` column;
- the limit is positive;
- repeated scans use the same key when they should share progress;
- unrelated scans use different keys;
- the query's filters remain stable throughout a pass; and
- the cursor row in `data_health_cursors` contains the expected `last_id`.

An empty collection at the end of a pass is valid and resets the cursor to `0`; the following call starts again. Changing query filters between batches can cause records to enter or leave the remaining ID range, so use a stable scope where complete coverage matters.

When each selected model must be checked against a third-party API, use a small cursor batch to limit the number of remote calls in each run. If the API itself is the paginated data source and there is no local Eloquent candidate query, persist the API's page or continuation token in application storage instead. See [Large Datasets](/data-health-docs/guides/large-datasets/) for the local-model pattern.

## Filament actions are missing

Use the action's corresponding capability as the first check:

| Missing capability | Requirement |
| --- | --- |
| Detect on a finding type | The class implements `CanDetect`. |
| Verify a record | The class implements `CanVerify`. |
| Resolve a record | The class implements `CanResolve`. |
| Assign a record | `data-health-filament.assignee_types` provides at least one valid type. |

Confirm that `DataHealthPlugin::make()` is registered on the current panel. For standalone components, confirm that the component is rendered inside a working Filament and Livewire installation.

The package does not provide application-specific authorization. If actions must be restricted, apply the panel, resource, middleware, and standalone-component authorization described in [Authorization](/data-health-docs/filament/authorization/).

## Affected-model links are missing

A model label remains unlinked when no usable destination can be produced. Check the resolution chain:

1. the affected model relationship can still be loaded;
2. a configured `model_view_routes` entry matches its class or stored morph type and names an existing route;
3. the custom URL resolver returns a non-empty URL; or
4. inside a panel, the model has a registered Filament resource with a permitted `view` page.

The panel-resource fallback is unavailable to standalone components outside a panel. Configure a named route or custom resolver for those contexts. See [Configuration and Model Links](/data-health-docs/filament/configuration-and-model-links/) for examples.

## Assignment is missing or incomplete

`assignee_types` must contain the class name of an invokable provider. The provider must return an array of Filament `MorphToSelect\Type` instances, each with a usable title attribute or label configuration.

If the assign action appears but expected records do not, inspect query restrictions defined on the type and the model's database connection. If an existing assignment displays poorly, confirm the stored `assignee_type` still matches the model's current morph class and that the assigned row still exists.

## Configuration changes have no effect

Clear or rebuild cached configuration and restart long-running processes:

```bash
php artisan config:clear
php artisan config:cache
php artisan queue:restart
```

Run only the cache command appropriate to the deployment workflow; `config:cache` replaces a cleared cache immediately. Also restart `schedule:work`, process supervisors, and persistent PHP application servers when they retain the old container.

Finally, verify that the setting was changed in the correct file: core behavior uses `config/data-health.php`, while Filament presentation uses `config/data-health-filament.php`.
