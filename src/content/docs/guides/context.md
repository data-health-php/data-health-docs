---
title: Context
description: Distinguish multiple occurrences of a finding for the same model.
---

Use finding context to persist the details of a problem and give each distinct occurrence for a model its own identity.

## Contents

- [When a finding needs context](#when-a-finding-needs-context)
- [Constructor and persisted context](#constructor-and-persisted-context)
- [Build persisted context](#build-persisted-context)
- [Choose stable values](#choose-stable-values)
- [How context affects identity](#how-context-affects-identity)
- [Deterministic context hashing](#deterministic-context-hashing)
- [Reconstruct findings with context](#reconstruct-findings-with-context)
- [Context examples](#context-examples)
- [Avoid volatile or sensitive values](#avoid-volatile-or-sensitive-values)
- [Change context safely](#change-context-safely)

## When a finding needs context

Without context, one finding class can create one record per affected model. The finding key and model identity are enough for problems such as a paid order that is still pending:

```php
PaidOrderMarkedPending::found($order);
```

Add context when the same problem can occur more than once for the same model. For example, one customer can be missing several required document types:

```php
MissingRequiredDocument::found($customer, [
    'document_type' => 'tax-certificate',
]);

MissingRequiredDocument::found($customer, [
    'document_type' => 'identity-document',
]);
```

The two context values create separate finding records that can be reviewed and resolved independently.

Context can also retain a stable reference needed to explain or act on an occurrence, such as a conflicting record ID, an external object ID, or a rule code.

## Constructor and persisted context

The base `Finding` constructor accepts an Eloquent model and an optional context array:

```php
public function __construct(
    public readonly Model $model,
    public readonly array $context = [],
) {}
```

Arguments passed to `found()` are forwarded to that constructor:

```php
$record = MissingRequiredDocument::found($customer, [
    'document_type' => 'tax-certificate',
]);
```

Inside the finding, the constructor value is available through `$this->context`:

```php
$documentType = $this->context['document_type'];
```

Constructor context and persisted context are related but not identical. The constructor value is input to the finding object; the value returned from `buildContext()` is what Data Health stores and uses for identity.

:::caution
The base `buildContext()` implementation returns an empty array. Passing context to `found()` does not persist it unless the finding overrides `buildContext()`.
:::

## Build persisted context

For a finding that should persist its entire constructor context, return it directly:

```php
use DataHealth\Finding;

class MissingRequiredDocument extends Finding
{
    /** @return array<string, mixed> */
    public function buildContext(): array
    {
        return $this->context;
    }
}
```

The resulting `FindingRecord` contains the same array:

```php
$record = MissingRequiredDocument::found($customer, [
    'document_type' => 'tax-certificate',
]);

$record->context;
// ['document_type' => 'tax-certificate']
```

`buildContext()` may also derive a normalized representation from constructor input:

```php
/** @return array{document_type: string} */
public function buildContext(): array
{
    return [
        'document_type' => strtolower(
            (string) $this->context['document_type'],
        ),
    ];
}
```

Normalization is useful when differently formatted inputs should refer to the same occurrence.

## Choose stable values

Context participates in database identity, so every value should answer this question: “Does changing this value mean this is a different occurrence?”

Good context values are stable identifiers or categories:

- a document type such as `tax-certificate`;
- the ID of a conflicting model;
- an immutable external object ID;
- a validation rule code; or
- a relationship role such as `billing-contact`.

Values that merely describe the current state are usually poor identifiers:

- the current timestamp;
- an error message whose wording may change;
- the latest calculated total;
- a retry count; or
- the order of results returned by an API.

If a descriptive value changes on every detection, Data Health sees a new context hash and creates a new finding record instead of refreshing the existing one.

## How context affects identity

A finding record is uniquely identified by:

```text
finding key + model type + model ID + context hash
```

For the same customer and finding class, these calls create two records:

```php
MissingRequiredDocument::found($customer, [
    'document_type' => 'tax-certificate',
]);

MissingRequiredDocument::found($customer, [
    'document_type' => 'identity-document',
]);
```

Repeating either call refreshes its existing record because all four identity parts remain the same.

An empty context is also hashed. This gives context-free findings the same uniqueness guarantee: one occurrence per finding key and affected model.

## Deterministic context hashing

Data Health converts context to canonical JSON and stores its SHA-256 hash in `context_hash`.

Associative keys are sorted recursively before encoding, so key insertion order does not affect identity:

```php
[
    'source' => 'import',
    'reference' => 'customer-42',
]
```

is equivalent to:

```php
[
    'reference' => 'customer-42',
    'source' => 'import',
]
```

Lists keep their order because order may be meaningful:

```php
['primary', 'secondary']
```

does not have the same hash as:

```php
['secondary', 'primary']
```

Context must be JSON-encodable. Prefer scalars, nulls, and nested arrays over model instances, resources, closures, or arbitrary objects.

## Reconstruct findings with context

When Data Health verifies or resolves a record, it reconstructs the finding class with the affected model and the stored context:

```php
$finding = new MissingRequiredDocument(
    $record->model,
    $record->context,
);
```

That allows action methods to use the same stable details that identified the occurrence:

```php
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

Persist every value that verification or resolution needs unless it can be obtained reliably from the affected model or another stable source.

## Context examples

### Several missing requirements

Use a stable requirement code to create one occurrence per requirement:

```php
MissingRequirement::found($account, [
    'requirement' => 'verified-bank-account',
]);
```

### Conflicting models

Attach the finding to the model being reviewed and identify the other model by its key:

```php
DuplicateCustomer::found($customer, [
    'duplicate_customer_id' => $duplicate->getKey(),
]);
```

### External data

Use the remote object's stable identifier rather than its current response values:

```php
ExternalSubscriptionMismatch::found($subscription, [
    'remote_subscription_id' => $subscription->provider_id,
]);
```

In each example, the context distinguishes the occurrence without encoding a mutable snapshot of the entire problem.

## Avoid volatile or sensitive values

Context is stored as plain JSON in the Data Health database and may be displayed in operational interfaces. Do not place passwords, access tokens, credentials, or other secrets in it.

Minimize personally identifiable or regulated data as well. Prefer an internal or external record ID over copying names, email addresses, payment details, or complete third-party responses.

Context is identity, not an event log. If operators need changing diagnostic details, read the current state from the affected model or store audit information in a system designed for that purpose.

## Change context safely

Changing the array returned by `buildContext()` changes finding identity. Adding a key, renaming a key, changing normalization, or changing a value's type can cause the next detection run to create a new record while the previous record remains active or ignored.

Before changing context for a finding already used in production:

1. decide whether existing records should retain their current identity;
2. plan how old active or ignored records will be resolved or migrated;
3. keep the finding key stable only when the new context remains conceptually compatible; and
4. test repeat detection against records created with the previous context shape.

For a fundamentally different definition of an occurrence, using a new finding key can make the behavior change explicit and preserve the meaning of historical records.

Continue with [Large Datasets](/guides/large-datasets/) when detection should process a limited number of models per run, or [Findings and Records](/core-concepts/findings-and-records/) for the complete identity and lifecycle model.
