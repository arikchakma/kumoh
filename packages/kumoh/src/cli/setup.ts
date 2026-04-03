import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineCommand } from 'citty';

import { cfFetch, lookupZone, requireApiToken } from './cloudflare.ts';
import { loadConfig, root, saveConfig } from './config.ts';
import { log } from './log.ts';
import { prompt } from './prompt.ts';

type EmailRoutingSettings = {
  enabled: boolean;
  status: string;
};

const emailSetup = defineCommand({
  meta: {
    name: 'email',
    description: 'Configure Cloudflare Email Routing for your domain',
  },
  async run() {
    const emailEntry = resolve(root, 'app/email.ts');
    if (!existsSync(emailEntry)) {
      console.error(
        '\n  No app/email.ts found. Create an email handler first:'
      );
      console.error('  https://github.com/arikchakma/kumoh#email-routing\n');
      process.exit(1);
    }

    const token = requireApiToken();
    const config = await loadConfig();
    const appName = config.name ?? 'kumoh-app';

    log.step('Email Routing setup');
    const domain = await prompt('Domain', config.email?.domain ?? '');
    if (!domain) {
      console.error('  Domain is required.');
      process.exit(1);
    }

    // Step 1: Look up zone
    log.step(`Looking up zone for ${domain}...`);
    const { zoneId } = await lookupZone(token, domain);
    log.ok(`Zone: ${domain} (${zoneId.slice(0, 8)}…)`);

    // Step 2: Enable Email Routing + apply DNS records
    log.step('Activating Email Routing...');
    try {
      await cfFetch(token, `/zones/${zoneId}/email/routing/dns`, {
        method: 'POST',
        body: JSON.stringify({ name: domain }),
      });
      log.ok('DNS records applied (MX, SPF)');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already')) {
        log.ok('Email Routing already active');
      } else {
        log.warn(`Could not apply DNS records: ${msg}`);
        log.warn('You may need to configure DNS manually in the dashboard.');
      }
    }

    // Check status
    try {
      const settings = await cfFetch<EmailRoutingSettings>(
        token,
        `/zones/${zoneId}/email/routing`
      );
      log.ok(`Email Routing — status: ${settings.status ?? 'enabled'}`);
      if (settings.status && settings.status !== 'ready') {
        log.warn('DNS may take a few minutes to propagate.');
      }
    } catch {
      log.warn('Could not verify Email Routing status.');
    }

    // Step 3: Set catch-all rule → Worker
    log.step('Configuring catch-all rule → Worker...');
    try {
      await cfFetch(token, `/zones/${zoneId}/email/routing/rules/catch_all`, {
        method: 'PUT',
        body: JSON.stringify({
          matchers: [{ type: 'all' }],
          actions: [{ type: 'worker', value: [appName] }],
          enabled: true,
          name: `${appName} catch-all`,
        }),
      });
      log.ok(`All mail to @${domain} → Worker "${appName}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('worker') || msg.includes('script')) {
        log.warn(`Worker "${appName}" may not be deployed yet.`);
        log.warn('Run: kumoh deploy');
      } else {
        log.warn(`Could not set catch-all rule: ${msg}`);
      }
    }

    // Step 4: Save config
    config.email = { domain };
    await saveConfig(config);

    log.done(`Email Routing configured for ${domain}`);
    console.log('');
    console.log(`  Receive: @${domain} → app/email.ts`);
    console.log(`  Send:    noreply@${domain} via SEND_EMAIL binding`);
    console.log('');
  },
});

export const setup = defineCommand({
  meta: { name: 'setup', description: 'Provision Cloudflare services' },
  subCommands: { email: emailSetup },
});
