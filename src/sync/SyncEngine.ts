import { HubSpotAdapter } from '../clients/HubSpotAdapter';
import { AirtableAdapter } from '../clients/AirtableAdapter';
import { SyncRecord, SyncResult, SyncReport } from '../types/SyncRecord';

/**
 * Two-way sync engine between HubSpot and Airtable.
 *
 * Conflict resolution: most recently modified record wins. When neither
 * side has a modified timestamp, HubSpot is treated as the system of
 * record. Every decision is written to a SyncReport so runs are
 * auditable after the fact.
 */
export class SyncEngine {
  constructor(
    private hubspot: HubSpotAdapter,
    private airtable: AirtableAdapter,
  ) {}

  async run(): Promise<SyncReport> {
    const startedAt = new Date();
    const results: SyncResult[] = [];

    const [hubspotRecords, airtableRecords] = await Promise.all([
      this.hubspot.fetchAll(),
      this.airtable.fetchAll(),
    ]);

    const merged = this.indexByExternalId(hubspotRecords, airtableRecords);

    for (const [externalId, pair] of merged) {
      const batchResults = await this.reconcile(externalId, pair.hubspot, pair.airtable);
      results.push(...batchResults);
      const wroteToAirtable = batchResults.some(
        (r) => r.platform === 'airtable' && (r.action === 'created' || r.action === 'updated' || r.action === 'conflict-resolved'),
      );
      if (wroteToAirtable) {
        await AirtableAdapter.pace();
      }
    }

    const finishedAt = new Date();
    const errors = results.filter((r) => r.action === 'error');

    return { startedAt, finishedAt, results, errors };
  }

  /** Build a map of externalId to whatever record exists on each side, if any. */
  private indexByExternalId(
    hubspotRecords: SyncRecord[],
    airtableRecords: SyncRecord[],
  ): Map<string, { hubspot?: SyncRecord; airtable?: SyncRecord }> {
    const map = new Map<string, { hubspot?: SyncRecord; airtable?: SyncRecord }>();

    for (const record of hubspotRecords) {
      map.set(record.externalId, { hubspot: record });
    }

    for (const record of airtableRecords) {
      const existing = map.get(record.externalId);
      if (existing) {
        existing.airtable = record;
      } else {
        map.set(record.externalId, { airtable: record });
      }
    }

    return map;
  }

  private async reconcile(
    externalId: string,
    hubspotRecord: SyncRecord | undefined,
    airtableRecord: SyncRecord | undefined,
  ): Promise<SyncResult[]> {
    if (hubspotRecord && !airtableRecord) {
      return this.createOnAirtable(externalId, hubspotRecord);
    }

    if (airtableRecord && !hubspotRecord) {
      return this.createOnHubSpot(externalId, airtableRecord);
    }

    if (hubspotRecord && airtableRecord) {
      return this.reconcileBothSides(externalId, hubspotRecord, airtableRecord);
    }

    return [];
  }

  private async createOnAirtable(externalId: string, source: SyncRecord): Promise<SyncResult[]> {
    try {
      const airtableId = await this.airtable.create(source);
      return [
        {
          externalId,
          action: 'created',
          platform: 'airtable',
          detail: `Created in Airtable (id ${airtableId}) from HubSpot record.`,
        },
      ];
    } catch (err) {
      return [this.errorResult(externalId, 'airtable', err)];
    }
  }

  private async createOnHubSpot(externalId: string, source: SyncRecord): Promise<SyncResult[]> {
    try {
      const hubspotId = await this.hubspot.create(source);
      return [
        {
          externalId,
          action: 'created',
          platform: 'hubspot',
          detail: `Created in HubSpot (id ${hubspotId}) from Airtable record.`,
        },
      ];
    } catch (err) {
      return [this.errorResult(externalId, 'hubspot', err)];
    }
  }

  private async reconcileBothSides(
    externalId: string,
    hubspotRecord: SyncRecord,
    airtableRecord: SyncRecord,
  ): Promise<SyncResult[]> {
    if (this.recordsAreEquivalent(hubspotRecord, airtableRecord)) {
      return [
        {
          externalId,
          action: 'skipped',
          platform: 'hubspot',
          detail: 'No differences detected between platforms.',
        },
      ];
    }

    const winner = this.determineWinner(hubspotRecord, airtableRecord);

    try {
      if (winner === 'hubspot') {
        await this.airtable.update(airtableRecord.airtableId!, hubspotRecord);
        return [
          {
            externalId,
            action: 'conflict-resolved',
            platform: 'airtable',
            detail: 'HubSpot record was more recently modified. Airtable updated to match.',
          },
        ];
      } else {
        await this.hubspot.update(hubspotRecord.hubspotId!, airtableRecord);
        return [
          {
            externalId,
            action: 'conflict-resolved',
            platform: 'hubspot',
            detail: 'Airtable record was more recently modified. HubSpot updated to match.',
          },
        ];
      }
    } catch (err) {
      return [this.errorResult(externalId, winner, err)];
    }
  }

  /** Most recent modified timestamp wins. HubSpot wins when neither side has a timestamp. */
  private determineWinner(hubspotRecord: SyncRecord, airtableRecord: SyncRecord): 'hubspot' | 'airtable' {
    const hubspotTime = hubspotRecord.hubspotModifiedAt?.getTime();
    const airtableTime = airtableRecord.airtableModifiedAt?.getTime();

    if (hubspotTime === undefined && airtableTime === undefined) {
      return 'hubspot';
    }
    if (hubspotTime === undefined) {
      return 'airtable';
    }
    if (airtableTime === undefined) {
      return 'hubspot';
    }

    return hubspotTime >= airtableTime ? 'hubspot' : 'airtable';
  }

  private recordsAreEquivalent(a: SyncRecord, b: SyncRecord): boolean {
    return (
      a.name === b.name &&
      (a.email ?? '') === (b.email ?? '') &&
      (a.company ?? '') === (b.company ?? '') &&
      (a.status ?? '') === (b.status ?? '') &&
      (a.notes ?? '') === (b.notes ?? '')
    );
  }

  private errorResult(externalId: string, platform: 'hubspot' | 'airtable', err: unknown): SyncResult {
    const message = err instanceof Error ? err.message : String(err);
    return {
      externalId,
      action: 'error',
      platform,
      detail: `Sync failed: ${message}`,
    };
  }
}
