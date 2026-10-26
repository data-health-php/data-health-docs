---
title: Installation
description: Install Data Health, publish its resources, and prepare your Laravel application.
---

Data Health installs like a conventional Laravel package and is discovered automatically by Laravel after Composer finishes.

## Contents

- [Requirements](#requirements)
- [Install the core package](#install-the-core-package)
- [Publish the package resources](#publish-the-package-resources)
- [Default configuration](#default-configuration)
- [Coding agents and Laravel Boost](#coding-agents-and-laravel-boost)
- [Choose an interface](#choose-an-interface)

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

:::note[Model key compatibility]
The published migrations use unsigned big-integer morph IDs. If affected models use UUID, ULID, string, or custom primary keys, adapt the published `model_type` / `model_id` and optional assignee columns to compatible Laravel morph column types before running the migrations. If the migrations have already run, make the change in a new application migration instead of editing migration history.

See [Customize the schema](/data-health-docs/reference/database-schema/#customize-the-schema) for details.
:::

## Default configuration

The published `config/data-health.php` starts with these behaviors:

- finding classes are discovered recursively below `app/DataHealth` using the `App\DataHealth` namespace;
- scheduled detections are enabled; and
- automatic cleanup for every deleted Eloquent model is disabled.

The discovery directory does not need to exist before installation. You can create it when you define your first finding in the [Quick Start](/data-health-docs/start-here/quick-start/).

See [Configuration](/data-health-docs/reference/configuration/) for every available option and environment variable.

## Coding agents and Laravel Boost

The package bundles concise Boost guidelines and a `data-health-development` skill.
With Laravel Boost installed, run `php artisan boost:install` and select the package
guidelines and skill for your coding agent. Use `php artisan boost:update` to refresh
installed guidance after package updates, checking that newly discovered resources
are selected when prompted.

Before asking an agent to generate findings or scan application code, have it read
the skill. Without Boost, the installed file is
`vendor/data-health/data-health/resources/boost/skills/data-health-development/SKILL.md`.
The [skill source](https://github.com/data-health-php/data-health/blob/main/resources/boost/skills/data-health-development/SKILL.md)
is also available online. Installing the Composer package alone does not ensure an
agent has loaded its guidance.

Start with [Establish the application rule](/data-health-docs/guides/detecting-problems/#establish-the-application-rule)
to distinguish supported invariants from speculative checks and legitimate exceptions.

## Choose an interface

The core package does not require a user interface. You can detect, inspect, verify, and resolve findings from application code, queued jobs, console commands, HTTP endpoints, or an interface built specifically for your application.

For a ready-made management interface, install the optional Filament package:

```bash
composer require data-health/data-health-filament
```

It adds finding resources, actions, statistics, manual detection, and standalone Livewire components without changing the finding classes used by the core package.

Continue with [Filament Installation](/data-health-docs/filament/installation/) to register it with a panel, or skip it and proceed directly to the [Quick Start](/data-health-docs/start-here/quick-start/).
