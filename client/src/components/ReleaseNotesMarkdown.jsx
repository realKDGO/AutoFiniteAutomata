import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

// react-markdown does not render raw HTML unless rehype-raw is added. Keeping
// that plugin out makes GitHub release notes safe while preserving Markdown.
export default function ReleaseNotesMarkdown({ markdown }) {
  return (
    <div className="max-h-40 overflow-y-auto pr-1 text-xs leading-5 text-ink dark:text-ink-dark">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          h1: ({ children }) => <h1 className="mb-3 mt-4 text-base font-bold first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-4 text-sm font-bold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-3 text-xs font-bold uppercase tracking-wide">{children}</h3>,
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 marker:text-success last:mb-0 dark:marker:text-green-400">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline dark:text-sky-300">{children}</a>,
          code: ({ children }) => <code className="rounded bg-ink/10 px-1 font-mono text-[0.9em] dark:bg-white/10">{children}</code>,
        }}
      >
        {markdown || ''}
      </ReactMarkdown>
    </div>
  );
}
