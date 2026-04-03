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
