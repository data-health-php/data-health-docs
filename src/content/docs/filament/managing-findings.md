---
title: Managing Findings
description: Search, inspect, assign, verify, resolve, ignore, and reopen finding records.
---

The Finding records resource turns persisted Data Health occurrences into an operator workflow with filtering, context, model links, and lifecycle actions.

## Contents

- [The finding records resource](#the-finding-records-resource)
- [Search and filter records](#search-and-filter-records)
- [View finding details](#view-finding-details)
- [Open the affected model](#open-the-affected-model)
- [Assign a finding](#assign-a-finding)
- [Verify a finding](#verify-a-finding)
- [Resolve a finding](#resolve-a-finding)
- [Mark a finding as resolved](#mark-a-finding-as-resolved)
- [Ignore and reopen findings](#ignore-and-reopen-findings)
- [Use bulk actions](#use-bulk-actions)
- [Understand action availability](#understand-action-availability)
- [Finding statistics](#finding-statistics)
- [Poll for updates](#poll-for-updates)

## The finding records resource

Registering `DataHealthPlugin` adds a resource backed by `DataHealth\Models\FindingRecord`. Its navigation badge shows the number of active records and disappears when the count is zero.

The table defaults to active findings and sorts by `last_detected_at` in descending order, bringing recently observed problems to the top.

Columns include:

- finding key;
- lifecycle status;
- urgency;
- affected model type and ID;
- worklist; and
- last detection time.

Urgency, worklist, and last detection columns are toggleable so operators can simplify the table for their workflow.

## Search and filter records

The table supports text search over the finding key, affected model label, and worklist. It also provides select filters for:

- status;
- urgency;
- finding key; and
- worklist.

The status filter defaults to `active`. Clear or change it to inspect ignored and resolved history.

Finding and worklist filter options come from values currently stored in finding records. A renamed class description does not affect these options; a changed key or worklist appears only after records using the new value exist.

## View finding details

Open a resource record to see its full infolist. The page displays:

- finding key and current class description;
- status, urgency, and worklist;
- first and last detection timestamps;
- affected model type and ID; and
- copyable JSON context.

When the finding implements verification or resolution, the page includes sections describing and invoking those capabilities. Method-level `Description` attributes supply the displayed explanation, with a generic fallback when no description exists.

The detail page also exposes **Mark as resolved** and **Ignore** for active records, plus assignment and reopen actions where applicable.

## Open the affected model

The Model column becomes a link when the package can produce a destination for the affected model. Resolution follows this order:

1. a configured named route for the model class or morph type;
2. a configured custom URL resolver; or
3. the current panel's resource view page, when that resource exists and permits viewing the model.

If the model was deleted or no destination can be resolved, the label remains unlinked.

See [Configuration and Model Links](/data-health-docs/filament/configuration-and-model-links/) for route maps and resolvers.

## Assign a finding

The assign action is hidden until `assignee_types` is configured. Once enabled, operators can select one of the permitted polymorphic model types and records, such as a user or team.

The action stores `assignee_type` and `assignee_id` on the finding record. Submitting no assignee clears the current assignment.

Assignment does not change finding status, urgency, or worklist. It identifies who owns the individual occurrence, while worklist groups occurrences into a broader operational queue.

Configure available assignee models and option restrictions in [Configuration and Model Links](/data-health-docs/filament/configuration-and-model-links/#configure-assignees).

## Verify a finding

Verification appears for active records whose finding implements `CanVerify`. Running it delegates to the core Data Health manager:

- `true` marks the action successful and the record resolved;
- `false` reports that the finding still applies and leaves it active; and
- an exception leaves the status unchanged and follows the application's exception handling.

Verification is intended to recheck current data without changing it. See [Verifying Findings](/data-health-docs/guides/verifying-findings/) for implementation patterns.

## Resolve a finding

Resolution appears for active records whose finding implements `CanResolve`. It requires confirmation because the resolver may modify application or external data.

- `true` shows success and marks the record resolved;
- `false` reports that the finding could not be resolved and leaves it active; and
- an exception leaves the status unchanged and propagates through the application.

The confirmation dialog uses the resolver method description when available, so finding authors should describe the changes operators are authorizing.

See [Resolving Findings](/data-health-docs/guides/resolving-findings/) for safe, idempotent resolver design.

## Mark a finding as resolved

The detail page allows an active finding to be marked resolved without running verification or resolution.

Use this when an operator knows the issue has been handled but the finding has no supported action, or when the external correction cannot be verified automatically.

This action changes only the finding-record status; it does not inspect or modify the affected model. If detection observes the same identity again, Data Health reactivates the record.

## Ignore and reopen findings

Ignoring an active finding sets its status to `ignored`. Future detection refreshes `last_detected_at` but leaves that occurrence ignored.

Use ignore for an intentionally accepted exception, not a temporary postponement. Because identity includes context, ignoring one occurrence does not ignore other contexts or models using the same finding class.

Reopen changes an ignored or resolved record back to `active`. It does not rerun detection, verification, or resolution.

## Use bulk actions

The table toolbar includes bulk **Ignore** and **Reopen** actions. They update each selected record and then clear the selection.

Bulk ignore requires confirmation. Before applying it, narrow the table with status, key, urgency, or worklist filters so the selected set is intentional.

Bulk status changes do not execute finding-specific code. They are administrative lifecycle operations.

## Understand action availability

| Action | Available when |
| --- | --- |
| Assign | Assignee types are configured. |
| Verify | Record is active and the finding implements `CanVerify`. |
| Resolve | Record is active and the finding implements `CanResolve`. |
| Mark as resolved | Record is active and viewed on its detail page. |
| Ignore | Record is active. |
| Reopen | Record is ignored or resolved. |

If a stored key can no longer reconstruct its finding class, capability-specific actions and descriptions are unavailable. Restore discovery compatibility or migrate the record keys rather than operating on the wrong finding type.

## Finding statistics

The registered overview widget shows:

| Statistic | Count |
| --- | --- |
| Active findings | All records with active status |
| Immediate | Active records with immediate urgency |
| Resolved | All resolved records |
| Ignored | All ignored records |

These are global counts over the finding-record table. They are not automatically scoped by panel, tenant, worklist, or assignee.

## Poll for updates

Widget polling is disabled by default. Configure a Filament polling interval to refresh the statistics automatically:

```php
// config/data-health-filament.php

'polling_interval' => '10s',
```

Set it to `null` to keep polling disabled. Choose an interval that balances freshness with the cost of running four count queries repeatedly.

Continue with [Finding Types and Detection](/data-health-docs/filament/finding-types-and-detection/) to run detection manually, or [Authorization](/data-health-docs/filament/authorization/) before granting operator access.
