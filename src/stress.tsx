import { memo, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeProps,
  type Edge,
} from "@xyflow/react";
import { ArrowLeft, Focus, Play, RotateCcw } from "lucide-react";
import "./stress.css";

type ImageSet = { original: string; thumb: string };
type StressNode = Node<
  { image: string; title: string; index: number },
  "stress"
>;
const Card = memo(({ data }: NodeProps<StressNode>) => (
  <article className="stress-card">
    <Handle type="target" position={Position.Left} />
    <img
      src={data.image}
      alt={data.title}
      loading="eager"
      decoding="async"
      draggable={false}
    />
    <div>
      <span>SHOT {String(data.index).padStart(4, "0")}</span>
      <b>{data.title}</b>
      <small>5.0s · 中景 / 缓慢推进</small>
    </div>
    <Handle type="source" position={Position.Right} />
  </article>
));
const types = { stress: Card };

// A fixed seed makes positions and source images comparable across repeated runs.
export function makeStressGraph(
  count: number,
  images: ImageSet[],
  original: boolean,
): { nodes: StressNode[]; edges: Edge[] } {
  const columns = Math.ceil(Math.sqrt(count * 0.75));
  const nodes: StressNode[] = Array.from({ length: count }, (_, i) => ({
    id: `stress-${i}`,
    type: "stress",
    position: { x: (i % columns) * 350, y: Math.floor(i / columns) * 270 },
    width: 300,
    height: 230,
    data: {
      image: images[i % images.length][original ? "original" : "thumb"],
      title:
        i === 0
          ? "整部影片 / 故事根节点"
          : `第 ${Math.floor(i / 40) + 1} 场 · 分镜 ${i}`,
      index: i,
    },
  }));
  const edges: Edge[] = nodes.slice(1).map((n, i) => ({
    id: `edge-${i + 1}`,
    source: `stress-${Math.floor(i / 4)}`,
    target: n.id,
    type: "default",
    style: { stroke: "#526b43", strokeWidth: 1.3 },
  }));
  return { nodes, edges };
}
async function buildImages(
  count: number,
  signal: AbortSignal,
  onProgress: (n: number) => void,
): Promise<ImageSet[]> {
  const sources = await Promise.all(
    ["city", "street", "train"].map(async (name) => {
      const img = new Image();
      img.src = `/demo/${name}.jpg`;
      await img.decode();
      return img;
    }),
  );
  const images: ImageSet[] = [];
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1152;
  const ctx = canvas.getContext("2d")!;
  const small = document.createElement("canvas");
  small.width = 960;
  small.height = 540;
  const sc = small.getContext("2d")!;
  const blob = (c: HTMLCanvasElement): Promise<Blob> =>
    new Promise((resolve, reject) =>
      c.toBlob(
        (b) => (b ? resolve(b) : reject(Error("图片生成失败"))),
        "image/jpeg",
        0.9,
      ),
    );
  try {
    for (let i = 0; i < count; i++) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      ctx.drawImage(sources[i % 3], 0, 0, 2048, 1152);
      ctx.fillStyle = `hsla(${(i * 29) % 360},55%,30%,.18)`;
      ctx.fillRect(0, 0, 2048, 1152);
      // Different pixels/URLs avoid accidentally benchmarking one shared decoded bitmap.
      ctx.fillStyle = "#0009";
      ctx.fillRect(0, 875, 2048, 277);
      ctx.fillStyle = "#d9f0c5";
      ctx.font = "bold 85px sans-serif";
      ctx.fillText(`FRAME ${String(i + 1).padStart(3, "0")}`, 85, 1010);
      ctx.font = "30px sans-serif";
      ctx.fillText("FRAMETREE / 2048 × 1152 / DECODE STRESS", 90, 1080);
      sc.drawImage(canvas, 0, 0, 960, 540);
      images.push({
        original: URL.createObjectURL(await blob(canvas)),
        thumb: URL.createObjectURL(await blob(small)),
      });
      onProgress(i + 1);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return images;
  } catch (e) {
    for (const image of images) {
      URL.revokeObjectURL(image.original);
      URL.revokeObjectURL(image.thumb);
    }
    throw e;
  }
}
function useMetrics(
  container: React.RefObject<HTMLDivElement | null>,
  running: boolean,
) {
  const [metrics, setMetrics] = useState({
    fps: 0,
    p95: 0,
    max: 0,
    long: 0,
    blocked: 0,
    nodes: 0,
    images: 0,
    decoded: 0,
  });
  const reset = useRef(() => {});
  useEffect(() => {
    if (!running) return;
    let last = 0;
    let frames: number[] = [];
    let long = 0;
    let blocked = 0;
    let max = 0;
    let raf = 0;
    reset.current = () => {
      frames = [];
      long = 0;
      blocked = 0;
      max = 0;
    };
    const tick = (now: number) => {
      if (last && document.visibilityState === "visible") {
        const delta = now - last;
        frames.push(delta);
        max = Math.max(max, delta);
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    let observer: PerformanceObserver | undefined;
    if (PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          long++;
          blocked += e.duration;
        }
      });
      observer.observe({ type: "longtask", buffered: false });
    }
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") {
        last = 0;
        frames = [];
        return;
      }
      const sorted = [...frames].sort((a, b) => a - b);
      const elapsed = frames.reduce((a, b) => a + b, 0);
      const imgs = Array.from(
        container.current?.querySelectorAll<HTMLImageElement>(
          ".stress-card img",
        ) ?? [],
      );
      setMetrics({
        fps: elapsed ? Math.round((frames.length * 1000) / elapsed) : 0,
        p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
        max,
        long,
        blocked,
        nodes:
          container.current?.querySelectorAll(".react-flow__node").length ?? 0,
        images: imgs.length,
        decoded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
      });
      frames = [];
    }, 1500);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      observer?.disconnect();
    };
  }, [running, container]);
  return { metrics, reset: () => reset.current() };
}
export function StressCanvas() {
  const [count, setCount] = useState(1200);
  const [unique, setUnique] = useState(24);
  const [original, setOriginal] = useState(true);
  const [culling, setCulling] = useState(true);
  const [images, setImages] = useState<ImageSet[]>([]);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState<StressNode>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [built, setBuilt] = useState({ count: 0, unique: 0, ms: 0 });
  const abort = useRef<AbortController | null>(null);
  const owned = useRef<ImageSet[]>([]);
  const container = useRef<HTMLDivElement>(null);
  const { fitView, setViewport } = useReactFlow();
  const { metrics, reset } = useMetrics(container, nodes.length > 0);
  const fitting = useRef(false);
  useEffect(
    () => () => {
      abort.current?.abort();
      for (const image of owned.current) {
        URL.revokeObjectURL(image.original);
        URL.revokeObjectURL(image.thumb);
      }
    },
    [],
  );
  useEffect(() => {
    if (!images.length) return;
    setNodes((previous) =>
      previous.map((n) => ({
        ...n,
        data: {
          ...n.data,
          image:
            images[n.data.index % images.length][
              original ? "original" : "thumb"
            ],
        },
      })),
    );
    reset();
  }, [original, images, setNodes]);
  useEffect(() => {
    if (nodes.length && fitting.current) {
      fitting.current = false;
      requestAnimationFrame(() =>
        fitView({ padding: 0.1, minZoom: 0.005, maxZoom: 1 }),
      );
    }
  }, [nodes.length, fitView]);
  async function generate() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    setProgress(0);
    setNodes([]);
    setEdges([]);
    const start = performance.now();
    try {
      const next = await buildImages(unique, controller.signal, setProgress);
      if (controller.signal.aborted) {
        next.forEach((i) => {
          URL.revokeObjectURL(i.original);
          URL.revokeObjectURL(i.thumb);
        });
        return;
      }
      const graph = makeStressGraph(count, next, original);
      const previous = owned.current;
      owned.current = next;
      setImages(next);
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setBuilt({ count, unique, ms: performance.now() - start });
      fitting.current = true;
      reset();
      requestAnimationFrame(() =>
        previous.forEach((i) => {
          URL.revokeObjectURL(i.original);
          URL.revokeObjectURL(i.thumb);
        }),
      );
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  }
  const budget = 1000 / 60;
  const ready = nodes.length > 0;
  return (
    <main className="stress-page">
      <header className="stress-header">
        <a href="/">
          <ArrowLeft size={16} />
          回到分镜项目
        </a>
        <div>
          <b>FrameTree 性能实验室</b>
          <span>独立临时场景 · 不读写你的项目</span>
        </div>
        <button className="button subtle" onClick={() => location.reload()}>
          <RotateCcw size={14} />
          清空实验
        </button>
      </header>
      <div className="stress-settings">
        <label>
          图片节点
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            <option value={300}>300 · 轻度</option>
            <option value={1200}>1,200 · 中度</option>
            <option value={3000}>3,000 · 重度</option>
          </select>
        </label>
        <label>
          独立图片
          <select
            value={unique}
            onChange={(e) => setUnique(Number(e.target.value))}
          >
            <option value={8}>8 张</option>
            <option value={24}>24 张</option>
            <option value={48}>48 张</option>
          </select>
        </label>
        <button className="button primary" disabled={busy} onClick={generate}>
          <Play size={14} />
          {busy ? `生成图片 ${progress}/${unique}` : "生成压力场景"}
        </button>
        <div className="stress-switches">
          <label>
            <input
              type="checkbox"
              checked={original}
              onChange={(e) => setOriginal(e.target.checked)}
            />
            使用 2048px 原图（压力变量）
          </label>
          <label>
            <input
              type="checkbox"
              checked={culling}
              onChange={(e) => setCulling(e.target.checked)}
            />
            仅渲染视口内节点
          </label>
        </div>
      </div>
      <div className="stress-metrics">
        <Metric
          label="当前 FPS"
          value={ready ? String(metrics.fps) : "—"}
          warning={ready && metrics.fps < 45}
        />
        <Metric
          label="P95 帧间隔 / ms"
          value={metrics.p95.toFixed(1)}
          warning={metrics.p95 > budget * 1.5}
        />
        <Metric
          label="最长帧间隔 / ms"
          value={metrics.max.toFixed(0)}
          warning={metrics.max > 50}
        />
        <Metric
          label="长任务 / 累计 ms"
          value={`${metrics.long} / ${metrics.blocked.toFixed(0)}`}
        />
        <Metric
          label="实际 DOM 节点"
          value={`${metrics.nodes} / ${built.count}`}
        />
        <Metric
          label="已加载图片元素"
          value={`${metrics.decoded} / ${metrics.images}`}
        />
        <button className="button subtle" onClick={reset}>
          重置采样
        </button>
      </div>
      <div className="stress-content">
        <div className="stress-canvas" ref={container}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={types}
            onNodesChange={onNodesChange}
            nodesConnectable={false}
            deleteKeyCode={null}
            onlyRenderVisibleElements={culling}
            minZoom={0.005}
            maxZoom={2}
          >
            <Background color="#3c4a34" gap={25} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {!ready && (
            <div className="stress-empty">
              <b>{busy ? "正在构建可重复的图片负载…" : "让画布达到它的极限"}</b>
              <p>
                生成 {count.toLocaleString()} 个图片节点、
                {(count - 1).toLocaleString()} 条树状连线和 {unique} 张不同的
                2048 × 1152 图片。
              </p>
              <p>
                从上方生成场景后，拖动、缩放，再切换原图与视口裁剪观察变化。
              </p>
              {error && <p role="alert">{error}</p>}
            </div>
          )}
          <div className="stress-view-buttons">
            <button
              onClick={() =>
                fitView({ padding: 0.1, minZoom: 0.005, maxZoom: 1 })
              }
            >
              <Focus size={15} />
              全景：所有节点入镜
            </button>
            <button
              onClick={() =>
                setViewport({ x: 40, y: 40, zoom: 0.65 }, { duration: 300 })
              }
            >
              局部：观察拖拽与缩放
            </button>
          </div>
        </div>
        <aside className="stress-guide">
          <div className="eyebrow">REPRODUCIBLE BENCHMARK</div>
          <h2>
            同一张画布，
            <br />
            三种负载。
          </h2>
          <ol>
            <li>
              <b>节点与连线压力</b>
              <p>
                点「全景」，所有节点进入视口，即使启用视口裁剪也需要渲染。观察
                FPS 和帧间隔。
              </p>
            </li>
            <li>
              <b>图片解码压力</b>
              <p>
                切换 2048px 原图与 960px
                缩略图。不同图片具有不同像素内容，重复节点共享图片 URL。
              </p>
            </li>
            <li>
              <b>视口裁剪对比</b>
              <p>
                切换「局部」，开关「仅渲染视口内节点」。比较 DOM
                数量与拖拽流畅度。
              </p>
            </li>
          </ol>
          <div className="stress-facts">
            <b>当前数据集</b>
            <p>
              {built.count.toLocaleString()} 个节点 ·{" "}
              {Math.max(0, built.count - 1).toLocaleString()} 条边
            </p>
            <p>
              {built.unique} 张独立图片，生成耗时 {(built.ms / 1000).toFixed(2)}
              s
            </p>
            <p>
              独立位图 RGBA 理论体积：
              {(
                (built.unique * (original ? 2048 * 1152 : 960 * 540) * 4) /
                1024 /
                1024
              ).toFixed(0)}{" "}
              MiB
            </p>
            <small>
              理论体积非实际浏览器内存；解码缓存、GPU
              纹理与回收策略由浏览器决定。
            </small>
          </div>
          <p className="stress-note">
            原图直绘与关闭裁剪是对照变量，主工作台默认使用缩略图和视口裁剪。这里没有人为添加延迟或计算循环。指标每
            1.5 秒更新，后台标签暂停采样；浏览器不支持 Long Tasks API
            时长任务显示 0。
          </p>
          <p className="stress-note">
            图片用本地演示照片生成，无上传或远端请求。大量图片可能使标签页暂时卡顿；可直接返回分镜项目。
          </p>
        </aside>
      </div>
    </main>
  );
}
function Metric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className={`stress-metric ${warning ? "warning" : ""}`}>
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}
