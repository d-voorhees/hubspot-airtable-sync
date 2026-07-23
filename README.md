# HubSpot ↔ Airtable Sync

Two-way sync between HubSpot custom objects and Airtable, written in TypeScript. Handles conflict resolution when both sides have changed since the last run, paces writes against Airtable's rate limit, and outputs a per-record audit log every time it runs.

For the reasoning behind the design decisions, the mistakes I made, and the rejected alternatives, see the writeup: [Building a Two-Way HubSpot to Airtable Sync for Custom Objects](https://dvoorhees.com/2026/06/20/building-a-two-way-hubspot-to-airtable-sync-for-custom-objects/).

## What it does

- Two-way sync between HubSpot custom objects and Airtable. Standard object types like contacts and companies are covered too, but the custom object case is the point
- Explicit conflict resolution when a record changed on both sides between runs. Most-recently-modified wins. HubSpot is the fallback system of record when neither side has a timestamp
- Pacing tuned to Airtable's five-requests-per-second per-base limit, applied only in bulk write loops so single-record operations stay fast
- A per-record audit report on every run: created, updated, skipped, conflict resolved, or errored, with the reason attached to each entry
- Errors on individual records surface as data in the report, so one bad write does not stop a full sync run
- Unit tests covering the conflict resolution logic against fake adapters, deterministic, credential-free, run in under a second

## How it is structured

```
src/
  types/SyncRecord.ts       Platform-neutral record shape
  clients/
    HubSpotAdapter.ts       HubSpot API translation and pagination
    AirtableAdapter.ts      Airtable API translation and rate-limit pacing
  sync/
    SyncEngine.ts           Conflict resolution and orchestration
    reportFormatter.ts      Human-readable audit output
  index.ts                  CLI entry point
```

Neither adapter's field mapping or API quirks leak into the sync engine. The engine only ever compares `SyncRecord` objects. Adding a third platform later would mean writing another adapter. The conflict resolution logic stays untouched.

## Setup

Copy `.env.example` to `.env` and fill in three values:

- `HUBSPOT_ACCESS_TOKEN`: from a HubSpot private app with CRM object permissions
- `AIRTABLE_API_KEY`: a personal access token with `data.records:read` and `data.records:write` on the target base
- `AIRTABLE_BASE_ID`: from the base's API documentation page

You will also need matching schemas on both sides:

- **HubSpot custom object** with these properties: `external_id`, `name`, `email`, `company`, `status`, `notes`
- **Airtable table** with matching fields (`External ID`, `Name`, `Email`, `Company`, `Status`, `Notes`) and a `Last Modified` field for timestamp comparison

The `external_id` field is the shared key that links a record across both platforms. Whatever creates a record first is responsible for assigning a stable identifier.

## Run it

```bash
npm install
npm start
```

The CLI exits with `0` on a clean run and `1` if any records errored, so it is safe to wire into a scheduled job that needs a binary success signal.

## Tests

```bash
npm test
```

Tests run against fake adapters. The real HubSpot and Airtable APIs are never called during a test run. The suite covers the conflict resolution rules directly: creates on the correct side when a record only exists on one, skips when both sides match, resolves conflicts in favor of the newer timestamp on either side, falls back to HubSpot when neither side has a timestamp, and records a failed write as a result without throwing.

## Typecheck

```bash
npm run typecheck
```

## What this is

A focused sync engine, deliberately scoped. The full audit log design, the timestamp-based conflict rule, and the adapter isolation are documented choices explained in the [blog post](https://dvoorhees.com/2026/06/20/building-a-two-way-hubspot-to-airtable-sync-for-custom-objects/).

Field-level merging within a single conflicting record is out of scope. So is a scheduler or webhook listener. Both are reasonable next steps for a more general-purpose tool. This project's scope is the two things most no-code connectors get wrong: reaching custom objects at full fidelity and resolving conflicts on a defensible rule.

## License

MIT.
