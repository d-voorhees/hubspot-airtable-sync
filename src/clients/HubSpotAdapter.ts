import { Client } from '@hubspot/api-client';
import { SyncRecord } from '../types/SyncRecord';

/** Thin adapter over the HubSpot custom objects API. Isolates all HubSpot-specific field naming and API quirks so the sync engine stays platform-agnostic. */
export class HubSpotAdapter {
  private client: Client;
  private objectType: string;

  constructor(accessToken: string, objectType = process.env.HUBSPOT_OBJECT_TYPE || '2-SYNC_OBJECT_ID') {
    this.client = new Client({ accessToken });
    this.objectType = objectType;
  }

  async fetchAll(): Promise<SyncRecord[]> {
    const records: SyncRecord[] = [];
    let after: string | undefined = undefined;

    do {
      const page = await this.client.crm.objects.basicApi.getPage(
        this.objectType,
        100,
        after,
        ['external_id', 'name', 'email', 'company', 'status', 'notes'],
      );

      for (const obj of page.results) {
        records.push(this.toSyncRecord(obj));
      }

      after = page.paging?.next?.after;
    } while (after);

    return records;
  }

  async create(record: SyncRecord): Promise<string> {
    const response = await this.client.crm.objects.basicApi.create(this.objectType, {
      properties: this.toHubSpotProperties(record),
    });
    return response.id;
  }

  async update(hubspotId: string, record: SyncRecord): Promise<void> {
    await this.client.crm.objects.basicApi.update(this.objectType, hubspotId, {
      properties: this.toHubSpotProperties(record),
    });
  }

  private toHubSpotProperties(record: SyncRecord): Record<string, string> {
    return {
      external_id: record.externalId,
      name: record.name,
      email: record.email ?? '',
      company: record.company ?? '',
      status: record.status ?? '',
      notes: record.notes ?? '',
    };
  }

  private toSyncRecord(obj: {
    id: string;
    properties: Record<string, string | null | undefined>;
    updatedAt?: Date | string;
  }): SyncRecord {
    return {
      externalId: obj.properties.external_id ?? obj.id,
      hubspotId: obj.id,
      name: obj.properties.name ?? '',
      email: obj.properties.email ?? undefined,
      company: obj.properties.company ?? undefined,
      status: obj.properties.status ?? undefined,
      notes: obj.properties.notes ?? undefined,
      hubspotModifiedAt: obj.updatedAt ? new Date(obj.updatedAt) : undefined,
    };
  }
}
