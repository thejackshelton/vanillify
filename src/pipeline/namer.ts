import type { NodeEntry } from "../types";

/**
 * Maps original Tailwind class string (for a node) to the assigned indexed name.
 * Key: nodeIndex, Value: assigned class name (e.g., "node0", "node1")
 */
export type NameMap = Map<number, string>;

/**
 * Assign indexed class names (.node0, .node1, etc.) to each NodeEntry.
 * Names are assigned in the order entries appear (which is DOM source order
 * since the extractor walks in source order).
 *
 * Only non-dynamic entries get names. Dynamic entries are skipped
 * (they cannot be statically rewritten to a single class name).
 *
 * @param entries - NodeEntry[] from the extractor
 * @returns NameMap from nodeIndex to class name string (without the dot)
 */
export function assignNames(entries: NodeEntry[]): NameMap {
  const nameMap: NameMap = new Map();

  for (const entry of entries) {
    if (!entry.isDynamic) {
      nameMap.set(entry.nodeIndex, `node${entry.nodeIndex}`);
    }
  }

  return nameMap;
}

/**
 * Get the CSS selector for a node index.
 * @returns ".node0", ".node1", etc.
 */
export function selectorFor(nodeIndex: number): string {
  return `.node${nodeIndex}`;
}
