import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import guideSource from '../../../docs/USER_GUIDE.md?raw';

/**
 * HelpView — the user guide, rendered in-app.
 *
 * `docs/USER_GUIDE.md` is the single source: it ships in the bundle, so the
 * guide is available offline through the service worker like any other view.
 * Edit the markdown, not this file.
 *
 * Mermaid diagrams are stripped rather than rendered — the runtime is ~600 kB
 * and the surrounding prose carries the same information. They stay in the
 * markdown for the published web version.
 */

const MERMAID_BLOCK = /```mermaid[\s\S]*?```\n?/g;

/** GitHub-compatible heading slugs, so the guide's own Contents links work. */
function slugify(children) {
  return String(flatten(children))
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

function flatten(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(flatten).join('');
  if (typeof node === 'object') return flatten(node.props?.children);
  return node;
}

const components = {
  h1: ({ children }) => (
    <h1 className="mb-3 text-2xl font-bold tracking-tight text-foreground md:text-3xl">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2
      id={slugify(children)}
      className="mt-10 scroll-mt-20 border-b border-border pb-2 text-xl font-bold tracking-tight text-foreground"
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 id={slugify(children)} className="mt-8 scroll-mt-20 text-base font-bold text-foreground">
      {children}
    </h3>
  ),
  h4: ({ children }) => <h4 className="mt-6 text-sm font-bold text-foreground">{children}</h4>,
  p: ({ children }) => <p className="my-3 text-sm leading-relaxed text-muted-foreground">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">{children}</ol>
  ),
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  a: ({ href, children }) => {
    const external = href?.startsWith('http');
    return (
      <a
        href={href}
        {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
        className="font-semibold text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
      >
        {children}
      </a>
    );
  },
  code: ({ children }) => (
    <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-lg border border-border bg-muted p-4 font-mono text-xs text-foreground">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-border pl-4 text-sm italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-8 border-border" />,
  // Tables are the guide's densest content and the first thing to overflow on
  // a phone — each one scrolls inside its own box rather than the page.
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
  th: ({ children }) => (
    <th className="whitespace-nowrap border-b border-border px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
      {children}
    </th>
  ),
  // Row rules come from `divide-y`, which draws between rows only — so the
  // last row has no trailing divider doubling up with the wrapper's border.
  tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
  td: ({ children }) => <td className="px-3 py-2 align-top text-muted-foreground">{children}</td>,
};

export default function HelpView() {
  const source = useMemo(() => guideSource.replace(MERMAID_BLOCK, ''), []);

  return (
    <div className="mx-auto max-w-3xl px-1 pb-16">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
