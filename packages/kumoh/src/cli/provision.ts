import type { DeployState } from './config.ts';
import { log } from './log.ts';
import { wrangler } from './wrangler.ts';

export function parseJson<T>(raw: string, context: string): T {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`[kumoh] Failed to parse JSON from ${context}:\n${raw}`);
  }
}

export async function provisionD1(
  name: string,
  state: DeployState
): Promise<void> {
  if (state.d1) {
    log.ok(`D1 database "${name}" (${state.d1.slice(0, 8)}…) — exists`);
    return;
  }

  try {
    const info = parseJson<{ uuid: string }>(
      await wrangler(`d1 info ${name} --json`),
      'wrangler d1 info'
    );
    state.d1 = info.uuid;
    log.ok(`D1 database "${name}" (${info.uuid.slice(0, 8)}…) — found`);
  } catch {
    await wrangler(`d1 create ${name}`);
    const info = parseJson<{ uuid: string }>(
      await wrangler(`d1 info ${name} --json`),
      'wrangler d1 info'
    );
    state.d1 = info.uuid;
    log.ok(`D1 database "${name}" (${info.uuid.slice(0, 8)}…) — created`);
  }
}

export async function provisionKV(
  name: string,
  state: DeployState
): Promise<void> {
  if (state.kv) {
    log.ok(`KV namespace (${state.kv.slice(0, 8)}…) — exists`);
    return;
  }

  const list = parseJson<Array<{ id: string; title: string }>>(
    await wrangler('kv namespace list'),
    'wrangler kv namespace list'
  );
  const existing = list.find((ns) => ns.title === name);

  if (existing) {
    state.kv = existing.id;
    log.ok(`KV namespace (${existing.id.slice(0, 8)}…) — found`);
    return;
  }

  await wrangler(`kv namespace create ${name}`);
  const listAfter = parseJson<Array<{ id: string; title: string }>>(
    await wrangler('kv namespace list'),
    'wrangler kv namespace list'
  );
  const created = listAfter.find((ns) => ns.title === name);
  if (!created) {
    throw new Error(
      `[kumoh] KV namespace "${name}" was created but not found in namespace list`
    );
  }
  state.kv = created.id;
  log.ok(`KV namespace (${created.id.slice(0, 8)}…) — created`);
}

// R2 has no "get bucket info" API like D1/KV, so we just try to create
// and treat failure as "already exists"
export async function provisionR2(name: string): Promise<void> {
  try {
    await wrangler(`r2 bucket create ${name}`);
    log.ok(`R2 bucket "${name}" — created`);
  } catch {
    log.ok(`R2 bucket "${name}" — exists`);
  }
}

export async function provisionQueue(name: string): Promise<void> {
  try {
    await wrangler(`queues create ${name}`);
    log.ok(`Queue "${name}" — created`);
  } catch {
    log.ok(`Queue "${name}" — exists`);
  }
}
