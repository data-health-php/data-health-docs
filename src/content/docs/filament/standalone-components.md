---
title: Standalone Components
description: Embed Data Health finding and type tables in ordinary Blade and Livewire interfaces.
---

Use standalone Livewire tables in custom operations pages or model detail screens. Laravel package discovery registers them automatically; `DataHealthPlugin` registration is only needed for panel integration.

## Available components

Show all finding records:

```blade
<livewire:data-health-filament::finding-records-table />
```

Show records for one persisted Eloquent model:

```blade
<livewire:data-health-filament::model-findings-table :model="$order" />
```

The model table scopes records by `$order->getMorphClass()` and `$order->getKey()`.

Show discovered finding types with manual detection:

```blade
<livewire:data-health-filament::finding-types-table />
```

## Include Filament assets

If the containing layout does not already include Filament assets, add its styles and scripts alongside your application's assets:

```blade
<!DOCTYPE html>
<html>
    <head>
        @filamentStyles
    </head>
    <body>
        {{ $slot }}

        @filamentScripts
    </body>
</html>
```

Avoid including these directives twice when a parent layout already provides them.

## Differences from panel usage

Record tables share the panel table's filters, active-status default, row actions, and bulk actions. See [Managing Findings](/data-health-docs/filament/managing-findings/) for their behavior.

Standalone tables omit the resource detail-page View action and do not display full JSON context. Add an application-specific detail view if needed.

Affected-model links need a named route or custom URL resolver outside a panel, where the automatic Filament resource fallback is unavailable. Assignment uses the same provider configuration as panel tables. See [Configuration and Model Links](/data-health-docs/filament/configuration-and-model-links/).

Panel and standalone interfaces can coexist. They share records and configuration; changes appear in other surfaces after refresh or navigation.
