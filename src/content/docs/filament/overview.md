---
title: Overview
description: Add an operational Filament 5 interface to the Data Health core package.
---

`data-health/data-health-filament` adds a Filament 5 interface for the findings managed by the Data Health core package. Your application's finding classes continue to define detection, verification, resolution, and scheduling.

## What it provides

- **Finding records:** search, filter, inspect context, and assign, verify, resolve, ignore, or reopen findings.
- **Finding types:** browse discovered classes and run supported detection manually.
- **Statistics:** counts of active, immediate-active, resolved, and ignored findings.
- **Standalone tables:** embed the same tables in Blade or Livewire views, including findings for a single model.

## Choose an integration

Use the [panel plugin](/data-health-docs/filament/installation/) for the complete interface in an existing Filament administration panel. Use [standalone components](/data-health-docs/filament/standalone-components/) for custom pages or model detail screens. Both approaches can coexist and share the core package's records and configuration.

:::note[Authorization]
The package currently provides no authorization functionality. The built-in resource skips Filament resource authorization, and standalone components add no access protection. Restrict access through your application's panel or route authorization; records are not automatically scoped by user or tenant.
:::

Start with [Installation](/data-health-docs/filament/installation/), then see [Managing Findings](/data-health-docs/filament/managing-findings/) for the operator workflow.
