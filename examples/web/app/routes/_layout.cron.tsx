import { CodeBlock } from '~/components/code-block';
import { Section } from '~/components/section';

const lastHeartbeat = '2026-04-02T08:00:00.000Z';

const cronSource = `// app/crons/heartbeat.ts
import { defineScheduled } from 'kumoh/cron';

export const cron = '0 */6 * * *';

export default defineScheduled(async (controller) => {
  console.log(\`Heartbeat: \${controller.cron}\`);
});`;

export default function Cron() {
  return (
    <div className="space-y-6">
      <Section.Heading>Last Heartbeat</Section.Heading>
      <p className="font-pixel text-xs text-text">
        <code>{lastHeartbeat}</code>
      </p>

      <Section.Heading>Cron Definition</Section.Heading>
      <CodeBlock code={cronSource} />
    </div>
  );
}
