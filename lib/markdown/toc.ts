export type TocItem = {
  id: string;
  label: string;
  level: 2 | 3;
};

const entityMap: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: "\"",
};

function decodeEntities(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return entityMap[entity.toLowerCase()] ?? match;
  });
}

export function extractTableOfContents(html: string): TocItem[] {
  const items: TocItem[] = [];
  const headingPattern = /<h([23])\s+[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi;
  for (const match of html.matchAll(headingPattern)) {
    const label = decodeEntities(match[3].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    if (!label) continue;
    items.push({
      id: decodeEntities(match[2]),
      label,
      level: Number(match[1]) as 2 | 3,
    });
  }
  return items;
}
