const CF_API = 'https://api.cloudflare.com/client/v4';

type CfResponse<T> = {
  success: boolean;
  result: T;
  errors: Array<{ code: number; message: string }>;
};

export function requireApiToken(): string {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    console.error('\n  CLOUDFLARE_API_TOKEN is not set.');
    console.error(
      '  Create one at: https://dash.cloudflare.com/profile/api-tokens'
    );
    console.error('  Required permissions:');
    console.error('    • Zone → Email Routing Rules → Edit');
    console.error('    • Zone → Zone Settings → Read');
    process.exit(1);
  }
  return token;
}

export async function cfFetch<T>(
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
  const zones = await cfFetch<Zone[]>(token, `/zones?name=${domain}`);
  if (!zones.length) {
    console.error(
      `\n  Domain "${domain}" not found in your Cloudflare account.`
    );
    console.error('  Make sure the domain is added to Cloudflare.');
    process.exit(1);
  }
  return { zoneId: zones[0].id, accountId: zones[0].account.id };
}
