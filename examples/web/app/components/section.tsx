import { NavLink } from 'react-router';

import { cn } from '~/utils/classname';

export type SectionRootProps = {
  children: React.ReactNode;
  className?: string;
};

export function SectionRoot(props: SectionRootProps) {
  const { children, className } = props;

  return (
    <div className={cn('mx-auto min-h-dvh max-w-lg bg-white', className)}>
      {children}
    </div>
  );
}

export type SectionHeadingProps = {
  children: React.ReactNode;
};

export function SectionHeading(props: SectionHeadingProps) {
  const { children } = props;

  return (
    <h2 className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-text-dim mb-3">
      {children}
    </h2>
  );
}

export type SectionDescriptionProps = {
  children: React.ReactNode;
};

export function SectionDescription(props: SectionDescriptionProps) {
  const { children } = props;

  return <p className="text-sm text-text mb-3 font-pixel">{children}</p>;
}

export type SectionTabsProps = {
  children: React.ReactNode;
};

export function SectionTabs(props: SectionTabsProps) {
  const { children } = props;

  return <div className="flex gap-2 mb-8 flex-wrap">{children}</div>;
}

export type SectionTabProps = {
  children: React.ReactNode;
  to: string;
  className?: string;
};

export function SectionTab(props: SectionTabProps) {
  const { children, to, className } = props;

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'px-3 py-[5px] border border-border text-xs font-pixel hover:opacity-90 font-medium',
          isActive
            ? 'bg-ink text-white border-ink'
            : 'bg-white text-text hover:border-ink',
          className
        )
      }
    >
      {children}
    </NavLink>
  );
}

export type SectionContentProps = {
  children: React.ReactNode;
};

export function SectionContent(props: SectionContentProps) {
  const { children } = props;

  return <div>{children}</div>;
}

export const Section = {
  Root: SectionRoot,
  Heading: SectionHeading,
  Description: SectionDescription,
  Tabs: SectionTabs,
  Tab: SectionTab,
  Content: SectionContent,
};
