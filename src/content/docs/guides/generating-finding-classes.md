---
title: Generating Finding Classes
description: Generate finding classes with Artisan and configure their default capabilities.
---

Use `health:make:finding` to create a finding class with the interfaces, method placeholders, and metadata needed for its workflow.

## Contents

- [Generate a finding](#generate-a-finding)
- [Choose the default interfaces](#choose-the-default-interfaces)
- [Add capabilities](#add-capabilities)
- [Add metadata](#add-metadata)
- [Generate scheduled and queued detections](#generate-scheduled-and-queued-detections)
- [Generate automatic actions](#generate-automatic-actions)
- [Choose a directory and namespace](#choose-a-directory-and-namespace)
- [Protect existing files](#protect-existing-files)
- [Command reference](#command-reference)

## Generate a finding

Run the command from your Laravel application:

```bash
php artisan health:make:finding PaidOrderMarkedPending
```

With the package defaults, this creates `app/DataHealth/PaidOrderMarkedPending.php`:

```php
<?php

declare(strict_types=1);

namespace App\DataHealth;

use DataHealth\Contracts\CanDetect;
use DataHealth\Finding;

class PaidOrderMarkedPending extends Finding implements CanDetect
{
    public static function detect(): int|callable|null
    {
        // Report matching models with static::found($model, $context).
        return null;
    }
}
```

The command reports the created file path. Implement the detection query and call `static::found($model, $context)` for each occurrence; see [Detecting Problems](/data-health-docs/guides/detecting-problems/) for examples.

:::note
The command generates a PHP class. It does not run detection or create finding records. Generated detection returns `null`, while generated verification and resolution return `false` until you implement them.
:::

## Choose the default interfaces

Publish `config/data-health.php` if your application does not already have it:

```bash
php artisan vendor:publish --tag=data-health-config
```

The `make_finding.interfaces` list controls the interfaces and corresponding method placeholders included in newly generated findings. It defaults to `CanDetect` only. For example, include all three capabilities:

```php
use DataHealth\Contracts\CanDetect;
use DataHealth\Contracts\CanResolve;
use DataHealth\Contracts\CanVerify;

return [
    // Other Data Health configuration...

    'make_finding' => [
        'interfaces' => [
            CanDetect::class,
            CanVerify::class,
            CanResolve::class,
        ],
    ],
];
```

Only these three fully qualified interface names are supported. Select any combination, or use `'interfaces' => []` to generate a plain finding without capability interfaces or methods. Changing this setting affects future generation and does not rewrite existing classes.

Command options add to the configured defaults without duplicating interfaces or methods. If configuration is cached, rebuild it after changing the list with `php artisan config:cache`.

## Add capabilities

Add verification and resolution to the default detectable finding:

```bash
php artisan health:make:finding PaidOrderMarkedPending --verify --resolve
```

Use `--detect` to request detection explicitly when it is absent from the configured defaults. Each capability adds its interface and method placeholder:

| Option | Interface | Generated method |
| --- | --- | --- |
| `--detect` | `DataHealth\Contracts\CanDetect` | `public static function detect(): int\|callable\|null` returning `null`. |
| `--verify` | `DataHealth\Contracts\CanVerify` | `public function verify(): bool` returning `false`. |
| `--resolve` | `DataHealth\Contracts\CanResolve` | `public function resolve(): bool` returning `false`. |

Implement verification so it returns `true` only when the problem no longer applies, and resolution so it returns `true` only when correction succeeds. See [Verifying Findings](/data-health-docs/guides/verifying-findings/) and [Resolving Findings](/data-health-docs/guides/resolving-findings/).

## Add metadata

Generate class attributes for a stable key, description, urgency, and worklist:

```bash
php artisan health:make:finding PaidOrderMarkedPending \
    --key=paid-order-marked-pending \
    --description="A paid order is still marked as pending." \
    --urgency=soon --worklist=orders
```

The supported urgency values are `immediate`, `soon`, `normal`, and `deferred`. See [Metadata and Worklists](/data-health-docs/guides/metadata-and-worklists/) for how these attributes affect finding records.

## Generate scheduled and queued detections

Create a finding scheduled every five minutes and route detection to a queue:

```bash
php artisan health:make:finding PaidOrderMarkedPending \
    --schedule="*/5 * * * *" --async --queue=data-health --connection=redis
```

`--schedule` adds `Scheduled`, `CanDetect`, and a detection placeholder, even when detection is absent from the configured defaults. The cron expression must be valid.

`--async` adds the `Async` attribute and requires `--schedule`. `--queue` and `--connection` require `--async`; omit them to use Laravel's default queue routing. Implement detection and operate the scheduler and queue workers as described in [Scheduling and Queues](/data-health-docs/guides/scheduling-and-queues/).

## Generate automatic actions

```bash
php artisan health:make:finding PaidOrderMarkedPending --auto-resolve --auto-verify=5
```

`--auto-resolve` adds `AutoResolve`, `CanResolve`, and a resolution placeholder. `--auto-verify=5` adds `AutoVerify(5)`, `CanVerify`, and a verification placeholder. The verification delay is a non-negative integer in minutes; use `--auto-verify=0` for immediate queued verification after commit.

These options add the required capabilities even when the default interface list is empty. Implement the generated methods before relying on automatic actions; the package invokes these actions for newly created records.

## Choose a directory and namespace

The command uses the first directory and namespace in `data-health.directories`. Nested names create matching subdirectories:

```bash
php artisan health:make:finding Orders/PaidOrderMarkedPending
```

With the default configuration, this creates `app/DataHealth/Orders/PaidOrderMarkedPending.php` in the `App\DataHealth\Orders` namespace. A fully qualified class name within the selected namespace is also accepted, such as `'App\DataHealth\Orders\PaidOrderMarkedPending'`.

To choose another directory, configure it first:

```php
'directories' => [
    'app/DataHealth' => 'App\\DataHealth\\',
    'app/Domain/Billing/Findings' => 'App\\Domain\\Billing\\Findings\\',
],
```

Then select that configured path:

```bash
php artisan health:make:finding PaidOrderMarkedPending --directory=app/Domain/Billing/Findings
```

The resulting namespace is `App\Domain\Billing\Findings`. The `--directory` value must match a configured directory; it does not create a new discovery configuration. See [Finding Discovery](/data-health-docs/core-concepts/finding-discovery/).

## Protect existing files

The command refuses to overwrite an existing finding. Use `--force` only when you intend to replace its contents:

```bash
php artisan health:make:finding PaidOrderMarkedPending --verify --resolve --force
```

Invalid class names, unsupported default interfaces, invalid urgency or schedule values, negative or fractional verification delays, and incompatible options fail before a finding file is written.

## Command reference

| Argument or option | Purpose |
| --- | --- |
| `name` | Required class name, optionally nested or fully qualified within the selected namespace. |
| `--detect`, `--verify`, `--resolve` | Add capability interfaces and method placeholders to the configured defaults. |
| `--key=`, `--description=`, `--worklist=` | Add the corresponding class metadata attributes. |
| `--urgency=` | Add an urgency attribute using `immediate`, `soon`, `normal`, or `deferred`. |
| `--schedule=` | Add a cron schedule and detection capability. |
| `--async` | Queue scheduled detection; requires `--schedule`. |
| `--queue=`, `--connection=` | Set asynchronous detection routing; require `--async`. |
| `--auto-resolve` | Add automatic resolution and its capability. |
| `--auto-verify=` | Add automatic verification with a non-negative delay in minutes and its capability. |
| `--directory=` | Select a directory configured in `data-health.directories`; defaults to the first. |
| `--force`, `-f` | Replace an existing finding file. |

View the command's built-in help with:

```bash
php artisan help health:make:finding
```
