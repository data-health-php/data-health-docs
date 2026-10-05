---
title: Database Schema
description: Understand the tables maintained by Data Health.
---

Data Health stores detected problems in `data_health_findings` and progress for bounded scans in `data_health_cursors`.

## Contents

- [Publish and run migrations](#publish-and-run-migrations)
- [Findings table](#findings-table)
- [Finding identity](#finding-identity)
- [Statuses](#statuses)
- [Polymorphic relationships](#polymorphic-relationships)
- [Context and context hashes](#context-and-context-hashes)
- [Operational metadata](#operational-metadata)
- [Cursor table](#cursor-table)
- [Eloquent models](#eloquent-models)
- [Customize the schema](#customize-the-schema)

## Publish and run migrations

Publish only the migrations with:

```bash
php artisan vendor:publish --tag=data-health-migrations
php artisan migrate
```

The package-wide `data-health` publish tag also includes the migrations. Once published, the migration files belong to the application and package upgrades do not replace them.

## Findings table

`data_health_findings` contains one row for each distinct finding identity:

| Column | Schema | Purpose |
| --- | --- | --- |
| `id` | Unsigned big integer, primary key | Finding record identifier. |
| `status` | String | Backed value of `RecordStatus`. |
| `key` | String | Stable identifier of the finding type. |
| `model_type` | String | Morph class of the affected Eloquent model. |
| `model_id` | Unsigned big integer | Primary key of the affected model. |
| `context` | JSON | Structured details returned by `buildContext()`. |
| `context_hash` | Character, 64 | SHA-256 hash used as part of finding identity. |
| `assignee_type` | Nullable string | Morph class of the assigned model. |
| `assignee_id` | Nullable unsigned big integer | Primary key of the assigned model. |
| `worklist` | Nullable string | Operational grouping copied from `Worklist`. |
| `urgency` | String | Backed value of `FindingUrgency`. |
| `last_detected_at` | Timestamp | Most recent time the identity was reported. |
| `created_at` | Nullable timestamp | Time the identity was first stored. |
| `updated_at` | Nullable timestamp | Time the row was last changed. |

Laravel's `morphs()` and `nullableMorphs()` helpers also add indexes for the model and assignee column pairs.

## Finding identity

A finding's identity is the combination of:

```text
key + model_type + model_id + context_hash
```

The database enforces this through the `data_health_findings_identity_unique` unique index. Reporting the same identity again refreshes `last_detected_at` instead of inserting another row. If that row was resolved, reporting it again returns it to `active`; an ignored row remains ignored.

Changing the key, affected model, model morph type, model ID, or context creates a different identity. Worklist, urgency, assignee, and status do not participate in identity.

## Statuses

The `status` column contains a value from `DataHealth\Enums\RecordStatus`:

| Enum case | Stored value | Meaning |
| --- | --- | --- |
| `Active` | `active` | The problem currently requires attention. |
| `Ignored` | `ignored` | An operator chose not to act on it. |
| `Resolved` | `resolved` | The problem was verified, fixed, or manually completed. |

Successful verification and resolution change a record to `resolved`. Detecting a resolved identity again reactivates it, while detecting an ignored identity does not change its status.

## Polymorphic relationships

`model_type` and `model_id` form the required `model()` morph-to relationship to the affected record. Data Health stores `$model->getMorphClass()`, so Laravel morph maps are respected.

`assignee_type` and `assignee_id` form the optional `assignee()` morph-to relationship. The core package stores the columns but does not decide which models can be assigned; the Filament integration exposes assignment after `assignee_types` is configured.

The migrations do not add foreign keys for either polymorphic relationship. Deleting an affected model therefore does not cause database-level cascading. Use [Model Cleanup](/data-health-docs/guides/model-cleanup/) when application-level cleanup is wanted.

Changing a morph map after records have been stored may make existing relationships impossible to resolve. Migrate stored morph types when introducing or renaming aliases.

## Context and context hashes

The `context` JSON contains the array returned by the finding's `buildContext()` method. The `context_hash` is a 64-character SHA-256 digest of a canonical JSON representation:

- associative array keys are recursively sorted before hashing;
- list order is preserved; and
- the stored context remains available when reconstructing the finding.

Consequently, `['currency' => 'EUR', 'amount' => 10]` has the same identity as the same associative values in the opposite key order, while differently ordered lists represent different identities.

Keep context JSON-serializable, deterministic, and limited to values needed to distinguish or explain the problem. See [Context](/data-health-docs/guides/context/) for design guidance.

## Operational metadata

`worklist` and `urgency` are copied from finding attributes when the row is first created. The default urgency is `normal`, and the default worklist is `null`. Rediscovering an existing row does not overwrite either column, allowing operators and application code to retain record-level changes.

`last_detected_at` is refreshed whenever the same identity is reported. Use it to distinguish recently confirmed problems from records that have not appeared in a recent detection run; Data Health does not automatically resolve records merely because they were not detected.

Descriptions and action labels are not stored in the table. They are read from the current finding class at runtime.

## Cursor table

`data_health_cursors` stores progress used by `CheckCursor`:

| Column | Schema | Purpose |
| --- | --- | --- |
| `id` | Unsigned big integer, primary key | Cursor row identifier. |
| `key` | Unique string | Independent scan identity, normally the finding class. |
| `last_id` | Nullable unsigned big integer | Last numeric model ID returned by the previous batch. |
| `created_at` | Nullable timestamp | Time the cursor was created. |
| `updated_at` | Nullable timestamp | Time its position last changed. |

`CheckCursor::next()` selects IDs greater than `last_id`, in ascending order, up to the requested limit. When it returns the final batch, it resets `last_id` to `0`; if no later IDs exist, it returns an empty collection and also resets to `0`. The next call starts a new pass.

The cursor expects the queried model to use a numeric `id` column. One unique row is stored for each cursor key, so use different keys for scans that need independent progress.

## Eloquent models

`DataHealth\Models\FindingRecord` maps to `data_health_findings` and provides:

| Member | Type or result |
| --- | --- |
| `status` cast | `RecordStatus` |
| `context` cast | `array` |
| `urgency` cast | `FindingUrgency` |
| `last_detected_at` cast | `datetime` |
| `model()` | Required `MorphTo` relationship to the affected model. |
| `assignee()` | Optional `MorphTo` relationship to the assigned model. |
| `getFinding()` | Reconstructs the finding instance from this record. |

`DataHealth\Models\DataHealthCursor` maps to `data_health_cursors` and exposes the persisted `key` and `last_id`.

## Customize the schema

Edit published migrations before running them when an application needs database-specific column types or indexes. After the migrations have run in a shared environment, make later changes in a new application migration instead of editing history.

Retain the table names, required columns, identity constraint, and compatible types unless application code replaces all corresponding package assumptions. In particular:

- model and assignee IDs must support the application's Eloquent keys;
- `context` must preserve valid JSON;
- `context_hash` must hold a 64-character digest;
- `key` in `data_health_cursors` must remain unique; and
- cursor scans require a compatible numeric model `id`.

If affected models use UUID or string primary keys, the default model morph columns and cursor implementation are not compatible without application-level customization.
