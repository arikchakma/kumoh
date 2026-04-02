import { highlight } from 'sugar-high';

import { cn } from '~/utils/classname';

type CodeBlockProps = {
  code: string;
  className?: string;
};

export function CodeBlock(props: CodeBlockProps) {
  const { code, className } = props;

  const html = highlight(code);

  return (
    <div className={cn('border-[1.5px] border-ink overflow-hidden', className)}>
      <pre className="m-0 p-4 overflow-x-auto">
        <code
          className="font-mono text-xs leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    </div>
  );
}
