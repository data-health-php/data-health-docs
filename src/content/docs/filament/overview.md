---
title: Overview
description: Add an operational Filament 5 interface to the Data Health core package.
---

Data Health Filament presents the findings managed by the core package through Filament resources, pages, widgets, actions, and reusable Livewire tables.

## Contents

- [What the package provides](#what-the-package-provides)
- [Requirements](#requirements)
- [Panel Builder integration](#panel-builder-integration)
- [Standalone components](#standalone-components)
- [Finding management](#finding-management)
- [Finding types and detection](#finding-types-and-detection)
- [Statistics](#statistics)
- [Relationship to the core package](#relationship-to-the-core-package)
- [Choose an integration approach](#choose-an-integration-approach)
- [Security boundary](#security-boundary)

## What the package provides

`data-health/data-health-filament` adds a ready-made interface for the records and capabilities defined by Data Health:

- a searchable and filterable finding-record resource;
- detail views with context and action descriptions;
- verify, resolve, ignore, reopen, assign, and mark-as-resolved workflows;
- bulk ignore and reopen actions;
- a catalogue of registered finding types;
- manual detection actions;
- active, immediate, resolved, and ignored statistics; and
- standalone Livewire tables for use outside a Filament panel.

The package does not define data-health rules. Your application's finding classes still own detection, verification, resolution, metadata, and scheduling.

## Requirements

Data Health Filament requires:

- PHP 8.3 or newer;
- Laravel 12 or 13;
- Filament 5; and
- a compatible installation of the Data Health core package.

Install and migrate the core package before expecting the interface to display records. Data Health Filament does not create a second findings table or replace the core migrations.

## Panel Builder integration

Register `DataHealthPlugin` with a Filament panel to add the complete integration:

```php
use DataHealth\Filament\DataHealthPlugin;
use Filament\Panel;

public function panel(Panel $panel): Panel
{
    return $panel
        ->plugin(DataHealthPlugin::make());
}
```

The plugin registers three panel components:

| Component | Purpose |
| --- | --- |
| Finding record resource | Search, filter, inspect, and act on finding records. |
| Finding types page | Browse registered finding classes and run supported detection manually. |
| Statistics widget | Summarize active, immediate, resolved, and ignored records. |

Register the plugin separately with every panel that should expose these components.

## Standalone components

A Filament panel is optional. The package registers Livewire components that can be placed in ordinary Blade views:

```blade
<livewire:data-health-filament::finding-records-table />
<livewire:data-health-filament::finding-types-table />
<livewire:data-health-filament::model-findings-table :model="$order" />
```

The standalone components reuse the same table definitions and actions as the panel integration. They are useful in custom administration areas, model detail screens, or applications that use Filament components without Panel Builder.

See [Standalone Components](/data-health-docs/filament/standalone-components/) for layout, assets, scoping, and access control.

## Finding management

The finding-record table is sorted by the most recently detected records and defaults to active findings. Operators can filter by status, urgency, finding type, and worklist.

Available actions depend on the record and finding capabilities:

- verification appears for active findings implementing `CanVerify`;
- resolution appears for active findings implementing `CanResolve`;
- ignore appears for active findings;
- reopen appears for ignored or resolved findings; and
- assignment appears after assignee types are configured.

The detail page also shows the finding description, affected model, context, first and last detection times, and a manual mark-as-resolved action.

## Finding types and detection

The finding-types page describes the classes currently discovered by the core package. It shows their keys, descriptions, worklists, urgency, verification and resolution capabilities, and scheduled status.

Findings implementing `CanDetect` receive a manual detection action. Detection runs from the interface after confirmation and may report the number of findings detected.

This catalogue reflects deployed PHP classes, while the finding-record resource reflects persisted occurrences in the database.

## Statistics

The plugin registers a statistics widget with four values:

- all active findings;
- active findings with immediate urgency;
- resolved findings; and
- ignored findings.

Polling is disabled by default and can be enabled through configuration when the dashboard should refresh automatically.

## Relationship to the core package

The Filament package is a presentation and interaction layer over Data Health. The core package remains responsible for:

- discovering finding classes;
- creating and deduplicating records;
- storing status, context, urgency, worklist, and assignment data;
- executing verification and resolution;
- scheduling detection; and
- cleaning up records when affected models are deleted.

Both panel and standalone interfaces operate on the same `FindingRecord` models. Adding or removing the Filament interface does not change finding identity or detection behavior.

## Choose an integration approach

| Approach | Best suited for |
| --- | --- |
| Panel plugin | Applications with a Filament administration panel that should expose the complete Data Health interface. |
| Standalone tables | Existing Blade or Livewire interfaces that need selected Data Health features. |
| Both | Applications that want central administration plus model-specific tables in other screens. |

Use the panel plugin for the fastest complete setup. Choose standalone components when navigation and page layout should remain entirely application-owned.

## Security boundary

Data Health Filament does not authorize access to findings or their actions. The built-in resource skips Filament resource authorization, and standalone components do not add route protection.

Only expose the panel or component routes to trusted users. If different users need different capabilities, enforce that distinction outside the package or build an application-specific resource with the required policies and action visibility.

See [Authorization](/data-health-docs/filament/authorization/) before enabling the integration in production.

Continue with [Installation](/data-health-docs/filament/installation/) to register the plugin, or [Managing Findings](/data-health-docs/filament/managing-findings/) for the operator workflow.
