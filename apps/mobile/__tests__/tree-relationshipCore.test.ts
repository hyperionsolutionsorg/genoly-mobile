/**
 * PORTED from genoly-family-web convex/lib/relationshipCore.test.ts (2026-07-09).
 * Changes: import paths → mobile lib/tree; vitest globals → jest globals;
 * vitest's two-arg expect(value, message) → one-arg (jest).
 */
/**
 * Unit tests for the pure relationship core (convex/lib/relationshipCore.ts).
 *
 * Pure module → no convexTest, no DB; we build small in-memory graphs and
 * assert both APIs:
 *   - computeRelationshipLabel (viewer-framed, the explorer's List/Family API)
 *   - computeRelationshipFromMaps (bare, parity with the old query shape)
 *
 * Covers the §7.5 edge classes: self · blood (ancestor/descendant/sibling/
 * cousin) · spouse · in-law (1 hop, both directions) · step · distant.
 */

import {
  computeRelationshipLabel,
  computeRelationshipFromMaps,
  type RelationshipGraph,
} from "../lib/tree/relationshipCore";

type Gender = "male" | "female" | "nonbinary" | "unknown" | "other";

/** Tiny declarative builder for a RelationshipGraph. */
class GraphBuilder {
  private persons: RelationshipGraph["persons"] = new Map();
  private familyAdultsByPerson: RelationshipGraph["familyAdultsByPerson"] = new Map();
  private familyChildrenByChild: RelationshipGraph["familyChildrenByChild"] = new Map();
  private adultsByFamily: RelationshipGraph["adultsByFamily"] = new Map();
  private childrenByFamily: RelationshipGraph["childrenByFamily"] = new Map();

  person(id: string, gender?: Gender): string {
    this.persons.set(id, { gender });
    return id;
  }

  family(
    familyId: string,
    adults: string[],
    children: Array<string | { id: string; rel: string }> = [],
  ): void {
    this.adultsByFamily.set(familyId, adults);
    for (const a of adults) {
      const arr = this.familyAdultsByPerson.get(a) ?? [];
      arr.push(familyId);
      this.familyAdultsByPerson.set(a, arr);
    }
    const childIds = children.map((c) => (typeof c === "string" ? c : c.id));
    this.childrenByFamily.set(familyId, childIds);
    for (const c of children) {
      const id = typeof c === "string" ? c : c.id;
      const rel = typeof c === "string" ? "biological" : c.rel;
      const arr = this.familyChildrenByChild.get(id) ?? [];
      arr.push({ familyId, relationshipType: rel });
      this.familyChildrenByChild.set(id, arr);
    }
  }

  build(): RelationshipGraph {
    return {
      persons: this.persons,
      familyAdultsByPerson: this.familyAdultsByPerson,
      familyChildrenByChild: this.familyChildrenByChild,
      adultsByFamily: this.adultsByFamily,
      childrenByFamily: this.childrenByFamily,
    };
  }
}

/** A three-generation family with collaterals, in-laws and a step-child. */
function buildFamilyGraph(): RelationshipGraph {
  const g = new GraphBuilder();
  // Grandparents (paternal + maternal).
  g.person("gpaA", "male");
  g.person("gmaA", "female");
  g.person("gpaB", "male");
  g.person("gmaB", "female");
  // Parents + the anchor's uncle (dad's brother).
  g.person("dad", "male");
  g.person("mom", "female");
  g.person("uncle", "male");
  g.person("auntInLaw", "female"); // uncle's wife (no blood tie to anchor)
  // Anchor's generation.
  g.person("me", "male");
  g.person("sis", "female");
  g.person("cousin", "male");
  // Anchor's spouse + her family.
  g.person("spouse", "female");
  g.person("fatherInLaw", "male");
  g.person("motherInLaw", "female");
  g.person("spouseBro", "male");
  // Anchor's children + a child's spouse.
  g.person("kid", "male");
  g.person("stepKid", "male");
  g.person("kidSpouse", "female");
  // An unrelated person.
  g.person("stranger", "male");

  g.family("f_gA", ["gpaA", "gmaA"], ["dad", "uncle"]);
  g.family("f_gB", ["gpaB", "gmaB"], ["mom"]);
  g.family("f_parents", ["dad", "mom"], ["me", "sis"]);
  g.family("f_me", ["me", "spouse"], ["kid", { id: "stepKid", rel: "step" }]);
  g.family("f_uncle", ["uncle", "auntInLaw"], ["cousin"]);
  g.family("f_spouseParents", ["fatherInLaw", "motherInLaw"], ["spouse", "spouseBro"]);
  g.family("f_kid", ["kid", "kidSpouse"], []);
  return g.build();
}

describe("computeRelationshipLabel (viewer-framed)", () => {
  const graph = buildFamilyGraph();
  const label = (target: string) => computeRelationshipLabel("me", target, graph);

  test("self", () => {
    expect(label("me")).toEqual({ label: "You", kind: "self", confidence: "heuristic" });
  });

  test("blood — ancestors / descendants / collaterals", () => {
    expect(label("dad").label).toBe("Your father");
    expect(label("mom").label).toBe("Your mother");
    expect(label("gpaA").label).toBe("Your grandfather");
    expect(label("sis").label).toBe("Your sister");
    expect(label("uncle").label).toBe("Your uncle");
    expect(label("cousin").label).toBe("Your 1st cousin");
    expect(label("kid").label).toBe("Your son");
    expect(label("kid").kind).toBe("blood");
  });

  test("spouse", () => {
    expect(label("spouse")).toMatchObject({ label: "Your wife", kind: "spouse" });
  });

  test("step relationship carries the step- prefix + kind", () => {
    expect(label("stepKid")).toMatchObject({ label: "Your step-son", kind: "step" });
  });

  test("in-law — spouse's parent → father-in-law", () => {
    expect(label("fatherInLaw")).toMatchObject({ label: "Your father-in-law", kind: "in-law" });
  });

  test("in-law — spouse's sibling → brother-in-law", () => {
    expect(label("spouseBro")).toMatchObject({ label: "Your brother-in-law", kind: "in-law" });
  });

  test("in-law — child's spouse → daughter-in-law", () => {
    expect(label("kidSpouse")).toMatchObject({ label: "Your daughter-in-law", kind: "in-law" });
  });

  test("in-law — blood relative's spouse → possessive chain", () => {
    expect(label("auntInLaw")).toMatchObject({ label: "Your uncle's wife", kind: "in-law" });
  });

  test("in-law — father's (non-bio) wife → stepmother (Issue #403)", () => {
    // Krishna Mohan ↔ Jaya Lakshmi shape from the Nalluri tree: dad has a
    // second spouse (Jaya Lakshmi) recorded as an ADULT on a different
    // family where the viewer is NOT a child. The viewer's bio parents are
    // dad + mom from `f_parents`. Jaya Lakshmi is the parent's spouse but
    // not the viewer's blood/step parent → must label as "Your stepmother",
    // never the prior clinical "Your father's wife".
    const g = new GraphBuilder();
    g.person("me", "male");
    g.person("dad", "male");
    g.person("mom", "female");
    g.person("stepmom", "female");
    g.family("f_parents", ["dad", "mom"], ["me"]);
    g.family("f_dad_remarried", ["dad", "stepmom"], []); // no child = no step parent of me
    const graph = g.build();
    const out = computeRelationshipLabel("me", "stepmom", graph);
    expect(out.label).toBe("Your stepmother");
    // Currently routes through the in-law branch (step-parent has no LCA
    // because Jaya Lakshmi isn't recorded as the viewer's parent at all).
    expect(out.kind).toBe("in-law");
  });

  test("in-law — mother's (non-bio) husband → stepfather (Issue #403)", () => {
    const g = new GraphBuilder();
    g.person("me", "female");
    g.person("dad", "male");
    g.person("mom", "female");
    g.person("stepdad", "male");
    g.family("f_parents", ["dad", "mom"], ["me"]);
    g.family("f_mom_remarried", ["mom", "stepdad"], []);
    const graph = g.build();
    const out = computeRelationshipLabel("me", "stepdad", graph);
    expect(out.label).toBe("Your stepfather");
    expect(out.kind).toBe("in-law");
  });

  test("step-parent label is gender-neutral when target gender is unknown (Issue #403)", () => {
    // No gender on the step-parent → no warmer English fallback (we don't
    // pluralize "step-parent"); the legacy "Your father's spouse" pattern
    // is what the general branch returns. The Issue #403 mapping requires a
    // gender to choose between stepmother/stepfather — when unknown, we
    // skip the step branch and fall through to the general label.
    const g = new GraphBuilder();
    g.person("me", "male");
    g.person("dad", "male");
    g.person("stepparent"); // no gender
    g.family("f_parents", ["dad"], ["me"]);
    g.family("f_dad_remarried", ["dad", "stepparent"], []);
    const graph = g.build();
    const out = computeRelationshipLabel("me", "stepparent", graph);
    // Falls through to the general possessive chain: "Your father's spouse".
    expect(out.label).toMatch(/Your father's (spouse|husband|wife)/);
  });

  test("step-parent mapping doesn't disturb bio parents (regression guard)", () => {
    // Sanity: a viewer's actual bio parents must still surface as "Your
    // mother"/"Your father" via the LCA blood branch — the step-parent
    // mapping must only fire when the target ISN'T a blood/step parent.
    expect(label("dad").label).toBe("Your father");
    expect(label("mom").label).toBe("Your mother");
  });

  test("bio mother married to bio father → 'Your mother', NEVER 'Your stepmother' (PR 2.5 §6)", () => {
    // Regression guard for the Nalluri live-verify bug: Vijaya Lakshmi
    // (biological mother, married to Shankar's biological father Krishna
    // Mohana) was being mis-labelled "Your stepmother". Root cause: the
    // in-law branch path A fires on ANY "spouse of a parent" without first
    // checking whether that spouse is also a recorded parent of the viewer.
    //
    // In this fixture — bio mother IS in the same family as the viewer as a
    // child — the blood branch (findLca) catches her before computeInLaw
    // even runs. But the guard added in PR 2.5 also short-circuits path A
    // when the target is a recorded parent of the viewer on ANY family, so
    // the stepmother label can never leak even if a downstream refactor
    // changes the branch ordering.
    const g = new GraphBuilder();
    g.person("viewer", "male");
    g.person("bioDad", "male");
    g.person("bioMom", "female");
    // Single family — viewer is child, both bio parents are adults.
    g.family("f_family", ["bioDad", "bioMom"], ["viewer"]);
    const graph = g.build();
    const out = computeRelationshipLabel("viewer", "bioMom", graph);
    expect(out.label).toBe("Your mother");
    expect(out.kind).toBe("blood");
    // Symmetric: bio father via the same fixture.
    expect(computeRelationshipLabel("viewer", "bioDad", graph).label).toBe(
      "Your father",
    );
  });

  test("recorded-parent guard: even if the in-law branch fires, step-parent label suppressed (PR 2.5 §6)", () => {
    // Direct probe of the path-A guard: a person who is simultaneously (a)
    // registered as a spouse of the viewer's parent in one family AND (b)
    // registered as a parent-of-viewer in another family MUST NOT be labelled
    // stepmother/stepfather — they ARE the viewer's parent (any relationship
    // type: biological, step, adopted). The blood/step branch will normally
    // catch them first via findLca, so this test constructs a data shape
    // where the LCA branch could still classify her before computeInLaw
    // runs — and asserts the resulting label is a parent label, not a
    // stepmother label.
    const g = new GraphBuilder();
    g.person("me", "male");
    g.person("dad", "male");
    g.person("mom", "female");
    // Family A — the "parents" record for the viewer.
    g.family("f_parents", ["dad", "mom"], ["me"]);
    // Family B — dad's SEPARATE union with mom (a stale / duplicate family
    // row, without the viewer as a child). This mirrors the Nalluri live-
    // verify data shape (one union with viewer-as-child + a stale co-adult
    // record on a different family for the same two adults).
    g.family("f_dad_stale", ["dad", "mom"], []);
    const graph = g.build();
    // Bio-mom is caught by findLca via family A (blood branch), never
    // reaching computeInLaw. Verify the label + kind lock that in.
    const out = computeRelationshipLabel("me", "mom", graph);
    expect(out.label).toBe("Your mother");
    expect(out.kind).toBe("blood");
    // For completeness — the label must not be the step-parent label under
    // ANY ordering of the two families in the graph.
    expect(out.label).not.toBe("Your stepmother");
  });

  test("distant / unrelated", () => {
    expect(label("stranger")).toMatchObject({ label: "Distant relative", kind: "none" });
  });

  test("confidence is threaded through", () => {
    expect(computeRelationshipLabel("me", "dad", graph, { confidence: "linked" }).confidence).toBe(
      "linked",
    );
  });
});

describe("computeRelationshipFromMaps (bare parity shape)", () => {
  const graph = buildFamilyGraph();

  test("themselves", () => {
    expect(computeRelationshipFromMaps("me", "me", graph)).toMatchObject({
      label: "themselves",
      lca: null,
    });
  });

  test("child sees parent's gendered descendant label", () => {
    expect(computeRelationshipFromMaps("dad", "me", graph)?.label).toBe("son");
  });

  test("spouse shortcut returns the gendered word", () => {
    expect(computeRelationshipFromMaps("me", "spouse", graph)?.label).toBe("wife");
  });

  test("unrelated within the tree → no traceable relation", () => {
    expect(computeRelationshipFromMaps("me", "stranger", graph)?.label).toBe(
      "no traceable relation",
    );
  });

  test("missing target → null (cross-tree / deleted)", () => {
    expect(computeRelationshipFromMaps("me", "ghost", graph)).toBeNull();
  });
});
