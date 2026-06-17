import 'dotenv/config';
import { HubSpotAdapter } from './clients/HubSpotAdapter';
import { AirtableAdapter } from './clients/AirtableAdapter';
import { SyncEngine } from './sync/SyncEngine';
import { formatReport } from './sync/reportFormatter';

/** Entry point. Run with: npm start (requires .env — see .env.example). */
async function main(): Promise<void> {
  const requiredEnvVars = ['HUBSPOT_ACCESS_TOKEN', 'AIRTABLE_API_KEY', 'AIRTABLE_BASE_ID'];
  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    for (const key of missing) console.error(`  - ${key}`);
    console.error('\nCopy .env.example to .env and fill in your credentials before running.');
    process.exit(1);
  }

  const hubspot = new HubSpotAdapter(process.env.HUBSPOT_ACCESS_TOKEN!);
  const airtable = new AirtableAdapter(process.env.AIRTABLE_API_KEY!, process.env.AIRTABLE_BASE_ID!);
  const engine = new SyncEngine(hubspot, airtable);

  console.log('Starting HubSpot <-> Airtable sync...\n');

  try {
    const report = await engine.run();
    console.log(formatReport(report));
    process.exit(report.errors.length > 0 ? 1 : 0);
  } catch (err) {
    console.error('Sync run failed before completion:');
    console.error(err);
    process.exit(1);
  }
}

main();
