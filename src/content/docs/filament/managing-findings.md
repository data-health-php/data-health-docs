---
title: Managing Findings
description: Search, inspect, assign, verify, resolve, ignore, and reopen finding records.
---

The **Finding records** resource displays persisted `FindingRecord` occurrences. It defaults to active findings, sorted by most recent detection. Its navigation badge shows the active count and disappears at zero.

## Search and inspect records

Search by finding key, affected model label, or worklist. Filters cover status, urgency, finding key, and worklist; change or clear the active-status filter to see resolved and ignored records. Finding-key and worklist options come from stored records.

The table shows key, status, urgency, model, worklist, and last detection time. Urgency, worklist, and last detection columns can be toggled.

Open a record for its description, first and last detection times, and copyable JSON context. Verification and resolution sections use method-level `Description` attributes when available.

The Model column links to the affected record when a destination can be resolved. Configure destinations in [Configuration and Model Links](/data-health-docs/filament/configuration-and-model-links/).

## Record actions

| Action | Available when | Effect |
| --- | --- | --- |
| Assign | Assignee types are configured | Sets the occurrence's assignee; an empty selection clears it. |
| Verify | Active; finding implements `CanVerify` | Rechecks the problem and resolves the record on success. |
| Resolve | Active; finding implements `CanResolve` | Runs the resolver after confirmation and resolves the record on success. |
| Mark as resolved | Active; detail page only | Updates status without running verification or resolution. |
| Ignore | Active | Suppresses this occurrence across future detection runs. |
| Reopen | Ignored or resolved | Returns the record to active without rerunning finding code. |

Assignment identifies ownership of an individual occurrence and leaves status, urgency, and worklist unchanged. Enable it through [assignee configuration](/data-health-docs/filament/configuration-and-model-links/#configure-assignees).

Verification and resolution delegate to the core manager. Returning `true` resolves the record; `false` leaves it active and reports failure. Exceptions leave the status unchanged and follow application error handling. Resolution may change application or external data, so its confirmation dialog displays the resolver's method description when supplied.

For implementation details, see [Verifying Findings](/data-health-docs/guides/verifying-findings/) and [Resolving Findings](/data-health-docs/guides/resolving-findings/).

If detection observes a manually resolved occurrence again, it reactivates it. Ignored occurrences remain ignored while their last-detected time refreshes. Ignore applies to one finding identity, including its model and context. See [Findings and Records](/data-health-docs/core-concepts/findings-and-records/) for lifecycle details.

If a stored key can no longer reconstruct its finding class, capability-specific actions and descriptions are unavailable. Check discovery and key compatibility.

## Bulk actions

The table provides bulk **Ignore** and **Reopen**. Bulk ignore requires confirmation. These actions update selected records' statuses without executing finding-specific code, then clear the selection.

## Statistics

The overview widget counts all active, immediate-active, resolved, and ignored records. Counts are global, independent of table filters, panel, tenant, worklist, or assignee.

Polling is disabled by default. Enable it in [configuration](/data-health-docs/filament/configuration-and-model-links/#configure-statistics-polling) if statistics should refresh automatically.
