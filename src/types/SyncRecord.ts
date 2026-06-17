export interface SyncRecord {
  /** Stable identifier used to match records across platforms. */
  externalId: string;

  /** Platform-specific record id, set once a record exists on that side. */
  hubspotId?: string;
  airtableId?: string;

  /** Core fields kept in sync. Extend this as the schema grows. */
  name: string;
  email?: string;
  company?: string;
  status?: string;
  notes?: string;

  /** Last time this record was modified, used for conflict resolution. */
  hubspotModifiedAt?: Date;
  airtableModifiedAt?: Date;
}


export interface SyncResult {
  externalId: string;
  action: 'created' | 'updated' | 'skipped' | 'conflict-resolved' | 'error';
  platform: 'hubspot' | 'airtable';
  detail: string;
}

export interface SyncReport {
  startedAt: Date;
  finishedAt: Date;
  results: SyncResult[];
  errors: SyncResult[];
}
