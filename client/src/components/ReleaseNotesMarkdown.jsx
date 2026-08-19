import { Fragment } from 'react';

// Intentionally renders Markdown into React nodes rather than HTML. React
// escapes text by default, so a GitHub release body cannot execute markup.
function inline(text) {
  const parts = String(text).split(/(\[[^\]]+\]\([^\s)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g);
  return parts.map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
    if (link) {
      const href = link[2];
      return /^https?:\/\//i.test(href)
        ? <a key={index} href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline dark:text-sky-300">{link[1]}</a>
        : <Fragment key={index}>{part}</Fragment>;
    }
    if (/^`/.test(part)) return <code key={index} className="rounded bg-ink/10 px-1 font-mono text-[0.9em] dark:bg-white/10">{part.slice(1, -1)}</code>;
    if (/^(\*\*|__)/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^\*/.test(part) || /^_/.test(part)) return <em key={index}>{part.slice(1, -1)}</em>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export default function ReleaseNotesMarkdown({ markdown }) {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n');
  const nodes = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const Tag = `h${heading[1].length}`;
      nodes.push(<Tag key={index} className="mt-3 text-sm font-bold first:mt-0">{inline(heading[2])}</Tag>);
      index += 1; continue;
    }
    const list = line.match(/^\s*([-*+] |\d+\. )(.+)$/);
    if (list) {
      const ordered = /^\s*\d+\. /.test(line); const items = [];
      while (index < lines.length) {
        const item = lines[index].match(ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/);
        if (!item) break;
        items.push(<li key={index}>{inline(item[1])}</li>); index += 1;
      }
      const Tag = ordered ? 'ol' : 'ul';
      nodes.push(<Tag key={`list-${index}`} className={`my-2 space-y-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}`}>{items}</Tag>);
      continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,3}\s+|\s*[-*+]\s+|\s*\d+\.\s+)/.test(lines[index])) paragraph.push(lines[index++]);
    nodes.push(<p key={index} className="mt-2 first:mt-0">{inline(paragraph.join(' '))}</p>);
  }
  return <div className="max-h-40 overflow-y-auto pr-1 text-xs leading-5 text-ink dark:text-ink-dark">{nodes}</div>;
}
