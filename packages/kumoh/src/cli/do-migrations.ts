import type { DeployState, DoMigrationEntry } from './config.ts';
import { log } from './log.ts';
import { confirm } from './prompt.ts';

/**
 * Score similarity between two class names (0–1).
 * Uses longest common substring ratio.
 */
function nameSimilarity(a: string, b: string): number {
  const lower = a.toLowerCase();
  const target = b.toLowerCase();
  let longest = 0;

  for (let i = 0; i < lower.length; i++) {
    for (let j = 0; j < target.length; j++) {
      let k = 0;
      while (
        i + k < lower.length &&
        j + k < target.length &&
        lower[i + k] === target[j + k]
      ) {
        k++;
      }
      if (k > longest) {
        longest = k;
      }
    }
  }

  return longest / Math.max(a.length, b.length);
}

/**
 * Auto-match removed classes to added classes by name similarity.
 * Returns best matches above the threshold (default 0.4).
 */
function matchRenames(
  removed: string[],
  added: string[]
): Array<{ from: string; to: string; score: number }> {
  if (!removed.length || !added.length) {
    return [];
  }

  // Single removal + single addition → high-confidence rename
  if (removed.length === 1 && added.length === 1) {
    return [{ from: removed[0], to: added[0], score: 1 }];
  }

  // Multiple: score all pairs and greedily match best
  const pairs: Array<{ from: string; to: string; score: number }> = [];
  for (const r of removed) {
    for (const a of added) {
      const score = nameSimilarity(r, a);
      if (score >= 0.4) {
        pairs.push({ from: r, to: a, score });
      }
    }
  }

  pairs.sort((a, b) => b.score - a.score);

  const usedFrom = new Set<string>();
  const usedTo = new Set<string>();
  const matches: typeof pairs = [];

  for (const pair of pairs) {
    if (!usedFrom.has(pair.from) && !usedTo.has(pair.to)) {
      matches.push(pair);
      usedFrom.add(pair.from);
      usedTo.add(pair.to);
    }
  }

  return matches;
}

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
    entry.new_classes = [...added];
  }

  if (removed.length) {
    const suggestedRenames = matchRenames(removed, added);
    const renames: Array<{ from: string; to: string }> = [];
    const deletions: string[] = [];

    if (ci) {
      // In CI: auto-apply single-pair renames, delete the rest
      for (const match of suggestedRenames) {
        if (match.score >= 1) {
          renames.push({ from: match.from, to: match.to });
          log.ok(
            `Durable Object "${match.from}" → "${match.to}" (auto-renamed)`
          );
        }
      }
      const renamed = new Set(renames.map((r) => r.from));
      for (const cls of removed) {
        if (!renamed.has(cls)) {
          deletions.push(cls);
          log.warn(`Durable Object "${cls}" removed — deleted in CI mode`);
        }
      }
    } else {
      const handled = new Set<string>();

      // Present auto-matched renames first
      for (const match of suggestedRenames) {
        const isRename = await confirm(
          `"${match.from}" → "${match.to}"? (rename)`
        );
        if (isRename) {
          renames.push({ from: match.from, to: match.to });
          handled.add(match.from);
        }
      }

      // Handle remaining removals
      for (const cls of removed) {
        if (handled.has(cls)) {
          continue;
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
    }

    // Move renamed targets out of new_classes into renamed_classes
    if (renames.length) {
      const renamedTargets = new Set(renames.map((r) => r.to));
      entry.new_classes = (entry.new_classes ?? []).filter(
        (c) => !renamedTargets.has(c)
      );
      entry.renamed_classes = renames;
    }
    if (deletions.length) {
      entry.deleted_classes = deletions;
    }
  }

  // Clean up empty arrays
  if (!entry.new_classes?.length) {
    delete entry.new_classes;
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
