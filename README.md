# HubSpot &lt;-&gt; Airtable Sync

Two-way sync between HubSpot custom objects and Airtable. Handles conflict resolution (most-recently-modified wins, HubSpot as fallback system of record), rate limit pacing on the Airtable side, and outputs a per-record report on every run.

## Setup

Requires a `.env` file — copy `.env.example` and fill in `HUBSPOT_ACCESS_TOKEN`, `AIRTABLE_API_KEY`, and `AIRTABLE_BASE_ID`.

You'll also need:
- HubSpot: a custom object with `external_id`, `name`, `email`, `company`, `status`, `notes` properties
- Airtable: a table with matching fields and a `Last Modified` field

The `external_id` is the shared key that links a record across both platforms.

```bash
npm install
npm start
```

## Typecheck

```bash
npm run typecheck
```
