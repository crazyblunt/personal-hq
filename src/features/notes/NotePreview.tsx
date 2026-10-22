import type { ReactNode } from 'react';
import { Check } from '../../ui/controls';

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

function linkify(text: string): ReactNode[] {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-info hover:underline">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

/**
 * Renders plain-text notes with a few conventions: `#` headings, `-` bullets,
 * and `- [ ]` checklist items that can be ticked. Everything is rendered as
 * text, so nothing in a note can run as code.
 */
export function NotePreview({ body, onChange }: { body: string; onChange: (body: string) => void }) {
  const lines = body.split('\n');
  if (!body.trim()) return <p className="text-sm text-subtle">Nothing written yet.</p>;
  const toggle = (index: number) => {
    const next = [...lines];
    next[index] = next[index].replace(/^(\s*[-*]\s+\[)([ xX])(\])/, (_, a, mark, b) => `${a}${mark === ' ' ? 'x' : ' '}${b}`);
    onChange(next.join('\n'));
  };
  return (
    <div className="flex flex-col gap-0.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const check = /^(\s*)[-*]\s+\[([ xX])\]\s?(.*)$/.exec(line);
        if (check) {
          const done = check[2] !== ' ';
          return (
            <label key={i} className="flex items-start gap-2" style={{ paddingLeft: `${check[1].length * 0.5}rem` }}>
              <Check checked={done} onChange={() => toggle(i)} label={check[3] || 'Checklist item'} className="mt-0.5" />
              <span className={done ? 'text-subtle line-through' : ''}>{linkify(check[3])}</span>
            </label>
          );
        }
        const heading = /^(#{1,3})\s+(.*)$/.exec(line);
        if (heading) {
          const size = heading[1].length === 1 ? 'text-lg' : heading[1].length === 2 ? 'text-base' : 'text-sm';
          return (
            <p key={i} className={`${size} mt-1 font-bold`}>
              {linkify(heading[2])}
            </p>
          );
        }
        const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
        if (bullet) {
          return (
            <p key={i} className="flex gap-2" style={{ paddingLeft: `${bullet[1].length * 0.5}rem` }}>
              <span className="text-subtle" aria-hidden="true">
                ▪
              </span>
              <span>{linkify(bullet[2])}</span>
            </p>
          );
        }
        if (!line.trim()) return <div key={i} className="h-2" />;
        return (
          <p key={i} className="whitespace-pre-wrap">
            {linkify(line)}
          </p>
        );
      })}
    </div>
  );
}
