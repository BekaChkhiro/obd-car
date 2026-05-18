import { Text, View } from 'react-native';

interface Props {
  content: string;
  dimmed?: boolean;
}

type InlineSegment = { type: 'bold' | 'italic' | 'code' | 'plain'; text: string };

function parseInline(line: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  // Patterns: **bold**, *italic*, `code`
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    if (match.index > last) {
      segments.push({ type: 'plain', text: line.slice(last, match.index) });
    }
    if (match[2] !== undefined) {
      segments.push({ type: 'bold', text: match[2] });
    } else if (match[3] !== undefined) {
      segments.push({ type: 'italic', text: match[3] });
    } else if (match[4] !== undefined) {
      segments.push({ type: 'code', text: match[4] });
    }
    last = match.index + match[0].length;
  }

  if (last < line.length) {
    segments.push({ type: 'plain', text: line.slice(last) });
  }
  return segments;
}

function InlineLine({ segments, dimmed }: { segments: InlineSegment[]; dimmed?: boolean }) {
  const base = dimmed ? 'text-gray-400' : 'text-gray-100';
  return (
    <Text>
      {segments.map((seg, i) => {
        if (seg.type === 'bold') {
          return (
            <Text key={i} className={`font-bold ${base}`}>
              {seg.text}
            </Text>
          );
        }
        if (seg.type === 'italic') {
          return (
            <Text key={i} className={`italic ${base}`}>
              {seg.text}
            </Text>
          );
        }
        if (seg.type === 'code') {
          return (
            <Text key={i} className="rounded bg-gray-700 px-1 font-mono text-xs text-green-300">
              {seg.text}
            </Text>
          );
        }
        return (
          <Text key={i} className={base}>
            {seg.text}
          </Text>
        );
      })}
    </Text>
  );
}

export function MarkdownText({ content, dimmed }: Props) {
  const lines = content.split('\n');
  const base = dimmed ? 'text-gray-400' : 'text-gray-100';

  return (
    <View className="gap-0.5">
      {lines.map((line, i) => {
        const h3 = line.match(/^### (.+)/);
        const h2 = line.match(/^## (.+)/);
        const h1 = line.match(/^# (.+)/);
        const bullet = line.match(/^[-*] (.+)/);
        const numbered = line.match(/^(\d+)\. (.+)/);

        if (h1) {
          return (
            <Text key={i} className="mt-1 text-base font-bold text-white">
              {h1[1]}
            </Text>
          );
        }
        if (h2) {
          return (
            <Text key={i} className="mt-1 text-sm font-bold text-white">
              {h2[1]}
            </Text>
          );
        }
        if (h3) {
          return (
            <Text key={i} className="mt-0.5 text-sm font-semibold text-gray-200">
              {h3[1]}
            </Text>
          );
        }
        if (bullet) {
          return (
            <View key={i} className="flex-row gap-1">
              <Text className={`mt-0.5 ${base}`}>•</Text>
              <InlineLine segments={parseInline(bullet[1])} dimmed={dimmed} />
            </View>
          );
        }
        if (numbered) {
          return (
            <View key={i} className="flex-row gap-1">
              <Text className={`mt-0.5 ${base}`}>{numbered[1]}.</Text>
              <InlineLine segments={parseInline(numbered[2])} dimmed={dimmed} />
            </View>
          );
        }
        if (line.trim() === '') {
          return <View key={i} className="h-1" />;
        }
        return <InlineLine key={i} segments={parseInline(line)} dimmed={dimmed} />;
      })}
    </View>
  );
}
