export type DiffOperation = {
  type: "equal" | "add" | "remove";
  value: string;
};

export type NumberedDiffRow =
  | (DiffOperation & { oldLine: number | null; newLine: number | null })
  | { type: "skip"; count: number };

function lines(value: string) {
  const normalized = value.replace(/\r\n?/g, "\n");
  if (!normalized) return [];
  return normalized.split("\n");
}

function valueAt(map: Map<number, number>, key: number) {
  return map.get(key) ?? Number.NEGATIVE_INFINITY;
}

/** Myers 逐行 diff：空间复杂度与改动距离相关，适合可能很长的 Markdown。 */
export function diffLines(before: string, after: string): DiffOperation[] {
  const oldLines = lines(before);
  const newLines = lines(after);
  const oldLength = oldLines.length;
  const newLength = newLines.length;
  const maxDistance = oldLength + newLength;
  const frontier = new Map<number, number>([[1, 0]]);
  const trace: Array<Map<number, number>> = [];

  for (let distance = 0; distance <= maxDistance; distance += 1) {
    trace.push(new Map(frontier));
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      let oldIndex: number;
      if (
        diagonal === -distance
        || (diagonal !== distance
          && valueAt(frontier, diagonal - 1) < valueAt(frontier, diagonal + 1))
      ) {
        oldIndex = valueAt(frontier, diagonal + 1);
      } else {
        oldIndex = valueAt(frontier, diagonal - 1) + 1;
      }
      if (!Number.isFinite(oldIndex)) oldIndex = 0;

      let newIndex = oldIndex - diagonal;
      while (
        oldIndex < oldLength
        && newIndex < newLength
        && oldLines[oldIndex] === newLines[newIndex]
      ) {
        oldIndex += 1;
        newIndex += 1;
      }
      frontier.set(diagonal, oldIndex);

      if (oldIndex >= oldLength && newIndex >= newLength) {
        return backtrack(trace, oldLines, newLines);
      }
    }
  }

  return [];
}

function backtrack(
  trace: Array<Map<number, number>>,
  oldLines: string[],
  newLines: string[],
) {
  let oldIndex = oldLines.length;
  let newIndex = newLines.length;
  const operations: DiffOperation[] = [];

  for (let distance = trace.length - 1; distance >= 0; distance -= 1) {
    const frontier = trace[distance];
    const diagonal = oldIndex - newIndex;
    const previousDiagonal = (
      diagonal === -distance
      || (diagonal !== distance
        && valueAt(frontier, diagonal - 1) < valueAt(frontier, diagonal + 1))
    ) ? diagonal + 1 : diagonal - 1;
    const previousOldIndex = Math.max(0, valueAt(frontier, previousDiagonal));
    const previousNewIndex = previousOldIndex - previousDiagonal;

    while (oldIndex > previousOldIndex && newIndex > previousNewIndex) {
      operations.push({ type: "equal", value: oldLines[oldIndex - 1] });
      oldIndex -= 1;
      newIndex -= 1;
    }

    if (distance === 0) break;
    if (oldIndex === previousOldIndex) {
      operations.push({ type: "add", value: newLines[newIndex - 1] });
      newIndex -= 1;
    } else {
      operations.push({ type: "remove", value: oldLines[oldIndex - 1] });
      oldIndex -= 1;
    }
  }

  return operations.reverse();
}

export function numberAndCollapseDiff(
  operations: DiffOperation[],
  contextLines = 3,
): NumberedDiffRow[] {
  const numbered: Array<Exclude<NumberedDiffRow, { type: "skip" }>> = [];
  let oldLine = 1;
  let newLine = 1;

  for (const operation of operations) {
    numbered.push({
      ...operation,
      oldLine: operation.type === "add" ? null : oldLine,
      newLine: operation.type === "remove" ? null : newLine,
    });
    if (operation.type !== "add") oldLine += 1;
    if (operation.type !== "remove") newLine += 1;
  }

  const result: NumberedDiffRow[] = [];
  let index = 0;
  while (index < numbered.length) {
    if (numbered[index].type !== "equal") {
      result.push(numbered[index]);
      index += 1;
      continue;
    }

    let end = index;
    while (end < numbered.length && numbered[end].type === "equal") end += 1;
    const runLength = end - index;
    const isLeading = index === 0;
    const isTrailing = end === numbered.length;
    const keepAtStart = isLeading ? 0 : contextLines;
    const keepAtEnd = isTrailing ? 0 : contextLines;
    const hidden = runLength - keepAtStart - keepAtEnd;

    if (hidden > 0) {
      result.push(...numbered.slice(index, index + keepAtStart));
      result.push({ type: "skip", count: hidden });
      result.push(...numbered.slice(end - keepAtEnd, end));
    } else {
      result.push(...numbered.slice(index, end));
    }
    index = end;
  }

  return result;
}
