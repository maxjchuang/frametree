import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useReactFlow,
  type NodeProps,
  type Node,
  type NodeChange,
  applyNodeChanges,
} from "@xyflow/react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Download,
  Expand,
  Film,
  Focus,
  GitBranch,
  ImagePlus,
  Layers,
  LayoutGrid,
  Maximize2,
  Plus,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  descendants,
  initialProject,
  layoutTree,
  validateProject,
  visibleFrames,
  type Frame,
  type Project,
} from "./model";
import {
  download,
  getAsset,
  importImage,
  loadProject,
  putAsset,
  saveProject,
  toDataURL,
} from "./storage";
import "@xyflow/react/dist/style.css";
import "./style.css";
type FrameNode = Node<Frame, "frame">;
const Actions = createContext<{
  add: (id: string) => void;
  toggle: (id: string) => void;
  preview: (f: Frame) => void;
}>({ add: () => {}, toggle: () => {}, preview: () => {} });
const ImageNode = memo(({ data: f, selected }: NodeProps<FrameNode>) => {
  const actions = useContext(Actions);
  return (
    <article className={`frame-card ${selected ? "chosen" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="frame-image" onDoubleClick={() => actions.preview(f)}>
        {f.image ? (
          <img src={f.image} alt={f.title} loading="lazy" decoding="async" />
        ) : (
          <div className="empty-image">
            <ImagePlus size={32} />
            <span>上传画面，开始这个镜头</span>
          </div>
        )}
        <span className="kind">{f.kind}</span>
        <button
          className="image-expand nodrag"
          aria-label={`查看${f.title}大图`}
          onClick={() => actions.preview(f)}
        >
          <Expand size={15} />
        </button>
        {f.duration > 0 && (
          <span className="duration">{f.duration.toFixed(1)}s</span>
        )}
      </div>
      <div className="frame-info">
        <div>
          <span className="frame-index">
            {f.kind === "镜头" ? "SHOT" : f.kind === "场景" ? "SCENE" : "STORY"}
          </span>
          <h3>{f.title}</h3>
          <p>{f.shot}</p>
        </div>
        <button
          className="branch-button nodrag"
          aria-label={`折叠或展开${f.title}`}
          onClick={() => actions.toggle(f.id)}
        >
          {f.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      <button
        className="add-branch nodrag"
        aria-label={`为${f.title}添加子节点`}
        onClick={() => actions.add(f.id)}
      >
        <Plus size={15} />
      </button>
      <Handle type="source" position={Position.Right} />
    </article>
  );
});
const nodeTypes = { frame: ImageNode };
function App() {
  const [project, setProject] = useState<Project>(initialProject);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState("shot1");
  const [saveState, setSaveState] = useState("正在读取");
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [lightbox, setLightbox] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [hydrationError, setHydrationError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const saveQueue = useRef(Promise.resolve());
  const { fitView, setCenter } = useReactFlow();
  const active = project.frames.find((f) => f.id === selected);
  const shots = project.frames.filter((f) => f.kind === "镜头");
  useEffect(() => {
    loadProject()
      .then((p) => {
        if (p) setProject(validateProject(p));
        setReady(true);
      })
      .catch(() => {
        setHydrationError(true);
        setToast("本地项目读取失败。刷新重试，以免覆盖已有数据。");
      });
  }, []);
  useEffect(() => {
    if (!ready) return;
    setSaveState("正在保存");
    const timer = setTimeout(() => {
      saveQueue.current = saveQueue.current
        .catch(() => {})
        .then(() => saveProject(project));
      saveQueue.current
        .then(() => setSaveState("已保存到本机"))
        .catch(() => setSaveState("保存失败，请导出备份"));
    }, 500);
    return () => clearTimeout(timer);
  }, [project, ready]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(
    () => () => {
      if (lightbox?.url.startsWith("blob:")) URL.revokeObjectURL(lightbox.url);
    },
    [lightbox],
  );
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const patch = (id: string, changes: Partial<Frame>) =>
    setProject((p) => ({
      ...p,
      frames: p.frames.map((f) => (f.id === id ? { ...f, ...changes } : f)),
    }));
  const add = useCallback((id: string) => {
    const newId = crypto.randomUUID();
    setProject((p) => {
      const parent = p.frames.find((f) => f.id === id)!;
      const siblings = p.frames.filter((f) => f.parentId === id);
      return {
        ...p,
        frames: [
          ...p.frames.map((f) =>
            f.id === id ? { ...f, collapsed: false } : f,
          ),
          {
            id: newId,
            parentId: id,
            title: parent.kind === "故事" ? "新的场景" : "新的镜头",
            kind: parent.kind === "故事" ? "场景" : "镜头",
            image: "",
            script: "",
            prompt: "",
            duration: 5,
            shot: "未设置镜头",
            x: parent.x + 390,
            y: parent.y + siblings.length * 300,
          },
        ],
      };
    });
    setSelected(newId);
  }, []);
  const toggle = useCallback(
    (id: string) =>
      setProject((p) => ({
        ...p,
        frames: p.frames.map((f) =>
          f.id === id ? { ...f, collapsed: !f.collapsed } : f,
        ),
      })),
    [],
  );
  const preview = useCallback(async (f: Frame) => {
    try {
      const blob = f.assetId ? await getAsset(f.assetId) : undefined;
      if (!blob && !f.image) {
        setToast("先上传一张图片");
        return;
      }
      setZoom(1);
      setLightbox({
        url: blob ? URL.createObjectURL(blob) : f.image,
        title: f.title,
      });
    } catch {
      setToast("原图读取失败");
    }
  }, []);
  const nodes = visibleFrames(project.frames).map((f) => ({
    id: f.id,
    type: "frame" as const,
    position: { x: f.x, y: f.y },
    data: f,
    width: 300,
    height: 264,
    selected: f.id === selected,
  }));
  const visibleIds = new Set(nodes.map((n) => n.id));
  const edges = project.frames
    .filter(
      (f) => f.parentId && visibleIds.has(f.id) && visibleIds.has(f.parentId),
    )
    .map((f) => ({
      id: `${f.parentId}-${f.id}`,
      source: f.parentId!,
      target: f.id,
      type: "smoothstep",
      style: { stroke: "#46584d", strokeWidth: 1.5 },
    }));
  const onNodesChange = useCallback((changes: NodeChange<FrameNode>[]) => {
    setProject((p) => {
      const all = p.frames.map((f) => ({
        id: f.id,
        type: "frame" as const,
        position: { x: f.x, y: f.y },
        data: f,
      }));
      const positions = changes.filter((c) => c.type === "position");
      if (!positions.length) return p;
      const updated = applyNodeChanges(positions, all);
      return {
        ...p,
        frames: p.frames.map((f) => {
          const n = updated.find((n) => n.id === f.id)!;
          return { ...f, x: n.position.x, y: n.position.y };
        }),
      };
    });
  }, []);
  async function upload(fileList: FileList | null) {
    if (!fileList || !active) return;
    const files = Array.from(fileList);
    const parent = active.id;
    try {
      for (let i = 0; i < files.length; i++) {
        const image = await importImage(files[i]);
        if (i === 0) patch(parent, image);
        else {
          const id = crypto.randomUUID();
          setProject((p) => {
            const original = p.frames.find((f) => f.id === parent)!;
            return {
              ...p,
              frames: [
                ...p.frames,
                {
                  ...original,
                  ...image,
                  id,
                  parentId: original.parentId ?? original.id,
                  kind: original.parentId ? original.kind : "场景",
                  collapsed: false,
                  title: files[i].name.replace(/\.[^.]+$/, ""),
                  x: original.x,
                  y: original.y + i * 300,
                },
              ],
            };
          });
        }
      }
      setToast("图片已导入，原图保存在本机");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function exportProject() {
    try {
      setToast("正在打包项目与原图…");
      const assets: Record<string, string> = {};
      for (const f of project.frames) {
        if (f.assetId) {
          const blob = await getAsset(f.assetId);
          if (!blob) throw Error("部分原图丢失，无法完整导出");
          assets[f.assetId] = await toDataURL(blob);
        }
      }
      download(
        `${project.title}.frametree.json`,
        new Blob([JSON.stringify({ ...project, assets })], {
          type: "application/json",
        }),
      );
      setToast("项目已导出，包含原图");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function importProject(file?: File) {
    if (!file) return;
    if (!confirm("导入将替换当前画布。请先导出备份，是否继续？")) return;
    try {
      if (file.size > 300 * 1024 * 1024) throw Error("项目文件不能超过 300 MB");
      const raw = JSON.parse(await file.text());
      const p = validateProject(raw);
      const mapping = new Map<string, string>();
      for (const f of p.frames)
        if (f.assetId && !mapping.has(f.assetId)) {
          const data = raw.assets?.[f.assetId];
          if (
            typeof data !== "string" ||
            !/^data:image\/(jpeg|png|webp);base64,/.test(data)
          )
            throw Error("项目缺少原图资源");
          const id = crypto.randomUUID();
          const blob = await (await fetch(data)).blob();
          await putAsset(id, blob);
          mapping.set(f.assetId, id);
        }
      p.frames = p.frames.map((f) => ({
        ...f,
        assetId: f.assetId ? mapping.get(f.assetId) : undefined,
      }));
      setProject(p);
      setSelected(p.frames[0].id);
      setTimeout(() => fitView({ padding: 0.2 }), 100);
      setToast("项目已导入");
    } catch (e) {
      setToast(`导入失败：${(e as Error).message}`);
    }
  }
  function remove() {
    if (!active?.parentId) return;
    const ids = descendants(project.frames, active.id);
    if (!confirm(`删除「${active.title}」及其 ${ids.size - 1} 个子节点？`))
      return;
    setProject((p) => ({
      ...p,
      frames: p.frames.filter((f) => !ids.has(f.id)),
    }));
    setSelected(active.parentId);
  }
  function exportScript() {
    const lines = [`# ${project.title}`];
    function walk(f: Frame, depth: number) {
      lines.push(
        `\n${"#".repeat(Math.min(depth + 2, 6))} ${f.title}\n`,
        `${f.shot}${f.kind === "镜头" ? ` · ${f.duration} 秒` : ""}\n`,
        f.script,
        `\n**生成提示词**\n\n${f.prompt}`,
      );
      project.frames
        .filter((c) => c.parentId === f.id)
        .forEach((c) => walk(c, depth + 1));
    }
    project.frames.filter((f) => !f.parentId).forEach((f) => walk(f, 0));
    download(
      "storyboard.md",
      new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" }),
    );
  }
  if (!ready)
    return (
      <div className="loading">
        {hydrationError
          ? "本地数据读取失败，请刷新后重试"
          : "正在打开你的分镜工作台…"}
      </div>
    );
  return (
    <Actions.Provider value={{ add, toggle, preview }}>
      <div className="app">
        <aside className="rail">
          <div className="brand">
            <GitBranch size={25} />
          </div>
          <button className="rail-active" title="分镜画布">
            <LayoutGrid size={21} />
          </button>
          <button title="导入项目" onClick={() => projectRef.current?.click()}>
            <Upload size={20} />
          </button>
          <button title="导出脚本" onClick={exportScript}>
            <Film size={21} />
          </button>
          <div className="rail-bottom">
            <span>FT</span>
          </div>
        </aside>
        <div className="workspace">
          <header>
            <div className="breadcrumb">
              工作空间 <ChevronRight size={13} />
              <span>分镜项目</span>
            </div>
            <div className="header-actions">
              <span className="save-status">
                <i />
                {saveState}
              </span>
              <button
                className="button subtle"
                onClick={() => projectRef.current?.click()}
              >
                <Upload size={14} />
                导入
              </button>
              <button className="button primary" onClick={exportProject}>
                <Download size={14} />
                导出项目
              </button>
            </div>
          </header>
          <div className="project-heading">
            <div>
              <div className="eyebrow">FRAMETREE / STORYBOARD STUDIO</div>
              <input
                className="project-title"
                aria-label="项目名称"
                value={project.title}
                onChange={(e) =>
                  setProject((p) => ({ ...p, title: e.target.value }))
                }
              />
              <p>让灵感生长，让每一帧都有故事。</p>
            </div>
            <div className="project-stats">
              <span>
                <b>{project.frames.length}</b>画面节点
              </span>
              <span>
                <b>{shots.length}</b>分镜镜头
              </span>
              <span>
                <b>
                  {shots.reduce((n, f) => n + f.duration, 0)}
                  <small>s</small>
                </b>
                预计时长
              </span>
            </div>
          </div>
          <div className="editor">
            <section className="canvas-section">
              <div className="canvas-toolbar">
                <div className="view-label">
                  <Layers size={16} />
                  <b>分镜画布</b>
                  <span>树状视图</span>
                </div>
                <div className="canvas-tools">
                  <button
                    title="自动排列树"
                    onClick={() => {
                      setProject((p) => ({
                        ...p,
                        frames: layoutTree(p.frames),
                      }));
                      setTimeout(() => fitView({ padding: 0.15 }), 80);
                    }}
                  >
                    <GitBranch size={16} />
                    <span>自动布局</span>
                  </button>
                  <button
                    title="适应画布"
                    onClick={() => fitView({ padding: 0.18 })}
                  >
                    <Focus size={17} />
                  </button>
                  <button
                    className="new-node"
                    onClick={() => add(active?.id ?? "story")}
                  >
                    <Plus size={15} />
                    <span>添加节点</span>
                  </button>
                </div>
              </div>
              <div className="canvas">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onNodeClick={(_, n) => setSelected(n.id)}
                  fitView
                  fitViewOptions={{ padding: 0.17 }}
                  minZoom={0.08}
                  maxZoom={2.5}
                  onlyRenderVisibleElements
                  nodesConnectable={false}
                  deleteKeyCode={null}
                >
                  <Background color="#343a35" gap={24} size={1} />
                  <Controls showInteractive={false} />
                  <MiniMap
                    nodeColor="#70876a"
                    maskColor="rgba(13,17,15,.65)"
                    pannable
                    zoomable
                  />
                </ReactFlow>
                <div className="canvas-hint">
                  拖动画布移动 · 滚轮缩放 · 双击图片查看原图
                </div>
              </div>
            </section>
            <aside className="inspector">
              <div className="inspector-title">
                <Settings2 size={16} />
                <b>画面详情</b>
                <span>PROPERTIES</span>
              </div>
              {active && (
                <div className="inspector-body">
                  <div className="section-label">
                    {active.kind}{" "}
                    <span>
                      {String(project.frames.indexOf(active) + 1).padStart(
                        2,
                        "0",
                      )}
                    </span>
                  </div>
                  <input
                    className="node-title"
                    aria-label="节点名称"
                    value={active.title}
                    onChange={(e) =>
                      patch(active.id, { title: e.target.value })
                    }
                  />
                  <button
                    className="inspector-image"
                    onClick={() => preview(active)}
                  >
                    {active.image ? (
                      <img src={active.image} alt={active.title} />
                    ) : (
                      <ImagePlus size={32} />
                    )}
                    <span>
                      <Maximize2 size={13} /> 查看大图
                    </span>
                  </button>
                  <button
                    className="button upload-image"
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImagePlus size={15} />
                    {active.image ? "替换图片 / 批量导入" : "上传分镜图片"}
                  </button>
                  <p className="upload-help">JPG / PNG / WebP · 原图本地保存</p>
                  <div className="field-row">
                    <label>
                      画面类型
                      <select
                        value={active.kind}
                        onChange={(e) =>
                          patch(active.id, {
                            kind: e.target.value as Frame["kind"],
                          })
                        }
                      >
                        <option>故事</option>
                        <option>场景</option>
                        <option>镜头</option>
                      </select>
                    </label>
                    <label>
                      时长 / 秒
                      <input
                        type="number"
                        min="0"
                        max="3600"
                        aria-label="时长"
                        value={active.duration}
                        onChange={(e) =>
                          patch(active.id, {
                            duration: Math.max(
                              0,
                              Math.min(3600, Number(e.target.value)),
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    景别与运镜
                    <input
                      value={active.shot}
                      onChange={(e) =>
                        patch(active.id, { shot: e.target.value })
                      }
                      placeholder="例如：中景 · 缓慢推进"
                    />
                  </label>
                  <label>
                    画面脚本
                    <textarea
                      rows={3}
                      value={active.script}
                      onChange={(e) =>
                        patch(active.id, { script: e.target.value })
                      }
                      placeholder="这一帧里，故事如何发生？"
                    />
                  </label>
                  <label className="prompt-label">
                    <span>
                      AI 生成提示词 <i>PROMPT</i>
                    </span>
                    <textarea
                      rows={5}
                      value={active.prompt}
                      onChange={(e) =>
                        patch(active.id, { prompt: e.target.value })
                      }
                      placeholder="描述主体、场景、光线、风格与镜头运动…"
                    />
                  </label>
                  <button
                    className="button copy"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(active.prompt);
                        setToast("提示词已复制");
                      } catch {
                        setToast("复制失败，请选中文本手动复制");
                      }
                    }}
                  >
                    复制提示词 <ArrowUpRight size={15} />
                  </button>
                  <div className="inspector-footer">
                    <button onClick={() => add(active.id)}>
                      <Plus size={15} />
                      添加子节点
                    </button>
                    <button
                      title="删除当前分支"
                      disabled={!active.parentId}
                      onClick={remove}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )}
            </aside>
          </div>
          <footer>
            <span>
              <i /> 本地工作空间 <span className="footer-divider">/</span>{" "}
              图片优先的创作流程
            </span>
            <button onClick={exportScript}>
              <Clapperboard size={14} />
              导出分镜脚本 <ArrowUpRight size={13} />
            </button>
          </footer>
        </div>
      </div>
      <div className="search-widget">
        <Search size={15} />
        <input
          aria-label="查找节点"
          placeholder="查找画面…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <div className="search-results">
            {project.frames
              .filter((f) =>
                f.title.toLowerCase().includes(query.toLowerCase()),
              )
              .map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setSelected(f.id);
                    setProject((p) => ({
                      ...p,
                      frames: p.frames.map((n) => ({ ...n, collapsed: false })),
                    }));
                    setCenter(f.x + 150, f.y + 120, {
                      zoom: 0.9,
                      duration: 500,
                    });
                    setQuery("");
                  }}
                >
                  {f.title}
                </button>
              ))}
            {!project.frames.some((f) =>
              f.title.toLowerCase().includes(query.toLowerCase()),
            ) && <p>没有找到画面</p>}
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={projectRef}
        type="file"
        accept=".json"
        hidden
        onChange={(e) => {
          void importProject(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {lightbox && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="原图查看器"
        >
          <div className="lightbox-bar">
            <b>{lightbox.title}</b>
            <div>
              <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
                −
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
                +
              </button>
              <button title="重置缩放" onClick={() => setZoom(1)}>
                <Focus size={18} />
              </button>
              <button title="关闭" onClick={() => setLightbox(null)}>
                <X size={21} />
              </button>
            </div>
          </div>
          <div className="lightbox-scroll">
            <img
              src={lightbox.url}
              alt={lightbox.title}
              style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
            />
          </div>
          <p>按 Esc 关闭 · 放大后滚动查看细节</p>
        </div>
      )}
    </Actions.Provider>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  </React.StrictMode>,
);
