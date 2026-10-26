---
title: Installation
description: Install Data Health Filament and register it with one or more Filament panels.
---

## Requirements

- PHP 8.3 or newer
- Laravel 12 or 13
- Filament 5
- The [Data Health core package](/data-health-docs/start-here/installation/), with its migrations run

## Install the package

```bash
composer require data-health/data-health-filament
```

Laravel discovers the service provider automatically. For usage without Panel Builder, continue with [Standalone Components](/data-health-docs/filament/standalone-components/).

## Register the panel plugin

Add `DataHealthPlugin` to your panel provider:

```php
use DataHealth\Filament\DataHealthPlugin;
use Filament\Panel;

public function panel(Panel $panel): Panel
{
    return $panel
        ->plugin(DataHealthPlugin::make());
}
```

This registers the **Finding records** resource, **Finding types** page, and statistics widget. The navigation entries appear in the `Data Health` group by default.

Optionally call `DataHealthPlugin::make()->brandLogo()` to use the Data Health wordmark with its dark-mode variant.

Register the plugin separately with each panel that should expose it. All panels share the same finding records and configuration.

## Publish configuration

Defaults work without publishing. To customize navigation, polling, assignments, or model links:

```bash
php artisan vendor:publish --tag=data-health-filament-config
```

This creates `config/data-health-filament.php`. See [Configuration and Model Links](/data-health-docs/filament/configuration-and-model-links/) for the available options.

## Confirm the installation

Open the panel and check that **Finding types** lists your discovered classes. Detect a test finding and confirm it appears under **Finding records**.

An empty records table is normal before detection. Missing types usually indicate a [core discovery](/data-health-docs/core-concepts/finding-discovery/) configuration problem.
