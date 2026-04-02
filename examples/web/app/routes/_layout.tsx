import {
  Database,
  Key,
  HardDrive,
  Clock,
  MessageSquare,
  Plug,
  Home,
} from 'lucide-react';
import { Outlet } from 'react-router';

import { Section } from '~/components/section';

const nav = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/db', label: 'Database', icon: Database },
  { to: '/kv', label: 'Key-Value', icon: Key },
  { to: '/storage', label: 'Storage', icon: HardDrive },
  { to: '/cron', label: 'Cron', icon: Clock },
  { to: '/queues', label: 'Message Queues', icon: MessageSquare },
  { to: '/rpc', label: 'RPC Client', icon: Plug },
];

export default function Layout() {
  return (
    <Section.Root className="pt-8 px-4">
      <Section.Heading>Kitchen Sink</Section.Heading>
      <Section.Description>
        A playground app that exercises every major kumoh feature.
      </Section.Description>
      <Section.Tabs>
        {nav.map((item) => (
          <Section.Tab
            key={item.to}
            to={item.to}
            className="gap-1 flex items-center pl-2.5"
          >
            {item.label}
          </Section.Tab>
        ))}
      </Section.Tabs>

      <Section.Content>
        <Outlet />
      </Section.Content>
    </Section.Root>
  );
}
