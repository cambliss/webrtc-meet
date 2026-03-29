import type { TranscriptLine } from "@/src/types/meeting";

export type HighlightMatch = {
  lineId: string;
  speakerName: string;
  text: string;
  matchStartIndices: number[];
  matchEndIndices: number[];
};

export type TranscriptHighlightResult = {
  matches: HighlightMatch[];
  query: string;
};

/**
 * Extracts keyword highlights from transcript lines based on a search query.
 * Uses case-insensitive whole-word and substring matching.
 */
export function searchTranscriptLines(
  lines: TranscriptLine[],
  query: string,
): TranscriptHighlightResult {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return { matches: [], query };
  }

  const matches: HighlightMatch[] = [];

  for (const line of lines) {
    const lowerText = line.text.toLowerCase();
    const matchIndices = findAllOccurrences(lowerText, normalizedQuery);

    if (matchIndices.length > 0) {
      matches.push({
        lineId: line.id,
        speakerName: line.speakerName,
        text: line.text,
        matchStartIndices: matchIndices.map((i) => i),
        matchEndIndices: matchIndices.map((i) => i + normalizedQuery.length),
      });
    }
  }

  return { matches, query };
}

/**
 * Find all start indices of a substring in text (case-insensitive).
 */
function findAllOccurrences(text: string, substring: string): number[] {
  const indices: number[] = [];
  let lastIndex = 0;

  while (lastIndex < text.length) {
    const index = text.indexOf(substring, lastIndex);
    if (index === -1) break;
    indices.push(index);
    lastIndex = index + 1;
  }

  return indices;
}

/**
 * Extract semantic highlights (e.g., key action items, decisions, important names).
 * This is a simple heuristic-based approach that looks for certain patterns.
 */
export function extractSemanticHighlights(lines: TranscriptLine[]): HighlightMatch[] {
  const patterns = [
    // Action words: "should", "need to", "must", "will", "action", "todo"
    /\b(should|need to|must|will do|action|todo|let's|let me)\b/gi,
    // Decision words: "decided", "decide", "agreed", "agree"
    /\b(decided|decide|agreed|agree|conclusion|result)\b/gi,
    // Important terms: "deadline", "priority", "urgent", "critical"
    /\b(deadline|priority|urgent|critical|important|asap)\b/gi,
  ];

  const matches: HighlightMatch[] = [];
  const seenLineIds = new Set<string>();

  for (const line of lines) {
    if (seenLineIds.has(line.id)) continue;

    for (const pattern of patterns) {
      const patternMatches = [...line.text.matchAll(pattern)];

      if (patternMatches.length > 0) {
        const matchIndices = patternMatches.map((m) => m.index!);
        const matchLength = patternMatches[0][0].length;

        matches.push({
          lineId: line.id,
          speakerName: line.speakerName,
          text: line.text,
          matchStartIndices: matchIndices,
          matchEndIndices: matchIndices.map((i) => i + matchLength),
        });

        seenLineIds.add(line.id);
        break;
      }
    }
  }

  return matches;
}

/**
 * Render a transcript line with highlighted spans.
 * Returns JSX-ready parts: { text, isHighlight }[]
 */
export function renderHighlightedText(
  text: string,
  matchStartIndices: number[],
  matchEndIndices: number[],
): Array<{ text: string; isHighlight: boolean }> {
  if (matchStartIndices.length === 0) {
    return [{ text, isHighlight: false }];
  }

  // Merge overlapping ranges
  const ranges = matchStartIndices
    .map((start, idx) => ({ start, end: matchEndIndices[idx] }))
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    if (merged.length > 0 && merged[merged.length - 1].end >= range.start) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, range.end);
    } else {
      merged.push(range);
    }
  }

  const parts: Array<{ text: string; isHighlight: boolean }> = [];
  let lastEnd = 0;

  for (const { start, end } of merged) {
    if (start > lastEnd) {
      parts.push({ text: text.slice(lastEnd, start), isHighlight: false });
    }
    parts.push({ text: text.slice(start, end), isHighlight: true });
    lastEnd = end;
  }

  if (lastEnd < text.length) {
    parts.push({ text: text.slice(lastEnd), isHighlight: false });
  }

  return parts;
}
