import type { DeployState, DoMigrationEntry } from './config.ts';
import { log } from './log.ts';
import { confirm } from './prompt.ts';

export async function buildDoMigrations(
  currentClasses: string[],
  state: DeployState,
  ci: boolean
): Promise<void> {
  const history = state.migrations ?? [];

  // Compute currently deployed set (add new_classes, remove deleted/renamed-from)
  const deployed = new Set<string>();
  for (const entry of history) {
    for (const c of entry.new_classes ?? []) {
      deployed.add(c);
    }
    for (const c of entry.deleted_classes ?? []) {
      deployed.delete(c);
    }
    for (const r of entry.renamed_classes ?? []) {
      deployed.delete(r.from);
      deployed.add(r.to);
    }
  }

  const current = new Set(currentClasses);
  const added = currentClasses.filter((c) => !deployed.has(c));
  const removed = [...deployed].filter((c) => !current.has(c));

  if (!added.length && !removed.length) {
    return;
  }

  const nextTag = `v${history.length + 1}`;
  const entry: DoMigrationEntry = { tag: nextTag };

  if (added.length) {
    entry.new_classes = added;
  }

  if (removed.length) {
    if (ci) {
      entry.deleted_classes = removed;
      for (const c of removed) {
        log.warn(`Durable Object "${c}" removed — deleted in CI mode`);
      }
    } else {
      const renames: Array<{ from: string; to: string }> = [];
      const deletions: string[] = [];

      for (const cls of removed) {
        const candidates = added.filter(
          (a) => !renames.some((r) => r.to === a)
        );
        if (candidates.length === 1) {
          const isRename = await confirm(
            `Was "${cls}" renamed to "${candidates[0]}"?`
          );
          if (isRename) {
            renames.push({ from: cls, to: candidates[0] });
            // Move from new_classes to renamed_classes
            entry.new_classes = (entry.new_classes ?? []).filter(
              (c) => c !== candidates[0]
            );
            continue;
          }
        }
        const shouldDelete = await confirm(
          `"${cls}" was removed. Delete from Cloudflare? (destroys all storage for this class)`
        );
        if (shouldDelete) {
          deletions.push(cls);
        } else {
          log.warn(
            `"${cls}" kept in wrangler migrations but no longer in app/objects/ — handle manually if needed`
          );
        }
      }

      if (renames.length) {
        entry.renamed_classes = renames;
      }
      if (deletions.length) {
        entry.deleted_classes = deletions;
      }
    }
  }

  const isNoop =
    !entry.new_classes?.length &&
    !entry.deleted_classes?.length &&
    !entry.renamed_classes?.length;

  if (!isNoop) {
    state.migrations = [...history, entry];
    const add = entry.new_classes ?? [];
    const del = entry.deleted_classes ?? [];
    const ren = (entry.renamed_classes ?? []).map((r) => `${r.from}→${r.to}`);
    const parts = [
      add.length ? `+[${add.join(', ')}]` : '',
      ren.length ? `~[${ren.join(', ')}]` : '',
      del.length ? `-[${del.join(', ')}]` : '',
    ].filter(Boolean);
    log.ok(`DO migrations (${nextTag}): ${parts.join(' ')}`);
  }
}
