---
title: Finding Discovery
description: Learn how Data Health maps configured directories to finding classes and stable keys.
---

Data Health discovers finding classes from configured directories and registers them by key so they can be detected, scheduled, and reconstructed from stored records.

## Contents

- [The default discovery directory](#the-default-discovery-directory)
- [Configuring directories and namespaces](#configuring-directories-and-namespaces)
- [How paths become class names](#how-paths-become-class-names)
- [Which classes are registered](#which-classes-are-registered)
- [Finding keys](#finding-keys)
- [Key collisions](#key-collisions)
- [When discovery runs](#when-discovery-runs)
- [Troubleshooting discovery](#troubleshooting-discovery)

## The default discovery directory

The default configuration scans `app/DataHealth` and treats it as the root of the `App\DataHealth` namespace:

```php
// config/data-health.php

'directories' => [
    'app/DataHealth' => 'App\\DataHealth\\',
],
```

A finding placed directly in that directory is discovered without manual registration:

```text
app/DataHealth/PaidOrderMarkedPending.php
```

```php
namespace App\DataHealth;

use DataHealth\Finding;

class PaidOrderMarkedPending extends Finding
{
    // ...
}
```

The directory does not need to exist when the package is installed. A missing configured directory contributes no findings and does not raise an error.

## Configuring directories and namespaces

Each entry in `data-health.directories` maps a directory relative to the Laravel application's base path to its corresponding PHP namespace prefix.

You can scan more than one part of an application:

```php
'directories' => [
    'app/DataHealth' => 'App\\DataHealth\\',
    'app/Domain/Billing/DataHealth' => 'App\\Domain\\Billing\\DataHealth\\',
    'app/Domain/Customers/DataHealth' => 'App\\Domain\\Customers\\DataHealth\\',
],
```

Directory order is preserved during discovery. The namespace may be written with or without a trailing backslash because Data Health normalizes it before appending the relative class name.

:::note
The configured namespace must be autoloadable by Composer. Laravel's default `App\` mapping already covers classes below `app`, but custom roots or namespaces may require an additional PSR-4 entry in your application's `composer.json`.
:::

After changing published configuration in a production environment, rebuild Laravel's configuration cache as you normally would for that application.

## How paths become class names

Discovery is recursive. For every PHP file below a configured directory, Data Health:

1. removes the configured directory and the `.php` extension from its path;
2. converts directory separators to namespace separators; and
3. prefixes the configured namespace.

For example:

```text
app/DataHealth/Orders/Payments/PaidOrderMarkedPending.php
```

becomes:

```php
App\DataHealth\Orders\Payments\PaidOrderMarkedPending
```

The file must therefore follow PSR-4 conventions: its relative path, filename, namespace, and class name must agree. Discovery considers only files whose extension is exactly `php`; files with other extensions are ignored.

Files within a directory are processed in path order, which makes discovery deterministic. Application code should not depend on that order, however, because findings are addressed by key rather than position.

## Which classes are registered

A discovered PHP file is registered only when its mapped class:

- exists and can be autoloaded;
- extends `DataHealth\Finding`; and
- is concrete rather than abstract.

This allows support classes to live below a discovery directory without becoming findings:

```text
app/DataHealth/
├── Orders/
│   └── PaidOrderMarkedPending.php
└── Support/
    └── CalculatesOrderTotals.php
```

`PaidOrderMarkedPending` is registered when it extends `Finding`; `CalculatesOrderTotals` is ignored when it does not. Abstract base findings are also ignored, while concrete subclasses of those bases are registered.

Implementing `CanDetect` is not required for registration. Findings that are created directly from application code, and findings that only support verification or resolution, still belong in the registry.

## Finding keys

Every registered class is indexed by the value returned from its static `key()` method. Without an explicit key, Data Health uses the class basename:

```php
PaidOrderMarkedPending::key();
// 'PaidOrderMarkedPending'
```

Use the `Key` attribute to define a stable value:

```php
use DataHealth\Attributes\Key;
use DataHealth\Finding;

#[Key('paid-order-marked-pending')]
class PaidOrderMarkedPending extends Finding
{
    // ...
}
```

Data Health then associates the stable key with the class:

```php
[
    'paid-order-marked-pending' => PaidOrderMarkedPending::class,
]
```

Stored finding records contain the key rather than the PHP class name. A stable explicit key lets you rename or move a class without breaking the registry's ability to reconstruct existing records.

:::tip
Prefer explicit keys for findings that may outlive a refactor, especially once records exist in production.
:::

## Key collisions

Finding keys must be unique across every configured discovery directory. Two classes with the same basename receive the same default key even when they live in different namespaces:

```text
App\DataHealth\Orders\MissingReference
App\DataHealth\Invoices\MissingReference
```

Assign explicit keys to distinguish them:

```php
#[Key('order-missing-reference')]
class MissingReference extends Finding
{
    // ...
}
```

```php
#[Key('invoice-missing-reference')]
class MissingReference extends Finding
{
    // ...
}
```

A later discovered class with the same key replaces the earlier mapping, so a collision may make one class unreachable without producing a registration error.

Do not rely on directory or filename order to choose a winner. Treat duplicate keys as a configuration error and test the complete registry when an application contains many findings or discovery roots.

## When discovery runs

Data Health scans its configured directories lazily when discovered findings are first needed. It caches the result for the lifetime of the current service instance rather than scanning the filesystem on every operation.

This behavior keeps repeated key and class lookups inexpensive, but an already initialized registry does not notice files or configuration added later in the same process.

In normal request-based PHP execution, the next application process or request creates a fresh registry as needed. After deploying findings to long-running processes such as queue workers, restart those processes so they load the new registry state.

## Troubleshooting discovery

When a finding is missing from the registry, check the following in order:

1. **Directory:** Confirm that the configured directory resolves below the application's base path and exists.
2. **Configuration cache:** Confirm that the running application is using the expected `data-health.directories` value.
3. **Extension:** Confirm that the source filename ends in `.php`.
4. **Namespace mapping:** Translate the relative path using the configured namespace and confirm it produces the real class name.
5. **Autoloading:** Confirm Composer can autoload the mapped class, regenerating the autoloader when a custom PSR-4 mapping changed.
6. **Inheritance:** Confirm the class extends `DataHealth\Finding` and is not abstract.
7. **Key collision:** Confirm that no other finding uses the same default or explicit key.
8. **Capabilities:** If detection or scheduling is unavailable, confirm that the class implements `CanDetect` and, for scheduling, has the `Scheduled` attribute.
9. **Long-running process:** Restart queue workers or other persistent application processes that initialized the registry before the class was deployed.

A missing directory is ignored, but an existing directory that cannot be read causes discovery to throw a `RuntimeException` naming the configured path.

Continue with [Detecting Problems](/guides/detecting-problems/) to use discovered classes in application workflows, or review [Attributes and Contracts](/reference/attributes-and-contracts/) for the complete discovery-related API.
