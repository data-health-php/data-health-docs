---
title: Configuration
description: Reference every Data Health configuration option.
---

Data Health works with its defaults immediately; publish configuration only when the application needs different discovery paths, scheduler behavior, cleanup behavior, or Filament presentation.

## Contents

- [Publish configuration](#publish-configuration)
- [Core configuration](#core-configuration)
- [Finding directories](#finding-directories)
- [Scheduler](#scheduler)
- [Automatic model cleanup](#automatic-model-cleanup)
- [Read configuration at runtime](#read-configuration-at-runtime)
- [Cache configuration](#cache-configuration)
- [Deployment recommendations](#deployment-recommendations)
- [Filament configuration](#filament-configuration)

## Publish configuration

Publish the core configuration file with:

```bash
php artisan vendor:publish --tag=data-health-config
```

This creates `config/data-health.php`. To publish both configuration and migrations at once, use the package-wide tag:

```bash
php artisan vendor:publish --tag=data-health
```

Published files belong to the application and are not overwritten by package updates. Compare them with new package defaults when upgrading.

## Core configuration

The default configuration is:

```php
return [
    'scheduler' => [
        'enabled' => env('DATA_HEALTH_SCHEDULER_ENABLED', true),
    ],

    'auto_delete' => [
        'enabled' => env('DATA_HEALTH_AUTO_DELETE_ENABLED', false),
    ],

    'directories' => [
        'app/DataHealth' => 'App\\DataHealth\\',
    ],
];
```

| Configuration key | Default | Purpose |
| --- | --- | --- |
| `data-health.directories` | `['app/DataHealth' => 'App\\DataHealth\\']` | Maps directories to namespaces for finding discovery. |
| `data-health.scheduler.enabled` | `true` | Registers findings carrying `Scheduled` with Laravel's scheduler. |
| `data-health.auto_delete.enabled` | `false` | Deletes finding records when their related model is deleted. |

## Finding directories

Each entry in `directories` maps a path relative to the application base path to its root namespace:

```php
'directories' => [
    'app/DataHealth' => 'App\\DataHealth\\',
    'app/Domain/Billing/Findings' => 'App\\Domain\\Billing\\Findings\\',
],
```

The namespace may include or omit its trailing backslash because Data Health normalizes it before appending the relative class name. The namespace below it must mirror the directory structure, and only concrete subclasses of `DataHealth\Finding` are registered.

See [Finding Discovery](/data-health-docs/core-concepts/finding-discovery/) for the complete discovery rules.

## Scheduler

Scheduled finding registration is enabled by default:

```dotenv
DATA_HEALTH_SCHEDULER_ENABLED=true
```

Set it to `false` when another process is responsible for running detection or when a deployment must not register Data Health events:

```dotenv
DATA_HEALTH_SCHEDULER_ENABLED=false
```

This option affects only automatic schedule registration. Direct calls to a finding's `detect()` method, custom jobs, and detection initiated through Filament remain available.

## Automatic model cleanup

Automatic cleanup is disabled by default:

```dotenv
DATA_HEALTH_AUTO_DELETE_ENABLED=false
```

Enable it to delete a model's finding records when that model is deleted:

```dotenv
DATA_HEALTH_AUTO_DELETE_ENABLED=true
```

The setting is global. Keep it disabled if findings must remain as an audit trail, and remember that restoring a soft-deleted model does not recreate deleted findings. See [Model Cleanup](/data-health-docs/guides/model-cleanup/) for lifecycle details.

## Read configuration at runtime

Use Laravel's `config()` helper with the package keys:

```php
$directories = config('data-health.directories');
$schedulerEnabled = config('data-health.scheduler.enabled');
$autoDeleteEnabled = config('data-health.auto_delete.enabled');
```

Tests may override a value before the package behavior is exercised:

```php
config()->set('data-health.scheduler.enabled', false);
```

Scheduler registration and discovery happen while the application boots, so changing those values after boot is too late for the current process.

## Cache configuration

After changing environment variables or published configuration in an application that caches configuration, rebuild the cache:

```bash
php artisan config:cache
```

Restart long-running queue workers and scheduler processes so they load the new values. Use class names rather than closures in configuration because closures cannot be serialized by `config:cache`.

## Deployment recommendations

| Environment | Suggested settings |
| --- | --- |
| Local development | Keep scheduling enabled only when using `schedule:work`; use a synchronous queue for simple debugging. |
| Test suite | Disable scheduling unless a test specifically covers registration; set other values explicitly in the test. |
| Single-server production | Enable scheduling when Laravel's scheduler is operated; choose cleanup according to retention requirements. |
| Multi-server production | Enable scheduling on scheduler hosts and use a shared lock-capable cache for overlap and one-server locks. |

These are operational starting points, not package requirements. The scheduler, queue workers, and shared cache are provided and operated by the Laravel application.

## Filament configuration

The optional Filament integration uses a separate file. Publish it with:

```bash
php artisan vendor:publish --tag=data-health-filament-config
```

| Configuration key | Default | Purpose |
| --- | --- | --- |
| `data-health-filament.navigation_group` | `'Data Health'` | Navigation group containing the package resources. |
| `data-health-filament.navigation_sort` | `100` | Base navigation sort position. |
| `data-health-filament.polling_interval` | `null` | Filament-compatible statistics refresh interval, such as `'10s'`; `null` disables polling. |
| `data-health-filament.assignee_types` | `null` | Invokable class returning allowed `MorphToSelect\Type` definitions. |
| `data-health-filament.model_view_routes` | `[]` | Maps affected model classes or morph types to named routes. |
| `data-health-filament.model_view_url_resolver` | `null` | Invokable class that returns a model URL or `null`. |

These values apply to all panels and standalone package components. See [Configuration and Model Links](/data-health-docs/filament/configuration-and-model-links/) for examples and URL-resolution precedence.
