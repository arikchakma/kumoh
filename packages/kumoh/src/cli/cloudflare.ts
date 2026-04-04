import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const CF_API = 'https://api.cloudflare.com/client/v4';

type CfResponse<T> = {
  success: boolean;
  result: T;
  errors: Array<{ code: number; message: string }>;
};

// Locate wrangler's stored config file (mirrors xdg-app-paths logic wrangler uses).
function wranglerConfigPath(): string {
  const appName = '.wrangler';
  let xdgConfig: string;
  if (platform() === 'darwin') {
    xdgConfig = join(homedir(), 'Library', 'Preferences');
  } else if (platform() === 'win32') {
    xdgConfig = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
  } else {
    xdgConfig = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  }
  return join(xdgConfig, appName, 'config', 'default.toml');
}

// Read the token wrangler already has stored — avoids needing a separate
// CLOUDFLARE_API_TOKEN env var when the user has already run `wrangler login`.
function readWranglerToken(): string | null {
  const configPath = wranglerConfigPath();
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');

    const expiryMatch = content.match(/^expiration_time\s*=\s*"([^"]+)"/m);
    if (expiryMatch && new Date(expiryMatch[1]) < new Date()) {
      console.error(
        '\n  Wrangler OAuth token has expired. Run: wrangler login'
      );
      process.exit(1);
    }

    const oauthMatch = content.match(/^oauth_token\s*=\s*"([^"]+)"/m);
    if (oauthMatch) {
      return oauthMatch[1];
    }

    const apiMatch = content.match(/^api_token\s*=\s*"([^"]+)"/m);
    if (apiMatch) {
      return apiMatch[1];
    }
  } catch {
    // ignore read errors
  }
  return null;
}

export function requireApiToken(): string {
  if (process.env.CLOUDFLARE_API_TOKEN) {
    return process.env.CLOUDFLARE_API_TOKEN;
  }

  const wranglerToken = readWranglerToken();
  if (wranglerToken) {
    return wranglerToken;
  }

  console.error('\n  Not authenticated with Cloudflare.');
  console.error('  Run: wrangler login');
  console.error('  Or set CLOUDFLARE_API_TOKEN in your environment.');
  process.exit(1);
}

export async function fetchWithCloudflareToken<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string>),
    },
  });
  const data = (await res.json()) as CfResponse<T>;
  if (!data.success) {
    const msgs = data.errors.map((e) => e.message).join(', ');
    throw new Error(msgs);
  }
  return data.result;
}

type Zone = { id: string; name: string; account: { id: string } };

export async function lookupZone(
  token: string,
  domain: string
): Promise<{ zoneId: string; accountId: string }> {
  try {
    const zones = await fetchWithCloudflareToken<Zone[]>(
      token,
      `/zones?name=${domain}`
    );

    if (!zones.length) {
      console.error(
        `\n  Domain "${domain}" not found in your Cloudflare account.`
      );
      console.error('  Make sure the domain is added to Cloudflare');
      console.error('  and the API token has Zone → Zone → Read permission.');
      process.exit(1);
    }

    return { zoneId: zones[0].id, accountId: zones[0].account.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n  Failed to look up zone: ${msg}`);
    console.error('  Check that your CLOUDFLARE_API_TOKEN has:');
    console.error('    • Zone → Zone → Read');
    console.error('    • Zone → Email Routing Rules → Edit');
    process.exit(1);
  }
}

type Account = { id: string; name: string };

export async function getAccountId(token: string): Promise<string> {
  const accounts = await fetchWithCloudflareToken<Account[]>(
    token,
    '/accounts?per_page=1'
  );
  if (!accounts.length) {
    console.error('\n  No Cloudflare accounts found for this API token.');
    process.exit(1);
  }
  return accounts[0].id;
}

type CfQueue = { queue_id: string; queue_name: string };
type CfConsumer = { consumer_id: string; script_name: string };

export type QueueBinding = {
  queueId: string;
  queueName: string;
  consumerId: string;
};

export async function getWorkerQueueBindings(
  token: string,
  accountId: string,
  workerName: string
): Promise<QueueBinding[]> {
  const queues = await fetchWithCloudflareToken<CfQueue[]>(
    token,
    `/accounts/${accountId}/queues`
  );

  const bindings: QueueBinding[] = [];
  for (const queue of queues) {
    const consumers = await fetchWithCloudflareToken<CfConsumer[]>(
      token,
      `/accounts/${accountId}/queues/${queue.queue_id}/consumers`
    );
    const consumer = consumers.find((c) => c.script_name === workerName);
    if (consumer) {
      bindings.push({
        queueId: queue.queue_id,
        queueName: queue.queue_name,
        consumerId: consumer.consumer_id,
      });
    }
  }
  return bindings;
}

export async function deleteQueueConsumerBinding(
  token: string,
  accountId: string,
  queueId: string,
  consumerId: string
): Promise<void> {
  await fetchWithCloudflareToken(
    token,
    `/accounts/${accountId}/queues/${queueId}/consumers/${consumerId}`,
    { method: 'DELETE' }
  );
}

export async function deleteQueue(
  token: string,
  accountId: string,
  queueId: string
): Promise<void> {
  await fetchWithCloudflareToken(
    token,
    `/accounts/${accountId}/queues/${queueId}`,
    { method: 'DELETE' }
  );
}
