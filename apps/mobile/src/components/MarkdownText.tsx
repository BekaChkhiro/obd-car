import { ScrollView, Text, View } from 'react-native';

interface Props {
  content: string;
  dimmed?: boolean;
}

type InlineSegment =
  | { type: 'bold' | 'italic' | 'code' | 'strike' | 'plain'; text: string };

type CalloutKind = 'note' | 'warn' | 'tip' | 'danger';

type Block =
  | { kind: 'h1' | 'h2' | 'h3'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'numbered'; index: number; text: string }
  | { kind: 'codeblock'; lang: string | null; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'callout'; tone: CalloutKind; title: string; text: string }
  | { kind: 'hr' }
  | { kind: 'para'; text: string }
  | { kind: 'blank' };

// ── Inline parser ────────────────────────────────────────────────────────────

function parseInline(line: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|~~(.+?)~~)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    if (match.index > last) {
      segments.push({ type: 'plain', text: line.slice(last, match.index) });
    }
    if (match[2] !== undefined) segments.push({ type: 'bold', text: match[2] });
    else if (match[3] !== undefined) segments.push({ type: 'italic', text: match[3] });
    else if (match[4] !== undefined) segments.push({ type: 'code', text: match[4] });
    else if (match[5] !== undefined) segments.push({ type: 'strike', text: match[5] });
    last = match.index + match[0].length;
  }

  if (last < line.length) {
    segments.push({ type: 'plain', text: line.slice(last) });
  }
  return segments;
}

function detectCallout(text: string): { tone: CalloutKind; title: string; rest: string } | null {
  const m = text.match(/^(?:\*\*)?(Note|Tip|Hint|Warning|Caution|Danger|Important)(?:\*\*)?\s*[:—–-]\s*(.+)/i);
  if (!m) return null;
  const word = m[1].toLowerCase();
  const tone: CalloutKind =
    word === 'tip' || word === 'hint'
      ? 'tip'
      : word === 'danger'
        ? 'danger'
        : word === 'warning' || word === 'caution' || word === 'important'
          ? 'warn'
          : 'note';
  return { tone, title: m[1], rest: m[2] };
}

// ── Block parser ─────────────────────────────────────────────────────────────

function parseBlocks(content: string): Block[] {
  const lines = content.split('\n');
  const out: Block[] = [];
  let inCode = false;
  let codeLang: string | null = null;
  let codeBuf: string[] = [];
  let paraBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length > 0) {
      const joined = paraBuf.join(' ');
      const callout = detectCallout(joined);
      if (callout) {
        out.push({ kind: 'callout', tone: callout.tone, title: callout.title, text: callout.rest });
      } else {
        out.push({ kind: 'para', text: joined });
      }
      paraBuf = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (inCode) {
      if (line.match(/^```/)) {
        out.push({ kind: 'codeblock', lang: codeLang, text: codeBuf.join('\n') });
        codeBuf = [];
        codeLang = null;
        inCode = false;
      } else {
        codeBuf.push(line);
      }
      continue;
    }

    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flushPara();
      inCode = true;
      codeLang = fence[1] || null;
      continue;
    }

    if (/^\s*[-*_]{3,}\s*$/.test(line)) {
      flushPara();
      out.push({ kind: 'hr' });
      continue;
    }

    const quote = line.match(/^>\s?(.*)/);
    if (quote) {
      flushPara();
      out.push({ kind: 'quote', text: quote[1] });
      continue;
    }

    const h1 = line.match(/^# (.+)/);
    if (h1) { flushPara(); out.push({ kind: 'h1', text: h1[1] }); continue; }
    const h2 = line.match(/^## (.+)/);
    if (h2) { flushPara(); out.push({ kind: 'h2', text: h2[1] }); continue; }
    const h3 = line.match(/^### (.+)/);
    if (h3) { flushPara(); out.push({ kind: 'h3', text: h3[1] }); continue; }

    const bullet = line.match(/^[-*]\s+(.+)/);
    if (bullet) {
      flushPara();
      out.push({ kind: 'bullet', text: bullet[1] });
      continue;
    }
    const numbered = line.match(/^(\d+)\.\s+(.+)/);
    if (numbered) {
      flushPara();
      out.push({ kind: 'numbered', index: parseInt(numbered[1], 10), text: numbered[2] });
      continue;
    }

    if (line.trim() === '') {
      flushPara();
      if (out.length > 0 && out[out.length - 1].kind !== 'blank') {
        out.push({ kind: 'blank' });
      }
      continue;
    }

    paraBuf.push(line);
  }

  if (inCode && codeBuf.length > 0) {
    out.push({ kind: 'codeblock', lang: codeLang, text: codeBuf.join('\n') });
  }
  flushPara();

  while (out.length > 0 && out[0].kind === 'blank') out.shift();
  while (out.length > 0 && out[out.length - 1].kind === 'blank') out.pop();

  return out;
}

// ── Inline segment renderer (returns Text fragments) ────────────────────────

function renderSegments(
  segments: InlineSegment[],
  dimmed: boolean | undefined,
  keyPrefix = '',
): React.ReactNode[] {
  const base = dimmed ? 'text-text-muted' : 'text-text-primary';
  return segments.map((seg, i) => {
    const key = `${keyPrefix}-${i}`;
    if (seg.type === 'bold') {
      return (
        <Text
          key={key}
          className={`font-semibold ${dimmed ? 'text-text-secondary' : 'text-text-primary'}`}
        >
          {seg.text}
        </Text>
      );
    }
    if (seg.type === 'italic') {
      return (
        <Text key={key} className={`italic ${base}`}>
          {seg.text}
        </Text>
      );
    }
    if (seg.type === 'strike') {
      return (
        <Text key={key} className="line-through text-text-muted">
          {seg.text}
        </Text>
      );
    }
    if (seg.type === 'code') {
      return (
        <Text
          key={key}
          className="rounded bg-surface-muted px-1 font-mono text-[12.5px] text-accent"
        >
          {seg.text}
        </Text>
      );
    }
    return (
      <Text key={key} className={base}>
        {seg.text}
      </Text>
    );
  });
}

function ParaLine({ text, dimmed }: { text: string; dimmed?: boolean }) {
  const segments = parseInline(text);
  const base = dimmed ? 'text-text-muted' : 'text-text-primary';
  return (
    <Text className={`text-[15px] leading-[20px] ${base}`}>
      {renderSegments(segments, dimmed)}
    </Text>
  );
}

// ── Block components ─────────────────────────────────────────────────────────

function CodeBlock({ text, lang }: { text: string; lang: string | null }) {
  return (
    <View className="my-1 self-start overflow-hidden rounded-lg border border-border bg-bg">
      {lang && (
        <View className="border-b border-border px-2.5 py-1">
          <Text className="text-[9px] font-bold tracking-[2px] text-text-muted">
            {lang.toUpperCase()}
          </Text>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text className="px-3 py-2 font-mono text-[12.5px] leading-[17px] text-text-secondary">
          {text}
        </Text>
      </ScrollView>
    </View>
  );
}

function Blockquote({ text, dimmed }: { text: string; dimmed?: boolean }) {
  // Border-left instead of a separate bar so the View sizes to content.
  return (
    <View className="my-1 self-start rounded-r-lg border-l-2 border-accent bg-bg px-3 py-1.5">
      <Text className={`text-[13.5px] leading-[18px] ${dimmed ? 'text-text-muted' : 'text-text-secondary'}`}>
        {renderSegments(parseInline(text), dimmed)}
      </Text>
    </View>
  );
}

const CALLOUT_STYLES: Record<CalloutKind, {
  bg: string; border: string; accent: string; title: string; mark: string;
}> = {
  note: {
    bg: 'bg-accent-soft', border: 'border-accent', accent: 'bg-accent',
    title: 'text-accent', mark: 'NOTE',
  },
  tip: {
    bg: 'bg-success-soft', border: 'border-success/30', accent: 'bg-success',
    title: 'text-success', mark: 'TIP',
  },
  warn: {
    bg: 'bg-warning-soft', border: 'border-warning/30', accent: 'bg-warning',
    title: 'text-warning', mark: 'WARNING',
  },
  danger: {
    bg: 'bg-danger-soft', border: 'border-danger/30', accent: 'bg-danger',
    title: 'text-danger', mark: 'DANGER',
  },
};

function Callout({ tone, text }: { tone: CalloutKind; title: string; text: string }) {
  const s = CALLOUT_STYLES[tone];
  return (
    <View className={`my-1.5 self-start rounded-xl border px-3 py-2 ${s.border} ${s.bg}`}>
      <View className="mb-1 flex-row items-center gap-1.5">
        <View className={`h-1 w-1 rounded-full ${s.accent}`} />
        <Text className={`text-[9px] font-bold tracking-[2px] ${s.title}`}>{s.mark}</Text>
      </View>
      <Text className="text-[15px] leading-[20px] text-text-primary">
        {renderSegments(parseInline(text), undefined)}
      </Text>
    </View>
  );
}

function BulletLine({ text, dimmed }: { text: string; dimmed?: boolean }) {
  const segments = parseInline(text);
  const base = dimmed ? 'text-text-muted' : 'text-text-primary';
  return (
    <Text className={`text-[15px] leading-[20px] ${base}`}>
      <Text className="text-accent">{'·  '}</Text>
      {renderSegments(segments, dimmed)}
    </Text>
  );
}

function NumberedLine({ index, text, dimmed }: { index: number; text: string; dimmed?: boolean }) {
  const segments = parseInline(text);
  const base = dimmed ? 'text-text-muted' : 'text-text-primary';
  return (
    <Text className={`text-[15px] leading-[20px] ${base}`}>
      <Text className="font-semibold text-accent tabular-nums">{`${index}. `}</Text>
      {renderSegments(segments, dimmed)}
    </Text>
  );
}

function HR() {
  return <View className="my-1.5 h-px self-stretch bg-surface-muted" />;
}

// ── Main component ──────────────────────────────────────────────────────────

export function MarkdownText({ content, dimmed }: Props) {
  const blocks = parseBlocks(content);

  return (
    <View>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h1':
            return (
              <Text key={i} className="mb-0.5 text-[16px] font-bold leading-[22px] text-text-primary">
                {b.text}
              </Text>
            );
          case 'h2':
            return (
              <Text key={i} className="mb-0.5 text-[15px] font-bold leading-[20px] text-text-primary">
                {b.text}
              </Text>
            );
          case 'h3':
            return (
              <Text key={i} className="mb-0.5 text-[14px] font-semibold leading-[19px] text-text-secondary">
                {b.text}
              </Text>
            );
          case 'bullet':
            return <BulletLine key={i} text={b.text} dimmed={dimmed} />;
          case 'numbered':
            return <NumberedLine key={i} index={b.index} text={b.text} dimmed={dimmed} />;
          case 'codeblock':
            return <CodeBlock key={i} text={b.text} lang={b.lang} />;
          case 'quote':
            return <Blockquote key={i} text={b.text} dimmed={dimmed} />;
          case 'callout':
            return <Callout key={i} tone={b.tone} title={b.title} text={b.text} />;
          case 'hr':
            return <HR key={i} />;
          case 'para':
            return <ParaLine key={i} text={b.text} dimmed={dimmed} />;
          case 'blank':
            return <View key={i} className="h-1" />;
        }
      })}
    </View>
  );
}
