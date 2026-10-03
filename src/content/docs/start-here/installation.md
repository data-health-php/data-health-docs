---
title: Installation
description: Install Data Health, publish its resources, and prepare your Laravel application.
---

Data Health installs like a conventional Laravel package and is discovered automatically by Laravel after Composer finishes.

## Requirements

Before installing Data Health, make sure your application uses:

- PHP 8.3 or newer; and
- Laravel 12 or 13.

The optional Filament interface additionally requires Filament 5.

## Install the core package

Install Data Health with Composer:

```bash
composer require data-health/data-health
```

Laravel package discovery registers the Data Health service provider and facade, so you do not need to add either one to your application manually.

## Publish the package resources

Publish the configuration file and migrations together with the `data-health` tag:

```bash
php artisan vendor:publish --tag="data-health"
```

If you prefer to publish them separately, use their individual tags:

```bash
php artisan vendor:publish --tag="data-health-config"
php artisan vendor:publish --tag="data-health-migrations"
```

Publishing the configuration file is optional because Data Health loads its defaults from the package. Publish it when you need to change discovery directories, scheduled detection, or automatic model cleanup.

The migrations create the tables used for finding records and detection cursors. Run them after publishing:

```bash
php artisan migrate
```

## Default configuration

The published `config/data-health.php` starts with these behaviors:

- finding classes are discovered recursively below `app/DataHealth` using the `App\DataHealth` namespace;
- scheduled detections are enabled; and
- automatic cleanup for every deleted Eloquent model is disabled.

The discovery directory does not need to exist before installation. You can create it when you define your first finding in the [Quick Start](/start-here/quick-start/).

See [Configuration](/reference/configuration/) for every available option and environment variable.

## Choose an interface

The core package does not require a user interface. You can detect, inspect, verify, and resolve findings from application code, queued jobs, console commands, HTTP endpoints, or an interface built specifically for your application.

For a ready-made management interface, install the optional Filament package:

```bash
composer require data-health/data-health-filament
```

It adds finding resources, actions, statistics, manual detection, and standalone Livewire components without changing the finding classes used by the core package.

Continue with [Filament Installation](/filament/installation/) to register it with a panel, or skip it and proceed directly to the [Quick Start](/start-here/quick-start/).
