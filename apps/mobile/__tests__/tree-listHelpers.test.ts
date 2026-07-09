/**
 * PORTED from genoly-family-web src/lib/explorer/listHelpers.test.ts (2026-07-09).
 * Changes: import paths → mobile lib/tree; vitest globals → jest globals;
 * vitest's two-arg expect(value, message) → one-arg (jest).
 */
/**
 * Unit tests for the List view's pure helpers (listHelpers.ts) — filtering,
 * sorting, filter-option derivation, the relationship-graph assembly, and the
 * memoized relationship resolver (Family Explorer Stage 3 PR2).
 *
 * Pure functions only — no router, no Convex, no DOM.
 */

import type { ExplorerPerson, FamilyEdge } from "../lib/tree/explorerTypes";
import {
  buildGenerationMap,
  buildRelationshipGraph,
  deriveGenerationOptions,
  deriveSurnameOptions,
  filterPersons,
  generationLabel,
  makeRelationshipResolver,
  sortPersons,
  SURNAME_NONE,
  DEFAULT_FILTERS,
  type ListFilters,
  type ListPerson,
} from "../lib/tree/listHelpers";

const pid = (s: string) => s;

function person(over: Partial<ListPerson> & { _id: string }): ListPerson {
  return {
    preferredName: "Person",
    isLiving: true,
    ...over,
  };
}

const PEOPLE: ListPerson[] = [
  person({ _id: "a", preferredName: "Krishna", surname: "Nalluri", gender: "male", isLiving: false, birthYear: 1950 }),
  person({ _id: "b", preferredName: "Lakshmi", surname: "Nalluri", gender: "female", isLiving: false, birthYear: 1953 }),
  person({ _id: "c", preferredName: "Rao", surname: "Nalluri", gender: "male", isLiving: true, birthYear: 1975 }),
  person({ _id: "d", preferredName: "Anjali", surname: "Rao", gender: "female", isLiving: true, birthYear: 1978 }),
  person({ _id: "e", preferredName: "Sam", gender: "nonbinary", isLiving: true }), // no surname, no year
];

const GENERATIONS = new Map<string, number>([
  ["a", 2],
  ["b", 2],
  ["c", 1],
  ["d", 0],
  // "e" intentionally absent — outside the loaded neighborhood.
]);

describe("filterPersons", () => {
  it("passes everyone with the default filters", () => {
    expect(filterPersons(PEOPLE, DEFAULT_FILTERS, GENERATIONS)).toHaveLength(PEOPLE.length);
  });

  it("filters by gender, treating non-binary/unset as 'other'", () => {
    const males = filterPersons(PEOPLE, { ...DEFAULT_FILTERS, gender: "male" }, GENERATIONS);
    expect(males.map((p) => p._id)).toEqual(["a", "c"]);
    const others = filterPersons(PEOPLE, { ...DEFAULT_FILTERS, gender: "other" }, GENERATIONS);
    expect(others.map((p) => p._id)).toEqual(["e"]);
  });

  it("filters by living status", () => {
    const deceased = filterPersons(PEOPLE, { ...DEFAULT_FILTERS, living: "deceased" }, GENERATIONS);
    expect(deceased.map((p) => p._id)).toEqual(["a", "b"]);
  });

  it("filters by surname, with a sentinel for the unnamed", () => {
    const nalluri = filterPersons(PEOPLE, { ...DEFAULT_FILTERS, surname: "Nalluri" }, GENERATIONS);
    expect(nalluri.map((p) => p._id)).toEqual(["a", "b", "c"]);
    const unnamed = filterPersons(PEOPLE, { ...DEFAULT_FILTERS, surname: SURNAME_NONE }, GENERATIONS);
    expect(unnamed.map((p) => p._id)).toEqual(["e"]);
  });

  it("filters by generation and excludes rows with no known generation", () => {
    const grandparents = filterPersons(PEOPLE, { ...DEFAULT_FILTERS, generation: "2" }, GENERATIONS);
    expect(grandparents.map((p) => p._id)).toEqual(["a", "b"]);
    // "e" has no generation → excluded under any specific generation filter.
    const sameGen = filterPersons(PEOPLE, { ...DEFAULT_FILTERS, generation: "0" }, GENERATIONS);
    expect(sameGen.map((p) => p._id)).toEqual(["d"]);
  });

  it("combines filters (AND)", () => {
    const f: ListFilters = { gender: "female", living: "deceased", surname: "Nalluri", generation: "2" };
    expect(filterPersons(PEOPLE, f, GENERATIONS).map((p) => p._id)).toEqual(["b"]);
  });
});

describe("sortPersons", () => {
  it("sorts by name without mutating the input", () => {
    const input = [...PEOPLE];
    const sorted = sortPersons(input, "name", GENERATIONS);
    expect(sorted.map((p) => p.preferredName)).toEqual(["Anjali", "Krishna", "Lakshmi", "Rao", "Sam"]);
    expect(input).toEqual(PEOPLE); // pure
  });

  it("sorts by birth year, unknowns last", () => {
    const sorted = sortPersons(PEOPLE, "year", GENERATIONS);
    expect(sorted.map((p) => p._id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("sorts by relationship distance (|generation|), out-of-graph last", () => {
    const sorted = sortPersons(PEOPLE, "relationship", GENERATIONS);
    // d(0) < c(1) < a,b(2) [name tie-break] < e(∞)
    expect(sorted.map((p) => p._id)).toEqual(["d", "c", "a", "b", "e"]);
  });
});

describe("filter-option derivation", () => {
  it("derives distinct, sorted surnames (excluding empty)", () => {
    expect(deriveSurnameOptions(PEOPLE)).toEqual(["Nalluri", "Rao"]);
  });

  it("derives distinct generations, oldest-ancestors first", () => {
    expect(deriveGenerationOptions(PEOPLE, GENERATIONS)).toEqual([2, 1, 0]);
  });
});

describe("generationLabel", () => {
  it("labels common offsets and pluralizes great- correctly", () => {
    expect(generationLabel(0)).toBe("Your generation");
    expect(generationLabel(1)).toBe("Parents");
    expect(generationLabel(-1)).toBe("Children");
    expect(generationLabel(2)).toBe("Grandparents");
    expect(generationLabel(-2)).toBe("Grandchildren");
    expect(generationLabel(3)).toBe("Great-grandparents");
    expect(generationLabel(-4)).toBe("Great-Great-grandchildren");
  });
});

// ── Relationship graph + resolver ───────────────────────────────────────────

// A tiny tree: c (anchor/viewer) is the child of a+b (a union). d is c's spouse.
const GRAPH_PERSONS: ExplorerPerson[] = [
  { _id: pid("a"), preferredName: "Krishna", gender: "male", isLiving: false, generation: 1 },
  { _id: pid("b"), preferredName: "Lakshmi", gender: "female", isLiving: false, generation: 1 },
  { _id: pid("c"), preferredName: "Rao", gender: "male", isLiving: true, generation: 0 },
  { _id: pid("d"), preferredName: "Anjali", gender: "female", isLiving: true, generation: 0 },
];
const GRAPH_EDGES: FamilyEdge[] = [
  {
    familyId: "f1",
    familyType: "married",
    status: "active",
    adultIds: [pid("a"), pid("b")],
    childIds: [pid("c")],
    sortOrders: {},
    isPrimaryForAdult: {},
  },
  {
    familyId: "f2",
    familyType: "married",
    status: "active",
    adultIds: [pid("c"), pid("d")],
    childIds: [],
    sortOrders: {},
    isPrimaryForAdult: {},
  },
];

describe("buildRelationshipGraph", () => {
  it("assembles the adjacency maps from the explorerGraph payload", () => {
    const g = buildRelationshipGraph(GRAPH_PERSONS, GRAPH_EDGES);
    expect(g.persons.get("c")).toEqual({ gender: "male" });
    expect(g.adultsByFamily.get("f1")).toEqual(["a", "b"]);
    expect(g.childrenByFamily.get("f1")).toEqual(["c"]);
    expect(g.familyAdultsByPerson.get("c")).toEqual(["f2"]);
    expect(g.familyChildrenByChild.get("c")).toEqual([
      { familyId: "f1", relationshipType: "biological" },
    ]);
  });
});

describe("buildGenerationMap", () => {
  it("maps each person to its signed generation offset", () => {
    const m = buildGenerationMap(GRAPH_PERSONS);
    expect(m.get("a")).toBe(1);
    expect(m.get("c")).toBe(0);
  });
});

describe("makeRelationshipResolver", () => {
  const graph = buildRelationshipGraph(GRAPH_PERSONS, GRAPH_EDGES);

  it("frames self / blood / spouse from the viewer's perspective", () => {
    const resolve = makeRelationshipResolver(graph, "c", "linked");
    expect(resolve("c")).toMatchObject({ label: "You", kind: "self" });
    expect(resolve("a")).toMatchObject({ label: "Your father", kind: "blood" });
    expect(resolve("b")).toMatchObject({ label: "Your mother", kind: "blood" });
    expect(resolve("d")).toMatchObject({ label: "Your wife", kind: "spouse" });
  });

  it("passes the confidence flag through (heuristic anchor renders muted)", () => {
    const resolve = makeRelationshipResolver(graph, "c", "heuristic");
    expect(resolve("a")?.confidence).toBe("heuristic");
  });

  it("returns a STABLE reference on a cache hit (memoization)", () => {
    const resolve = makeRelationshipResolver(graph, "c", "linked");
    const first = resolve("a");
    const second = resolve("a");
    expect(second).toBe(first); // same object — the LCA walk ran once
  });

  it("returns null for a person outside the loaded neighborhood", () => {
    const resolve = makeRelationshipResolver(graph, "c", "linked");
    expect(resolve("zzz")).toBeNull();
  });

  it("returns null when there is no resolved viewer", () => {
    const resolve = makeRelationshipResolver(graph, null, "linked");
    expect(resolve("a")).toBeNull();
  });
});
