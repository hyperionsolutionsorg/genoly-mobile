/**
 * classicLayout — pure d3-hierarchy layout pass for the Pedigree Classic view
 * (RN port of the layout math inside genoly-family-web
 * src/components/ClassicTree.tsx's `useMemo` — `hierarchy()` + `tree()` +
 * the ancestor y-inversion — WITHOUT the DOM-bound parts of that file:
 * d3-zoom, d3-selection, canvas name measurement, and the sepia/serif/oval
 * "vintage" portrait aesthetic. Pan/zoom is ZoomPanView; boxes are themed
 * rectangles rendered by components/tree/PedigreeClassic.tsx.
 *
 * Web-parity notes (deliberate simplifications, see PR description):
 *  - Web's ancestor-mode ClassicTree does NOT render each ancestor's own
 *    spouseFamilies (its local `AncestorNode`/`ancestorToDatum` — src/
 *    components/ClassicTree.tsx:34-46,126-142 — never reads that field for
 *    the ancestors path; only descendant mode renders a `spouse`). This
 *    module matches that: `AncestorNode.spouseFamilies` is present on the
 *    input (mobile's explorerTypes.ts mirrors the full server shape) but
 *    intentionally unused here — one box per ancestor, no spouse boxes.
 *  - Web measures each oval's width from the rendered name (canvas
 *    `measureText`, DOM-only). This module uses a FIXED box size instead
 *    (no text measurement dependency, deterministic, Hermes-safe) — the
 *    "clean themed box+line chart" simplification the porting plan calls
 *    for in place of the desktop poster styling.
 *  - Missing father/mother simply truncates that branch (no placeholder
 *    node) — exactly what `ancestorToDatum` does (`if (node.father) ...`).
 *
 * Y convention: matches ClassicTree's ancestor-mode inversion — the focus
 * person (generation 0) ends up at the BOTTOM, oldest generation at the TOP.
 * X convention: d3's `nodeSize([1, VERTICAL_GAP])` with a pixel-valued
 * `separation()` (fixed box width, so no measured-oval separation needed).
 *
 * Pure + DOM-free + deterministic: unit-tests run headless (no Hermes/RN
 * dependency at all — d3-hierarchy is plain JS).
 */

import { hierarchy, tree } from 'd3-hierarchy';

import type { AncestorNode } from './explorerTypes';

// ── Geometry vocabulary ──────────────────────────────────────────────────

/** Fixed box size for every ancestor node (mobile theme box, not a measured oval). */
export const NODE_WIDTH = 140;
export const NODE_HEIGHT = 64;
/** Clear horizontal gap between full siblings (same parent-in-hierarchy). */
export const SIBLING_GAP = 28;
/** Clear horizontal gap between unrelated branches (different parents-in-hierarchy) — wider, mirrors the web's 1.6x cousin spacing. */
export const COUSIN_GAP = 44;
/** Vertical pitch between generations — box height + connector room. */
const VERTICAL_GAP = 132;

interface Datum {
  id: string;
  slug?: string;
  preferredName: string;
  surname?: string;
  gender?: string;
  isLiving: boolean;
  lifespan: string;
  children?: Datum[];
}

function extractYear(dateStr?: string): string {
  if (!dateStr) return '';
  const m = /^(\d{4})/.exec(dateStr);
  return m ? m[1] : '';
}

/** Formats a lifespan string from raw event date strings (web parity: `formatLifespan` in ClassicTree.tsx). */
export function formatLifespan(birthDate?: string, deathDate?: string, isLiving?: boolean): string {
  const b = extractYear(birthDate);
  const d = extractYear(deathDate);
  if (isLiving) return b ? `b. ${b}` : '';
  if (!b && !d) return '';
  return `${b || '?'}–${d || ''}`;
}

/** Web parity: `ancestorToDatum` — father/mother recurse into a `children` array so d3-hierarchy can lay the ancestor chain out as an ordinary tree. */
function toDatum(node: AncestorNode): Datum {
  const parents: Datum[] = [];
  if (node.father) parents.push(toDatum(node.father));
  if (node.mother) parents.push(toDatum(node.mother));
  return {
    id: node._id,
    slug: node.slug,
    preferredName: node.preferredName,
    surname: node.surname,
    gender: node.gender,
    isLiving: node.isLiving,
    lifespan: formatLifespan(node.birthDate, node.deathDate, node.isLiving),
    children: parents.length > 0 ? parents : undefined,
  };
}

export interface ClassicLayoutNode {
  id: string;
  slug?: string;
  preferredName: string;
  surname?: string;
  gender?: string;
  isLiving: boolean;
  lifespan: string;
  /** 0 = the focus/root person; increases moving further back in time. */
  generation: number;
  isFocus: boolean;
  /** Top-left box corner (box is NODE_WIDTH x NODE_HEIGHT). */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ClassicLayoutEdge {
  id: string;
  /** The nearer-to-focus end (child, in real-life terms). */
  fromId: string;
  /** The further-back end (that child's father or mother). */
  toId: string;
  /** Orthogonal elbow connector, source(bottom) → target(top). */
  points: { x: number; y: number }[];
}

export interface ClassicLayoutResult {
  nodes: ClassicLayoutNode[];
  edges: ClassicLayoutEdge[];
  rootId: string;
  /** Center of the focus/root box — the sensible initial ZoomPanView `centerOn`. */
  rootCenter: { x: number; y: number };
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/** Computes node positions + connector paths for an ancestor tree (`pedigree:getAncestorTree`'s nested shape). */
export function computeClassicLayout(root: AncestorNode): ClassicLayoutResult {
  const datum = toDatum(root);
  const h = hierarchy<Datum>(datum);

  // nodeSize x = 1 so separation() returns the literal pixel distance
  // between sibling centers (web parity — ClassicTree does the same thing
  // for the same reason, just with measured-oval extents instead of a
  // fixed width).
  const layoutFn = tree<Datum>()
    .nodeSize([1, VERTICAL_GAP])
    .separation((a, b) => (a.parent === b.parent ? NODE_WIDTH + SIBLING_GAP : NODE_WIDTH + COUSIN_GAP));

  const rootNode = layoutFn(h);

  // Ancestor-chart convention (web parity): invert y so the focus person is
  // at the bottom and the oldest generation is at the top.
  const descendants = rootNode.descendants();
  const maxY = Math.max(...descendants.map((n) => n.y));
  for (const n of descendants) {
    n.y = maxY - n.y;
  }

  const nodes: ClassicLayoutNode[] = descendants.map((n) => ({
    id: n.data.id,
    slug: n.data.slug,
    preferredName: n.data.preferredName,
    surname: n.data.surname,
    gender: n.data.gender,
    isLiving: n.data.isLiving,
    lifespan: n.data.lifespan,
    generation: n.depth,
    isFocus: n.depth === 0,
    x: n.x - NODE_WIDTH / 2,
    y: n.y - NODE_HEIGHT / 2,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  }));

  const edges: ClassicLayoutEdge[] = rootNode.links().map((link) => {
    const s = link.source; // nearer to focus (smaller depth) — sits BELOW after inversion.
    const t = link.target; // further back (larger depth) — sits ABOVE after inversion.
    const sPoint = { x: s.x, y: s.y - NODE_HEIGHT / 2 }; // top edge of the nearer box
    const tPoint = { x: t.x, y: t.y + NODE_HEIGHT / 2 }; // bottom edge of the further-back box
    const midY = (sPoint.y + tPoint.y) / 2;
    return {
      id: `${s.data.id}-${t.data.id}`,
      fromId: s.data.id,
      toId: t.data.id,
      points: [
        sPoint,
        { x: sPoint.x, y: midY },
        { x: tPoint.x, y: midY },
        tPoint,
      ],
    };
  });

  const xs = nodes.flatMap((n) => [n.x, n.x + n.width]);
  const ys = nodes.flatMap((n) => [n.y, n.y + n.height]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY2 = Math.max(...ys);

  const focusNode = nodes.find((n) => n.isFocus)!;

  return {
    nodes,
    edges,
    rootId: root._id,
    rootCenter: { x: focusNode.x + focusNode.width / 2, y: focusNode.y + focusNode.height / 2 },
    minX,
    minY,
    maxX,
    maxY: maxY2,
    width: maxX - minX,
    height: maxY2 - minY,
  };
}
