import { expect, it } from "vitest";
import { makeStressGraph } from "./stress";
it("creates a connected acyclic 3000-node image tree with reproducible positions", () => {
  const images = [
    { original: "original-a", thumb: "thumb-a" },
    { original: "original-b", thumb: "thumb-b" },
  ];
  const graph = makeStressGraph(3000, images, true);
  expect(graph.nodes).toHaveLength(3000);
  expect(graph.edges).toHaveLength(2999);
  const ids = new Set(graph.nodes.map((n) => n.id));
  for (const edge of graph.edges) {
    expect(ids.has(edge.source) && ids.has(edge.target)).toBe(true);
    expect(Number(edge.source.slice(7))).toBeLessThan(
      Number(edge.target.slice(7)),
    );
  }
  expect(
    new Set(graph.nodes.map((n) => `${n.position.x},${n.position.y}`)).size,
  ).toBe(3000);
  const thumbs = makeStressGraph(3000, images, false);
  expect(thumbs.nodes[100].position).toEqual(graph.nodes[100].position);
  expect(thumbs.nodes[100].data.image).toBe("thumb-a");
});
