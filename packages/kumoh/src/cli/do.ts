import { defineCommand } from 'citty';

import { scanObjects } from '../server/scanner.ts';
import { loadConfig, root, saveConfig } from './config.ts';
import { buildDoMigrations } from './do-migrations.ts';
import { log } from './log.ts';

const migrate = defineCommand({
  meta: {
    name: 'migrate',
    description:
      'Generate Durable Object migrations by comparing current classes against deployment history',
  },
  args: {
    ci: {
      type: 'boolean',
      default: false,
      description: 'Non-interactive mode for CI environments',
    },
  },
  async run(ctx) {
    const config = await loadConfig();
    const state = config.state ?? {};
    const scanned = scanObjects(root, 'app/objects');

    if (!scanned.length) {
      log.ok('No Durable Objects found in app/objects/');
      return;
    }

    const before = JSON.stringify(state.migrations ?? []);
    await buildDoMigrations(
      scanned.map((o) => o.className),
      state,
      ctx.args.ci
    );
    const after = JSON.stringify(state.migrations ?? []);

    if (before === after) {
      log.ok('DO migrations up to date — no changes detected');
      return;
    }

    config.state = state;
    await saveConfig(config);
    log.ok('Saved DO migrations to kumoh.json');
  },
});

export const doCmd = defineCommand({
  meta: { name: 'do', description: 'Durable Object commands' },
  subCommands: { migrate },
});
