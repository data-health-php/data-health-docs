---
title: Installation
description: Install Data Health Filament and register it with one or more Filament panels.
---

Install the package with Composer, let Laravel discover its service provider, and choose between Panel Builder and standalone integration.

## Contents

- [Requirements](#requirements)
- [Install the package](#install-the-package)
- [Laravel package discovery](#laravel-package-discovery)
- [Register the panel plugin](#register-the-panel-plugin)
- [Register multiple panels](#register-multiple-panels)
- [What the plugin registers](#what-the-plugin-registers)
- [Publish configuration](#publish-configuration)
- [Confirm the installation](#confirm-the-installation)
- [Protect access](#protect-access)
- [Next steps](#next-steps)

## Requirements

Before installing the Filament integration, the application should have:

- PHP 8.3 or newer;
- Laravel 12 or 13;
- Filament 5; and
- the Data Health core package with its migrations published and run.

Follow [Data Health Installation](/start-here/installation/) first when the core package is not yet configured.

## Install the package

Install Data Health Filament with Composer:

```bash
composer require data-health/data-health-filament
```

The package may be used with Panel Builder, standalone components, or both in the same application.

## Laravel package discovery

Laravel package discovery registers `DataHealthFilamentServiceProvider`. The provider:

- merges the default `data-health-filament` configuration;
- loads the package's Blade views;
- registers the namespaced Livewire components; and
- exposes the optional configuration publish tag.

You do not need to add the service provider manually in a conventional Laravel installation.

Package discovery does not register the plugin with a panel. Panel registration remains explicit so each application controls where Data Health appears.

## Register the panel plugin

Add `DataHealthPlugin` to the desired panel provider:

```php
<?php

namespace App\Providers\Filament;

use DataHealth\Filament\DataHealthPlugin;
use Filament\Panel;
use Filament\PanelProvider;

class AdminPanelProvider extends PanelProvider
{
    public function panel(Panel $panel): Panel
    {
        return $panel
            ->default()
            ->id('admin')
            ->path('admin')
            ->plugin(DataHealthPlugin::make());
    }
}
```

The plugin identifier is `data-health` and the plugin has no required constructor options.

## Register multiple panels

Plugin registration is per panel. Add it to every panel that should expose Data Health:

```php
public function panel(Panel $panel): Panel
{
    return $panel
        ->id('operations')
        ->path('operations')
        ->plugin(DataHealthPlugin::make());
}
```

All registered panels use the same underlying finding records and package configuration. Registration does not automatically scope records by panel or tenant.

Do not register the plugin with a panel whose users should not see and operate on every exposed finding record.

## What the plugin registers

The plugin adds:

- a **Finding records** resource with list and view pages;
- a **Finding types** page with manual detection actions; and
- a **Finding statistics** overview widget.

By default, both navigation entries appear in the `Data Health` group. The resource uses sort position `100`, and the finding-types page follows it at `101`.

## Publish configuration

The defaults work without publishing. Publish the configuration when you need to change navigation, polling, assignments, or model links:

```bash
php artisan vendor:publish --tag=data-health-filament-config
```

This creates `config/data-health-filament.php`. See [Configuration and Model Links](/filament/configuration-and-model-links/) for every option.

## Confirm the installation

After registration:

1. open the configured Filament panel;
2. confirm the Data Health navigation group contains **Finding records** and **Finding types**;
3. open Finding types and confirm your discovered finding classes appear; and
4. create or detect a test finding and confirm it appears in Finding records.

An empty records table is valid when detection has not created any findings. A missing finding type usually indicates a core discovery path or namespace problem rather than a Filament installation problem.

## Protect access

The package does not perform authorization checks. The built-in resource explicitly skips Filament resource authorization, so registering the plugin makes its records and actions available to users who can enter that panel.

Configure panel authentication and access rules before deployment. For standalone components, protect the application routes that render them.

Read [Authorization](/filament/authorization/) for the complete boundary and fine-grained-access options.

## Next steps

- Use [Managing Findings](/filament/managing-findings/) to understand filters and actions.
- Configure model destinations and assignees in [Configuration and Model Links](/filament/configuration-and-model-links/).
- Use [Standalone Components](/filament/standalone-components/) when no panel is required.
