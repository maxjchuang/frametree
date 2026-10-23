export type Frame = {
  id: string;
  parentId: string | null;
  title: string;
  kind: "故事" | "场景" | "镜头";
  image: string;
  assetId?: string;
  script: string;
  prompt: string;
  duration: number;
  shot: string;
  collapsed?: boolean;
  x: number;
  y: number;
};
export type Project = { version: 1; title: string; frames: Frame[] };
export const initialProject: Project = {
  version: 1,
  title: "午夜之后 / After Midnight",
  frames: [
    {
      id: "story",
      parentId: null,
      title: "午夜之后",
      kind: "故事",
      image: "/demo/city.jpg",
      script: "一位失眠的摄影师，在城市最后一班列车上，遇见了来自明天的自己。",
      prompt:
        "Neo-noir city at midnight, cinematic lighting, 35mm film grain, teal and amber",
      duration: 0,
      shot: "概念视觉",
      x: 0,
      y: 190,
    },
    {
      id: "scene1",
      parentId: "story",
      title: "01 · 城市未眠",
      kind: "场景",
      image: "/demo/street.jpg",
      script: "雨后的街道映着霓虹。他独自走向车站。",
      prompt:
        "Rain-soaked street, solitary figure, neon reflections, anamorphic lens",
      duration: 0,
      shot: "氛围场景",
      x: 390,
      y: 20,
    },
    {
      id: "scene2",
      parentId: "story",
      title: "02 · 最后一班列车",
      kind: "场景",
      image: "/demo/train.jpg",
      script: "空荡的站台，远处传来列车进站的声音。",
      prompt:
        "Empty railway station at night, symmetrical composition, atmospheric haze",
      duration: 0,
      shot: "氛围场景",
      x: 390,
      y: 390,
    },
    {
      id: "shot1",
      parentId: "scene1",
      title: "雨夜 · 建立镜头",
      kind: "镜头",
      image: "/demo/city.jpg",
      script: "俯瞰城市。雨点掠过镜头，远处的灯光逐渐失焦。",
      prompt:
        "Wide establishing shot, rain at night, glowing city skyline, slow dolly forward, cinematic, 16:9",
      duration: 5,
      shot: "远景 · 缓慢推进",
      x: 780,
      y: -110,
    },
    {
      id: "shot2",
      parentId: "scene1",
      title: "霓虹 · 孤独的旅人",
      kind: "镜头",
      image: "/demo/street.jpg",
      script: "背影走入霓虹深处。脚步声和雨声交叠。",
      prompt:
        "Medium back shot of a lone traveler in a neon street, wet pavement, slow tracking shot",
      duration: 4,
      shot: "中景 · 跟拍",
      x: 780,
      y: 190,
    },
    {
      id: "shot3",
      parentId: "scene2",
      title: "站台 · 等待明天",
      kind: "镜头",
      image: "/demo/train.jpg",
      script: "他抬头看向站台时钟。秒针在午夜停住。",
      prompt:
        "Wide shot of empty platform at midnight, solitary traveler, suspenseful, static camera",
      duration: 6,
      shot: "全景 · 固定机位",
      x: 780,
      y: 490,
    },
  ],
};
export function descendants(frames: Frame[], id: string): Set<string> {
  const found = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of frames)
      if (f.parentId && found.has(f.parentId) && !found.has(f.id)) {
        found.add(f.id);
        changed = true;
      }
  }
  return found;
}
export function visibleFrames(frames: Frame[]): Frame[] {
  const hidden = new Set<string>();
  for (const f of frames.filter((f) => f.collapsed))
    for (const id of descendants(frames, f.id)) if (id !== f.id) hidden.add(id);
  return frames.filter((f) => !hidden.has(f.id));
}
export function layoutTree(frames: Frame[]): Frame[] {
  let leaf = 0;
  const positions = new Map<string, { x: number; y: number }>();
  function visit(f: Frame, depth: number): number {
    const children = frames.filter((c) => c.parentId === f.id);
    const ys = children.map((c) => visit(c, depth + 1));
    const y = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : leaf++ * 300;
    positions.set(f.id, { x: depth * 390, y });
    return y;
  }
  frames.filter((f) => !f.parentId).forEach((f) => visit(f, 0));
  return frames.map((f) => ({ ...f, ...positions.get(f.id) }));
}
export function validateProject(value: unknown): Project {
  if (!value || typeof value !== "object") throw Error("项目格式不正确");
  const p = value as Project;
  if (
    p.version !== 1 ||
    typeof p.title !== "string" ||
    !Array.isArray(p.frames) ||
    !p.frames.length ||
    p.frames.length > 2000
  )
    throw Error("无效项目，最多支持 2000 个节点");
  const ids = new Set<string>();
  for (const f of p.frames) {
    if (
      !f ||
      typeof f.id !== "string" ||
      ids.has(f.id) ||
      !["故事", "场景", "镜头"].includes(f.kind) ||
      ![f.x, f.y, f.duration].every(Number.isFinite) ||
      f.duration < 0 ||
      !["title", "image", "script", "prompt", "shot"].every(
        (k) => typeof (f as any)[k] === "string",
      ) ||
      !(f.parentId === null || typeof f.parentId === "string") ||
      (f.assetId !== undefined && typeof f.assetId !== "string") ||
      (f.collapsed !== undefined && typeof f.collapsed !== "boolean")
    )
      throw Error("节点数据无效");
    if (
      f.image &&
      !/^(\/demo\/|data:image\/(png|jpeg|webp);base64,)/.test(f.image)
    )
      throw Error("图片来源无效");
    ids.add(f.id);
  }
  if (p.frames.filter((f) => f.parentId === null).length !== 1)
    throw Error("项目必须有且仅有一个根节点");
  for (const f of p.frames) {
    const seen = new Set([f.id]);
    let parent = f.parentId;
    while (parent) {
      if (seen.has(parent) || !ids.has(parent))
        throw Error("父子关系存在环或缺失节点");
      seen.add(parent);
      parent = p.frames.find((n) => n.id === parent)!.parentId;
    }
  }
  return p;
}
