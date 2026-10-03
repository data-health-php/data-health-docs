---
title: Configuration and Model Links
description: Configure Filament navigation, polling, assignees, and affected-model destinations.
---

The optional configuration file controls where Data Health appears, how statistics refresh, who findings may be assigned to, and where affected-model links lead.

## Contents

- [Publish configuration](#publish-configuration)
- [Default options](#default-options)
- [Configure navigation](#configure-navigation)
- [Configure statistics polling](#configure-statistics-polling)
- [Configure assignees](#configure-assignees)
- [Restrict assignee options](#restrict-assignee-options)
- [Link to affected models](#link-to-affected-models)
- [Map models to named routes](#map-models-to-named-routes)
- [Create a custom URL resolver](#create-a-custom-url-resolver)
- [Understand URL precedence](#understand-url-precedence)
- [Use the Filament resource fallback](#use-the-filament-resource-fallback)
- [Cache configuration safely](#cache-configuration-safely)

## Publish configuration

Data Health Filament loads its defaults without publishing. Create an application-owned file when customization is needed:

```bash
php artisan vendor:publish --tag=data-health-filament-config
```

This creates `config/data-health-filament.php`.

## Default options

```php
return [
    'navigation_group' => 'Data Health',
    'navigation_sort' => 100,
    'polling_interval' => null,
    'assignee_types' => null,
    'model_view_routes' => [],
    'model_view_url_resolver' => null,
];
```

These options apply to every panel and standalone component using the package; configuration is not panel-specific.

## Configure navigation

Change the navigation group and base sort position:

```php
'navigation_group' => 'Operations',
'navigation_sort' => 50,
```

Finding records uses the configured position. Finding types uses the next position so the entries remain adjacent. Filament still controls where the navigation group appears relative to other groups.

## Configure statistics polling

Polling is disabled by default:

```php
'polling_interval' => null,
```

Set a Filament-compatible interval to refresh counts:

```php
'polling_interval' => '10s',
```

Each refresh counts active, immediate-active, resolved, and ignored records. Balance freshness against the cost of repeated count queries.

## Configure assignees

Assignment is hidden until `assignee_types` names an invokable provider:

```php
'assignee_types' => App\DataHealth\AssigneeTypes::class,
```

The provider returns Filament `MorphToSelect\Type` instances:

```php
namespace App\DataHealth;

use App\Models\Group;
use App\Models\User;
use Filament\Forms\Components\MorphToSelect\Type;

final class AssigneeTypes
{
    /** @return array<Type> */
    public function __invoke(): array
    {
        return [
            Type::make(User::class)->titleAttribute('name'),
            Type::make(Group::class)->titleAttribute('name'),
        ];
    }
}
```

The assign action then appears in panel and standalone tables and stores the selected model's morph type and ID. The provider must be an existing, invokable class and return only `Type` instances.

## Restrict assignee options

Use native Filament type configuration to restrict available records:

```php
use Illuminate\Database\Eloquent\Builder;

Type::make(User::class)
    ->titleAttribute('name')
    ->modifyOptionsQueryUsing(
        fn (Builder $query): Builder => $query->active(),
    );
```

Types also support search columns and custom labels. Restricting options improves usability but does not authorize who may assign findings.

## Link to affected models

The Model column identifies the affected record by class basename and ID. When a URL can be resolved, it links operators to that model's detail page.

Links work in panel and standalone tables. A deleted model or unresolved destination produces an unlinked label.

## Map models to named routes

Map model classes to application route names:

```php
use App\Models\Customer;
use App\Models\Order;

'model_view_routes' => [
    Customer::class => 'customers.show',
    Order::class => 'orders.show',
],
```

The model is passed as the first positional parameter:

```php
route('orders.show', [$order]);
```

Laravel binding may therefore use `{order}` or another model-specific parameter. Mappings may also use the stored morph type as a key. The route must exist and the model must still be available.

## Create a custom URL resolver

Use an invokable class when a fixed route map is insufficient:

```php
'model_view_url_resolver' => App\Support\GetModelViewUrl::class,
```

```php
namespace App\Support;

use App\Models\Order;
use Illuminate\Database\Eloquent\Model;

final class GetModelViewUrl
{
    public function __invoke(Model $model): ?string
    {
        return match (true) {
            $model instanceof Order => route('orders.show', [$model]),
            default => null,
        };
    }
}
```

Return a non-empty URL or `null`. Laravel's container creates the resolver, so constructor injection is available.

## Understand URL precedence

The package tries destinations in this order:

1. a valid named-route mapping for the model class or stored morph type;
2. the custom resolver; and
3. the current panel's model-resource view page.

The first usable URL wins. A mapping to a missing route falls through to the resolver or panel fallback. If the related model cannot be loaded, no URL is produced.

## Use the Filament resource fallback

Inside a panel, the final fallback asks that panel for the affected model's resource. It is used only when the resource has a `view` page and permits viewing the model.

The URL targets the current panel. Outside a panel there is no fallback, so standalone components need a named route or resolver for model links.

## Cache configuration safely

Use class names instead of closures:

```php
'assignee_types' => App\DataHealth\AssigneeTypes::class,
'model_view_url_resolver' => App\Support\GetModelViewUrl::class,
```

This keeps `php artisan config:cache` compatible. Runtime URL resolution accepts callables, but closures in configuration cannot be exported safely.

After changing cached configuration, rebuild the cache and restart long-running processes that may retain old values.

Continue with [Authorization](/filament/authorization/) to protect these capabilities, or [Standalone Components](/filament/standalone-components/) to embed configured tables outside a panel.
