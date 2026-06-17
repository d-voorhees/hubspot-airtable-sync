import Airtable, { FieldSet, Record as AirtableRecord } from 'airtable';
import { SyncRecord } from '../types/SyncRecord';

/**
 * Thin adapter over the Airtable REST API.
 *
 * Airtable enforces 5 req/sec per base. The official client retries on
 * 429 with backoff, so this adapter relies on that rather than
 * reimplementing retry logic. It adds explicit pacing between bulk writes
 * so sync runs don't burn through the retry budget by bursting past the limit.
 */
export class AirtableAdapter {
  private base: ReturnType<Airtable['base']>;
  private table: string;

  constructor(apiKey: string, baseId: string, table = process.env.AIRTABLE_TABLE_NAME || 'Sync Records') {
    Airtable.configure({ apiKey });
    this.base = Airtable.base(baseId);
    this.table = table;
  }

  async fetchAll(): Promise<SyncRecord[]> {
    const records: SyncRecord[] = [];

    await this.base(this.table)
      .select({ pageSize: 100 })
      .eachPage((pageRecords, fetchNextPage) => {
        for (const record of pageRecords) {
          records.push(this.toSyncRecord(record));
        }
        fetchNextPage();
      });

    return records;
  }

  async create(record: SyncRecord): Promise<string> {
    const created = await this.base(this.table).create([
      { fields: this.toAirtableFields(record) },
    ]);
    return created[0].id;
  }

  async update(airtableId: string, record: SyncRecord): Promise<void> {
    await this.base(this.table).update([
      { id: airtableId, fields: this.toAirtableFields(record) },
    ]);
  }

  /**
   * Pace sequential writes against Airtable's 5 req/sec per-base limit.
   * Called between writes in a bulk loop in the sync engine rather than
   * baked into create/update, so single-record calls stay fast and the
   * pacing only kicks in where it is actually needed.
   */
  static async pace(): Promise<void> {
    const delayMs = process.env.AIRTABLE_PACE_MS ? Number(process.env.AIRTABLE_PACE_MS) : 210;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private toAirtableFields(record: SyncRecord): FieldSet {
    return {
      'External ID': record.externalId,
      Name: record.name,
      Email: record.email ?? '',
      Company: record.company ?? '',
      Status: record.status ?? '',
      Notes: record.notes ?? '',
    };
  }

  private toSyncRecord(record: AirtableRecord<FieldSet>): SyncRecord {
    return {
      externalId: (record.get('External ID') as string) ?? record.id,
      airtableId: record.id,
      name: (record.get('Name') as string) ?? '',
      email: record.get('Email') as string | undefined,
      company: record.get('Company') as string | undefined,
      status: record.get('Status') as string | undefined,
      notes: record.get('Notes') as string | undefined,
      airtableModifiedAt: record.get('Last Modified')
        ? new Date(record.get('Last Modified') as string)
        : undefined,
    };
  }
}
