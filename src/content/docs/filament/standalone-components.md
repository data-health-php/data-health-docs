---
title: Standalone Components
description: Embed Data Health finding and type tables in ordinary Blade and Livewire interfaces.
---

Standalone components provide the package's Filament tables and actions without requiring a Panel Builder installation.

## Contents

- [When to use standalone components](#when-to-use-standalone-components)
- [Available components](#available-components)
- [Render all findings](#render-all-findings)
- [Render findings for one model](#render-findings-for-one-model)
- [Render finding types](#render-finding-types)
- [Include Filament assets](#include-filament-assets)
- [Available actions](#available-actions)
- [Configure links and assignments](#configure-links-and-assignments)
- [Use components alongside a panel](#use-components-alongside-a-panel)
- [Protect component routes](#protect-component-routes)
- [Layout considerations](#layout-considerations)

## When to use standalone components

Use standalone components when the application:

- has no Filament panel;
- already has a custom operations area;
- needs findings on an existing model detail page;
- wants the finding-type catalogue without the full resource; or
- uses both a central panel and contextual tables elsewhere.

The package service provider registers the components automatically through Laravel package discovery. `DataHealthPlugin` is not required for standalone rendering.

## Available components

Three namespaced Livewire components are available:

| Component | Purpose |
| --- | --- |
| `finding-records-table` | All finding records with filters and row actions. |
| `model-findings-table` | Records belonging to one Eloquent model. |
| `finding-types-table` | Discovered finding classes with manual detection. |

They reuse the panel integration's table configurations, so filters, lifecycle behavior, descriptions, and configuration stay consistent.

## Render all findings

Add the complete finding table to a Blade view:

```blade
<livewire:data-health-filament::finding-records-table />
```

It includes the same columns, status default, search, filters, assignment, verification, resolution, ignore, reopen, and bulk actions as the resource table.

The standalone table does not add the resource's detail-page View action. Context is not shown in the table itself, so build an application-specific detail surface when standalone users need the full infolist.

## Render findings for one model

Pass an Eloquent model to show only its records:

```blade
<livewire:data-health-filament::model-findings-table :model="$order" />
```

The component scopes records by both the model's morph class and primary key:

```text
model_type = $order->getMorphClass()
model_id   = $order->getKey()
```

Every status is available through the same filters, with active selected by default. The model must be persisted and have a stable key.

This component pairs naturally with an order, customer, subscription, or other domain-model detail page.

## Render finding types

Embed the discovery catalogue and manual detection actions:

```blade
<livewire:data-health-filament::finding-types-table />
```

The table lists deployed finding types rather than database records. Detect actions run synchronously in the Livewire request and appear only for classes implementing `CanDetect`.

See [Finding Types and Detection](/data-health-docs/filament/finding-types-and-detection/) for result and failure behavior.

## Include Filament assets

When the containing layout is not already a Filament layout, include Filament's styles and scripts:

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

Applications may add their existing Vite assets, metadata, and layout structure around these directives. Avoid including Filament assets twice when a parent layout already provides them.

## Available actions

Standalone record tables expose the same row actions used by the panel table:

- assign, when assignee types are configured;
- verify, for active verifiable findings;
- resolve, for active resolvable findings;
- ignore, for active findings; and
- reopen, for ignored or resolved findings.

They also provide bulk ignore and reopen actions. These operations act directly on the shared finding records; standalone does not mean isolated data or behavior.

## Configure links and assignments

Affected-model links and assignee options use the same `data-health-filament` configuration as the panel integration.

Outside a current panel, model links cannot use Filament's automatic resource-view fallback. Configure a named route or custom URL resolver when standalone tables should link to affected models.

Assignment remains hidden until an `assignee_types` provider is configured. See [Configuration and Model Links](/data-health-docs/filament/configuration-and-model-links/).

## Use components alongside a panel

The plugin and standalone components can coexist. For example:

- the operations panel can expose all findings and the type catalogue;
- an order-management page can embed findings for its current order; and
- a custom dashboard can embed the full table for a specialized audience.

All surfaces share records and configuration. An action taken in one surface is visible in the others after Livewire refresh or navigation.

## Protect component routes

Standalone components do not add authentication or authorization. Protect the route that renders their Blade view:

```php
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'can:manage-data-health'])
    ->view('/operations/data-health', 'operations.data-health');
```

The ability used here is application-defined. Ensure the authorization remains effective for subsequent Livewire requests according to the application's Livewire middleware configuration.

Because record actions can change application data through finding resolvers, do not treat the tables as read-only merely because they are embedded in an ordinary view.

## Layout considerations

Give tables enough horizontal space for badges, model labels, actions, and filters. On narrower pages, users can toggle urgency, worklist, and last-detected columns.

Place a model-scoped table near the model's operational controls and explain finding statuses to audiences unfamiliar with Data Health. For large global tables, prefer a dedicated page rather than embedding the component in a crowded dashboard card.

Continue with [Configuration and Model Links](/data-health-docs/filament/configuration-and-model-links/) or review [Authorization](/data-health-docs/filament/authorization/) before exposing standalone actions.
