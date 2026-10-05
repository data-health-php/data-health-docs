---
title: Metadata and Worklists
description: Give findings stable identities, operator-facing descriptions, priorities, and work queues.
---

Finding metadata makes technical data rules understandable and actionable for the people who investigate them.

## Contents

- [Why metadata matters](#why-metadata-matters)
- [Define a stable key](#define-a-stable-key)
- [Describe a finding](#describe-a-finding)
- [Describe finding actions](#describe-finding-actions)
- [Assign an urgency](#assign-an-urgency)
- [Choose an urgency level](#choose-an-urgency-level)
- [Assign a worklist](#assign-a-worklist)
- [Stored and runtime metadata](#stored-and-runtime-metadata)
- [Read metadata in application code](#read-metadata-in-application-code)
- [Design stable metadata](#design-stable-metadata)

## Why metadata matters

A class name can tell a developer what code runs, but it rarely gives an operator everything needed to triage a finding. Metadata answers operational questions:

- What is wrong?
- How urgent is it?
- Which team or workflow owns it?
- What will verification check?
- What will resolution change?
- Will the finding keep the same identity after a refactor?

Data Health expresses this metadata with PHP attributes on finding classes and their action methods. The core package makes it available to application code, while Data Health Filament uses it in tables, filters, catalogues, tooltips, and action dialogs.

## Define a stable key

Without a `Key` attribute, a finding uses its class basename:

```php
PaidOrderMarkedPending::key();
// 'PaidOrderMarkedPending'
```

Give production findings an explicit key when records must survive class renames or namespace changes:

```php
use DataHealth\Attributes\Key;
use DataHealth\Finding;

#[Key('paid-order-marked-pending')]
class PaidOrderMarkedPending extends Finding
{
    // ...
}
```

The key is stored on every finding record and participates in its unique identity. Data Health also uses it to locate the finding class when verifying or resolving a stored record.

Choose a concise domain-oriented value rather than a team name, ticket number, or implementation detail. Once records exist, changing the key creates a new finding identity and prevents old records from resolving to the renamed key automatically.

## Describe a finding

Use `Description` on the class to explain the unhealthy condition:

```php
use DataHealth\Attributes\Description;

#[Description('A paid order is still marked as pending.')]
class PaidOrderMarkedPending extends Finding
{
    // ...
}
```

A good finding description:

- states the problem rather than the implementation;
- uses language familiar to the operator;
- is specific enough to distinguish similar findings; and
- does not include values that belong in model data or context.

Descriptions are optional. A finding without one returns `null`, and interfaces may show a fallback or no description.

## Describe finding actions

`Description` can also annotate `detect()`, `verify()`, and `resolve()`:

```php
#[Description('Searches for paid orders that still have the pending status.')]
public static function detect(): int
{
    // ...
}

#[Description('Checks whether the order is no longer both paid and pending.')]
public function verify(): bool
{
    // ...
}

#[Description('Changes the order status from pending to paid.')]
public function resolve(): bool
{
    // ...
}
```

Action descriptions should explain what will be read or changed. Be explicit when an action contacts a third-party service, modifies several records, or has a destructive effect.

Data Health Filament uses verification and resolution descriptions in action tooltips and confirmation interfaces, making these strings part of the operator experience.

## Assign an urgency

Use `Urgency` with a `FindingUrgency` enum value:

```php
use DataHealth\Attributes\Urgency;
use DataHealth\Enums\FindingUrgency;

#[Urgency(FindingUrgency::SOON)]
class PaidOrderMarkedPending extends Finding
{
    // ...
}
```

When a finding record is first created, Data Health copies the class urgency onto the record. Findings without the attribute use `FindingUrgency::NORMAL`.

Urgency should express how quickly the problem needs attention, not how technically interesting or difficult it is to fix.

## Choose an urgency level

Data Health provides four values:

| Urgency | Suggested use |
| --- | --- |
| `IMMEDIATE` | Active harm, severe operational impact, or a problem requiring intervention now. |
| `SOON` | Important inconsistency that should enter the near-term work queue. |
| `NORMAL` | Ordinary data-quality work with no exceptional time pressure. |
| `DEFERRED` | Low-impact cleanup that can wait behind normal work. |

These meanings are conventions for your application; the core package does not enforce response times or escalation policies.

Use the levels consistently across finding classes. If every problem is immediate, urgency no longer helps operators prioritize.

## Assign a worklist

A worklist groups findings into an operational queue:

```php
use DataHealth\Attributes\Worklist;

#[Worklist('order-operations')]
class PaidOrderMarkedPending extends Finding
{
    // ...
}
```

New records for this finding store `order-operations` in their `worklist` column. Findings without the attribute store `null`.

Worklist values are free-form strings. Useful strategies include grouping by:

- owning team, such as `customer-support`;
- business workflow, such as `order-operations`;
- domain, such as `billing`; or
- remediation process, such as `manual-review`.

Prefer stable, machine-friendly values with consistent casing. Display labels can be translated or formatted separately.

Data Health Filament displays worklists as badges and provides a worklist filter.

## Stored and runtime metadata

Metadata is resolved in two different ways:

| Metadata | Where it is read | When it changes |
| --- | --- | --- |
| Key | Stored on the finding record | Fixed for the record identity. |
| Urgency | Copied to the finding record | Captured when the record is first created. |
| Worklist | Copied to the finding record | Captured when the record is first created. |
| Finding description | Read from the current finding class | Changes when deployed code changes. |
| Method descriptions | Read from the current finding methods | Changes when deployed code changes. |

Re-detecting an existing record refreshes its detection timestamp but does not recopy urgency or worklist. Changing those attributes therefore affects new records, not existing ones.

If an operational reclassification should apply retroactively, update existing records deliberately through an application migration or maintenance command.

## Read metadata in application code

Finding classes expose their metadata through static methods:

```php
PaidOrderMarkedPending::key();
PaidOrderMarkedPending::getDescription();
PaidOrderMarkedPending::getMethodDescription('verify');
PaidOrderMarkedPending::getUrgency();
PaidOrderMarkedPending::getWorklist();
```

Descriptions, urgency, and worklist may return `null` when their attributes are absent. The persisted `FindingRecord` always has a key and urgency, while worklist remains nullable:

```php
$record->key;
$record->urgency;
$record->worklist;
```

Use the record values for historical triage and filtering. Use class and method descriptions when presenting the behavior of the currently deployed finding implementation.

## Design stable metadata

A complete finding can combine the attributes:

```php
use DataHealth\Attributes\Description;
use DataHealth\Attributes\Key;
use DataHealth\Attributes\Urgency;
use DataHealth\Attributes\Worklist;
use DataHealth\Enums\FindingUrgency;
use DataHealth\Finding;

#[Key('paid-order-marked-pending')]
#[Description('A paid order is still marked as pending.')]
#[Urgency(FindingUrgency::SOON)]
#[Worklist('order-operations')]
class PaidOrderMarkedPending extends Finding
{
    // ...
}
```

Before deploying metadata, consider:

1. whether the key can remain valid through likely refactors;
2. whether the description explains the business problem without code knowledge;
3. whether urgency matches comparable findings;
4. whether the worklist has a clear owner; and
5. whether action descriptions set accurate expectations about side effects.

Treat keys and worklists as stable identifiers. Treat descriptions as user-facing copy. Treat urgency as an operational policy decision that should be reviewed when the impact of a finding changes.

Continue with [Model Cleanup](/data-health-docs/guides/model-cleanup/) to manage records when affected models are deleted, or [Managing Findings](/data-health-docs/filament/managing-findings/) to see how metadata appears in Filament.
