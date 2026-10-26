---
title: Configuration and Model Links
description: Configure Filament navigation, polling, assignees, and affected-model destinations.
---

## Configuration defaults

Publish `config/data-health-filament.php` when customization is needed:

```bash
php artisan vendor:publish --tag=data-health-filament-config
```

The defaults apply to all panels and standalone components:

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

## Configure navigation

```php
'navigation_group' => 'Operations',
'navigation_sort' => 50,
```

Finding records uses the configured sort position; Finding types uses the next position. Filament controls the group's placement relative to other groups.

## Configure statistics polling

Polling is disabled by default. Set a Filament-compatible interval to refresh statistics:

```php
'polling_interval' => '10s',
```

Each refresh runs four count queries. Choose an interval appropriate for the dataset, or use `null` to disable polling.

## Configure assignees

Assignment is hidden until `assignee_types` names an invokable provider returning Filament `MorphToSelect\Type` instances:

```php
'assignee_types' => App\DataHealth\AssigneeTypes::class,
```

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

To restrict available records, configure the type's options query:

```php
use Illuminate\Database\Eloquent\Builder;

Type::make(User::class)
    ->titleAttribute('name')
    ->modifyOptionsQueryUsing(
        fn (Builder $query): Builder => $query->active(),
    );
```

Types also support search columns and custom labels. Assigning stores the selected model's morph type and ID on the finding record.

## Link to affected models

The Model column links to the affected record using the first usable destination:

1. a named-route mapping for the model class or stored morph type;
2. a custom URL resolver;
3. the current panel's model-resource view page, if it exists and permits viewing the record.

Missing routes fall through to the next option. Deleted models or unresolved destinations remain unlinked. Outside a panel, configure a route or resolver because the resource fallback is unavailable.

### Map models to named routes

```php
use App\Models\Customer;
use App\Models\Order;

'model_view_routes' => [
    Customer::class => 'customers.show',
    Order::class => 'orders.show',
],
```

Mappings also accept stored morph types as keys. The model is passed as the first positional parameter, equivalent to `route('orders.show', [$order])`.

### Create a custom URL resolver

For destinations beyond a fixed route map, configure an invokable class:

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

## Cache configuration safely

Use class names for providers and resolvers. Closures in configuration are incompatible with `php artisan config:cache`.

After changing cached configuration, rebuild the cache and restart long-running processes that retain old values.
