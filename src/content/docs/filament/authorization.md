---
title: Authorization
description: Protect finding data and actions with application-owned panel and route authorization.
---

Data Health Filament deliberately provides no authorization layer, so the application must decide who can view findings and invoke operational actions.

## Contents

- [The authorization boundary](#the-authorization-boundary)
- [Protect the Filament panel](#protect-the-filament-panel)
- [Choose the right access granularity](#choose-the-right-access-granularity)
- [Protect standalone routes](#protect-standalone-routes)
- [Understand action risk](#understand-action-risk)
- [Protect affected-model links](#protect-affected-model-links)
- [Restrict assignee data](#restrict-assignee-data)
- [Multi-panel and tenant considerations](#multi-panel-and-tenant-considerations)
- [Test authorization](#test-authorization)

## The authorization boundary

The built-in Finding record resource skips Filament resource authorization. It does not consult a `FindingRecordPolicy`, and the package's actions do not perform permission checks of their own.

Standalone Livewire components likewise add no authentication or authorization middleware.

As a result, any user who can reach an exposed Data Health surface can see the records it queries and invoke every action visible for those records.

This is an intentional integration boundary: applications have different administrator models, tenancy rules, worklist ownership, and risk tolerances that the package cannot infer safely.

## Protect the Filament panel

Register `DataHealthPlugin` only with panels restricted to trusted operators:

```php
public function panel(Panel $panel): Panel
{
    return $panel
        ->id('operations')
        ->path('operations')
        ->login()
        ->plugin(DataHealthPlugin::make());
}
```

Authentication alone may not be sufficient. Use the application's normal Filament panel-access mechanism to allow only the intended users into the panel.

Do not register the plugin with a broad customer, partner, or tenant panel unless every panel user is allowed to inspect and operate on the complete finding dataset.

## Choose the right access granularity

The packaged resource is suitable when access can be granted at the whole-interface level. It does not provide built-in settings such as:

- view but not resolve;
- one worklist per team;
- one finding type per role;
- one tenant's records only; or
- assignment without lifecycle actions.

When those distinctions are required, build an application-owned Filament resource or Livewire interface over `FindingRecord`. Apply policies, scoped queries, and action visibility there while delegating verification and resolution to the Data Health core APIs.

Hiding navigation is not authorization. Users may still reach known resource URLs unless the request itself is protected.

## Protect standalone routes

Apply authentication and an application-defined ability to every route rendering standalone components:

```php
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'can:manage-data-health'])
    ->view('/operations/data-health', 'operations.data-health');
```

For a model-specific page, authorize both Data Health access and access to that model:

```php
use App\Models\Order;
use Illuminate\Support\Facades\Gate;

Route::middleware(['auth'])
    ->get('/orders/{order}/health', function (Order $order) {
        Gate::authorize('manageDataHealth', $order);

        return view('orders.health', compact('order'));
    });
```

Ensure the application's Livewire middleware setup preserves the intended authorization for update requests. Do not expose the component class through an otherwise public page and assume the Blade template alone protects its actions.

## Understand action risk

Different actions have different consequences:

| Action | Effect |
| --- | --- |
| View | Exposes model types, IDs, context, descriptions, and operational metadata. |
| Assign | Changes ownership fields and exposes configured assignee records. |
| Verify | May contact application or third-party services and can resolve the record. |
| Resolve | May change production or third-party data. |
| Ignore | Suppresses the occurrence across future detection runs. |
| Mark as resolved | Changes lifecycle state without checking the problem. |
| Reopen | Returns ignored or resolved work to the active queue. |
| Detect | Runs application-defined scans synchronously from the interface. |

Treat users who can reach the packaged interface as trusted Data Health operators, not read-only observers.

## Protect affected-model links

A finding link does not grant access to its destination, but a custom named route or URL resolver may reveal that a model exists.

Destination routes must enforce their own authentication and authorization. Do not rely on the link being absent as the security control.

The automatic Filament resource fallback checks whether the current model resource permits viewing the record before generating a link. Explicit route mappings and custom resolvers are application-owned and receive no equivalent package-level policy check.

## Restrict assignee data

An assignee provider controls which model types and records appear in the searchable assignment field. Restrict its queries to valid operational assignees:

```php
Type::make(User::class)
    ->titleAttribute('name')
    ->modifyOptionsQueryUsing(
        fn (Builder $query): Builder => $query->active()->operationsTeam(),
    );
```

This reduces data exposure and invalid choices, but it does not control who can run the assign action. If assignment requires a separate permission, use an application-owned interface with explicit action authorization.

## Multi-panel and tenant considerations

Every plugin registration queries the same global `data_health_findings` table. The package does not automatically scope records by:

- current panel;
- authenticated user;
- Filament tenant;
- worklist;
- assignee; or
- affected model ownership.

Registering the plugin with two panels gives both panels access to the same dataset. For tenant-isolated or team-scoped access, use a custom resource with a constrained query rather than the packaged global resource.

## Test authorization

Authorization tests should cover both page access and Livewire actions:

1. unauthenticated users cannot reach panel or standalone routes;
2. authenticated users without the required role or ability are denied;
3. permitted operators can render tables and run allowed actions;
4. restricted operators cannot invoke Livewire actions by calling endpoints directly;
5. affected-model routes enforce their own policies;
6. assignee searches do not expose disallowed records; and
7. tenant or worklist boundaries hold for direct URLs and manipulated filter state.

Include at least one test around resolution because it can modify application data, and one around manual detection because it executes arbitrary finding queries from a web request.

Return to [Overview](/data-health-docs/filament/overview/) for the complete feature map, or use [Configuration and Model Links](/data-health-docs/filament/configuration-and-model-links/) to configure the protected interface.
