---
title: Findings and Records
description: Understand how finding definitions become persistent records tied to Eloquent models.
---

Data Health separates the definition of a data problem from each occurrence of that problem: a **finding** describes the rule, while a **finding record** tracks one affected model throughout its lifecycle.

## Contents

- [The domain model](#the-domain-model)
- [Finding classes](#finding-classes)
- [Finding records](#finding-records)
- [Affected Eloquent models](#affected-eloquent-models)
- [Finding identity and deduplication](#finding-identity-and-deduplication)
- [Context and context hashes](#context-and-context-hashes)
- [Record statuses](#record-statuses)
- [Reconstructing a finding](#reconstructing-a-finding)
- [The complete lifecycle](#the-complete-lifecycle)

## The domain model

A finding class represents a reusable type of inconsistency, such as a paid order that is still marked as pending. A finding record represents one occurrence of that inconsistency for one Eloquent model.

For example, a single `PaidOrderMarkedPending` class may produce records for orders 42, 87, and 103. Those records share the same finding key but have different model identities and can be reviewed or resolved independently.

The main concepts are:

| Concept | Responsibility |
| --- | --- |
| Finding class | Defines the problem and its optional detection, verification, and resolution behavior. |
| Finding record | Persists one occurrence, its status, metadata, context, and last detection time. |
| Affected model | Identifies the Eloquent record to which the problem belongs. |
| Context | Distinguishes multiple occurrences of the same finding for the same model. |
| Finding registry | Maps stable finding keys back to their PHP classes. |
| Data Health manager | Creates records, reconstructs findings, and performs verification or resolution. |

## Finding classes

Every finding extends `DataHealth\Finding` and is constructed with an affected Eloquent model and, optionally, an array of context:

```php
use DataHealth\Finding;

class PaidOrderMarkedPending extends Finding
{
    // Detection, verification, or resolution behavior can be added here.
}
```

The base class exposes the model and constructor context as readonly properties:

```php
$finding->model;
$finding->context;
```

A finding class may implement one or more capability contracts:

- `CanDetect` defines a static `detect()` method that searches for problems.
- `CanVerify` checks whether a recorded problem still applies.
- `CanResolve` attempts to correct the affected data.

These capabilities are independent. A finding can be record-only, detectable but not actionable, verifiable without being resolvable, or implement the complete workflow.

Attributes can add operational metadata and behavior without changing the constructor:

```php
use DataHealth\Attributes\Description;
use DataHealth\Attributes\Key;
use DataHealth\Attributes\Urgency;
use DataHealth\Attributes\Worklist;
use DataHealth\Enums\FindingUrgency;

#[Key('paid-order-marked-pending')]
#[Description('A paid order is still marked as pending.')]
#[Urgency(FindingUrgency::SOON)]
#[Worklist('orders')]
class PaidOrderMarkedPending extends Finding
{
    // ...
}
```

See [Metadata and Worklists](/guides/metadata-and-worklists/) for the complete attribute workflow.

## Finding records

Calling `found()` creates or refreshes a `DataHealth\Models\FindingRecord`:

```php
$record = PaidOrderMarkedPending::found($order);
```

The record is stored in `data_health_findings` and contains:

- its lifecycle status;
- the stable finding key;
- the affected model's polymorphic type and primary key;
- persisted context and its hash;
- an optional polymorphic assignee;
- an optional worklist;
- an urgency;
- the time at which it was last detected; and
- ordinary creation and update timestamps.

The model casts `status` and `urgency` to their package enums, `context` to an array, and `last_detected_at` to a date-time value:

```php
use DataHealth\Enums\RecordStatus;
use DataHealth\Models\FindingRecord;

$activeRecords = FindingRecord::query()
    ->where('status', RecordStatus::Active)
    ->orderByDesc('last_detected_at')
    ->get();
```

Urgency and worklist values are copied from the finding class when a record is first created. Changing those attributes later does not rewrite existing records automatically.

## Affected Eloquent models

Every finding occurrence belongs to an Eloquent model. Data Health stores this association with Laravel's polymorphic model columns, so findings can refer to different model classes in the same table.

Access the affected model through the record's `model` relationship:

```php
$order = $record->model;
```

The stored `model_type` comes from the model's morph class rather than assuming its fully qualified PHP class name. Applications using a Laravel morph map therefore retain their configured aliases.

Because the model is part of finding identity, the same finding type reported for two orders produces two independent records.

:::note
Findings are model-oriented: `Finding` requires an Eloquent model when it is constructed. For an application-wide problem, attach the finding to the most appropriate persistent model or introduce a model representing the monitored resource.
:::

Deleting an affected model can leave a polymorphic record without its model unless cleanup is enabled. See [Model Cleanup](/guides/model-cleanup/) for the global and opt-in cleanup strategies.

## Finding identity and deduplication

Data Health identifies a finding occurrence with four values:

```text
finding key + model type + model ID + context hash
```

The database enforces a unique constraint across those columns. Reporting the same identity repeatedly returns the existing record instead of inserting a duplicate.

By default, a finding key is the class basename:

```php
PaidOrderMarkedPending::key();
// 'PaidOrderMarkedPending'
```

Use the `Key` attribute when the identity must remain stable across class renames or namespace changes:

```php
use DataHealth\Attributes\Key;

#[Key('paid-order-marked-pending')]
class PaidOrderMarkedPending extends Finding
{
    // ...
}
```

The key is also how the registry reconstructs the correct PHP class from a stored record, so every discovered finding must have a unique key.

## Context and context hashes

Context describes the particular occurrence of a problem. It is useful when the same finding type can occur more than once for the same model.

For example, a customer may be missing several different required documents. The document type can distinguish each occurrence:

```php
class MissingRequiredDocument extends Finding
{
    /** @return array<string, mixed> */
    public function buildContext(): array
    {
        return $this->context;
    }
}
```

Report one occurrence for each missing document:

```php
MissingRequiredDocument::found($customer, [
    'document_type' => 'tax-certificate',
]);

MissingRequiredDocument::found($customer, [
    'document_type' => 'identity-document',
]);
```

These calls create separate records because their context hashes differ.

:::caution
The base `buildContext()` method returns an empty array. Override it when constructor context should be persisted and participate in finding identity.
:::

Before hashing context, Data Health sorts associative array keys recursively. The following values therefore represent the same identity:

```php
['source' => 'import', 'attempt' => 1]
['attempt' => 1, 'source' => 'import']
```

List order remains significant, and adding, removing, or changing a context value produces a different hash and therefore a different finding record.

Context should contain stable values that distinguish one occurrence from another. Avoid volatile values such as timestamps or calculated totals unless every changed value is intentionally meant to create a new occurrence.

## Record statuses

Finding records use the `DataHealth\Enums\RecordStatus` enum:

| Status | Meaning | Behavior when detected again |
| --- | --- | --- |
| `active` | The problem currently requires attention. | The existing record stays active and its detection time is refreshed. |
| `ignored` | The problem has deliberately been suppressed. | The record stays ignored and its detection time is refreshed. |
| `resolved` | The problem was corrected or no longer applies. | The existing record becomes active again. |

Verification and resolution mark a record as resolved only when the finding operation returns `true`. A `false` result leaves its current status unchanged.

The `last_detected_at` timestamp answers when the problem was most recently observed, while `created_at` records when this finding identity first appeared.

## Reconstructing a finding

Verification and resolution operate on finding objects rather than placing application-specific behavior in the database model. Data Health reconstructs the object from a record by:

1. resolving the record's key through the finding registry;
2. loading the affected model through its polymorphic relationship; and
3. passing the model and persisted context to the finding constructor.

You can request the reconstructed object directly:

```php
$finding = $record->getFinding();
```

The returned object is an instance of the registered finding class:

```php
$finding instanceof PaidOrderMarkedPending;
// true
```

This reconstruction is why stable keys, discoverable finding classes, accessible affected models, and sufficient persisted context matter throughout the record's lifetime.

## The complete lifecycle

When a problem is reported for the first time, Data Health creates an active record, stores the finding metadata and context, and sets `last_detected_at`. A finding marked with `AutoResolve` immediately attempts resolution after creation.

Subsequent events behave as follows:

1. Reporting an active record refreshes `last_detected_at`.
2. Reporting an ignored record refreshes `last_detected_at` without reactivating it.
3. Reporting a resolved record reactivates it and refreshes `last_detected_at`.
4. Successful verification marks the record as resolved.
5. Successful resolution changes the underlying data and marks the record as resolved.
6. Failed verification or resolution leaves the status unchanged.

This gives each finding occurrence a durable identity: it can appear, be investigated, be resolved, and recur without losing its relationship to the affected model.

Continue with [Finding Discovery](/core-concepts/finding-discovery/) to learn how keys are mapped to classes, or see [Detecting Problems](/guides/detecting-problems/) to build production detection workflows.
