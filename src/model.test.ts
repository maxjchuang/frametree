import { describe, it, expect } from "vitest";
import {
  initialProject,
  descendants,
  visibleFrames,
  layoutTree,
  validateProject,
} from "./model";
describe("storyboard tree", () => {
  it("removes entire descendant branches without crossing siblings", () => {
    expect([...descendants(initialProject.frames, "scene1")].sort()).toEqual([
      "scene1",
      "shot1",
      "shot2",
    ]);
  });
  it("hides descendants while retaining a collapsed parent", () => {
    const frames = initialProject.frames.map((f) => ({
      ...f,
      collapsed: f.id === "scene1",
    }));
    expect(visibleFrames(frames).map((f) => f.id)).toEqual([
      "story",
      "scene1",
      "scene2",
      "shot3",
    ]);
  });
  it("places parents left of children and gives leaves distinct positions", () => {
    const frames = layoutTree(initialProject.frames);
    for (const f of frames)
      if (f.parentId)
        expect(f.x).toBeGreaterThan(frames.find((n) => n.id === f.parentId)!.x);
    const leaves = frames.filter(
      (f) => !frames.some((n) => n.parentId === f.id),
    );
    expect(new Set(leaves.map((f) => f.y)).size).toBe(leaves.length);
  });
  it("rejects cycles, missing parents and untrusted image URLs", () => {
    for (const patch of [
      { parentId: "shot1" },
      { parentId: "missing" },
      { image: "javascript:alert(1)" },
    ]) {
      const p = structuredClone(initialProject);
      Object.assign(p.frames[0], patch);
      expect(() => validateProject(p)).toThrow();
    }
  });
  it("accepts valid projects without losing prompt data", () => {
    expect(validateProject(structuredClone(initialProject))).toEqual(
      initialProject,
    );
  });
});
