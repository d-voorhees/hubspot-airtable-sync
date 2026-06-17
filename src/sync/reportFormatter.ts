import { SyncReport } from '../types/SyncRecord';

export function formatReport(report: SyncReport): string {
  const durationMs = report.finishedAt.getTime() - report.startedAt.getTime();
  const lines: string[] = [];

  lines.push('Sync run complete');
  lines.push(`Started:  ${report.startedAt.toISOString()}`);
  lines.push(`Finished: ${report.finishedAt.toISOString()}`);
  lines.push(`Duration: ${durationMs}ms`);
  lines.push('');

  const byAction = groupBy(report.results, (r) => r.action);

  for (const action of ['created', 'updated', 'conflict-resolved', 'skipped', 'error'] as const) {
    const group = byAction[action] ?? [];
    if (group.length === 0) continue;

    lines.push(`${action.toUpperCase()} (${group.length})`);
    for (const result of group) {
      lines.push(`  [${result.platform}] ${result.externalId}: ${result.detail}`);
    }
    lines.push('');
  }

  if (report.errors.length > 0) {
    lines.push(`WARNING: ${report.errors.length} record(s) failed to sync. Review above and rerun.`);
  }

  return lines.join('\n');
}

function groupBy<T, K extends string>(items: T[], keyFn: (item: T) => K): Partial<Record<K, T[]>> {
  const result: Partial<Record<K, T[]>> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key]!.push(item);
  }
  return result;
}
