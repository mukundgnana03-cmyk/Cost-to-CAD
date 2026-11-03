import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  Download,
  Layers,
  LoaderCircle,
  Plus,
  Send,
  Sparkles,
  Upload,
  X,
  Component,
  Settings2,
} from "lucide-react";
import Viewer from "./Viewer";
import type { MeshData, Project, Version } from "./types";
import "./style.css";
const sections = [
  "Part photographs",
  "Part description",
  "Part dimensions",
  "Bill of Materials",
  "3D workspace",
];
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, options);
  if (!r.headers.get("content-type")?.includes("application/json")) {
    throw new Error(
      "The CAD processing server is not reachable. Check the deployment's backend configuration.",
    );
  }
  const data = await r.json();
  if (!r.ok || data.backend_unavailable) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail),
    );
  }
  return data;
}
const fmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 3 });
function App() {
  const [projects, setProjects] = useState<Project[]>([]),
    [project, setProject] = useState<Project | null>(null),
    [version, setVersion] = useState<Version | null>(null),
    [mesh, setMesh] = useState<MeshData | null>(null);
  const [files, setFiles] = useState<File[]>([]),
    [primary, setPrimary] = useState(""),
    [uploading, setUploading] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null),
    [prompt, setPrompt] = useState(""),
    [messages, setMessages] = useState<{ role: string; text: string }[]>([]),
    [expanded, setExpanded] = useState<string | null>(null),
    [health, setHealth] = useState<{
      ai_configured: boolean;
      ai_provider: string | null;
      ai_model: string | null;
      catia_configured: boolean;
    } | null>(null);
  const busy = !!project && !["ready", "error"].includes(project.status);
  useEffect(() => {
    api<Project[]>("/api/projects")
      .then(setProjects)
      .catch((e) => setError(e.message));
    api<any>("/api/health")
      .then(setHealth)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!project) return;
    const timer = setInterval(() => {
      api<Project>(`/api/projects/${project.id}`)
        .then((p) => {
          setProject(p);
          setProjects((list) => [p, ...list.filter((x) => x.id !== p.id)]);
        })
        .catch((e) => setError(e.message));
    }, 1500);
    return () => clearInterval(timer);
  }, [project?.id]);
  useEffect(() => {
    if (!project?.current_version) return;
    let cancelled = false;
    const base = `/api/projects/${project.id}/versions/${project.current_version}`;
    Promise.all([api<Version>(base), api<MeshData>(base + "/files/mesh.json")])
      .then(([v, m]) => {
        if (!cancelled) {
          setVersion(v);
          setMesh(m);
          setSelected(null);
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [project?.id, project?.current_version]);
  const base =
    project && version
      ? `/api/projects/${project.id}/versions/${version.id}/files/`
      : "";
  function choose(p: Project) {
    setProject(p);
    setVersion(null);
    setMesh(null);
    setMessages([]);
    setSelected(null);
    setError("");
  }
  function pick(list: FileList | null) {
    if (!list) return;
    const f = Array.from(list);
    if (f.some((x) => !/\.(step|stp|catpart|catproduct)$/i.test(x.name))) {
      setError("Choose STEP, STP, CATPart or CATProduct files.");
      return;
    }
    setFiles(f);
    if (f.length === 1 && health) {
      upload(f, f[0].name);
    }
    setPrimary(
      f.find((x) => /catproduct$/i.test(x.name))?.name || f[0]?.name || "",
    );
    setError("");
  }
  function upload(uploadFiles: File[] = files, primaryName: string = primary) {
    if (!uploadFiles.length || uploading) return;
    setUploading(true);
    setError("");
    setProgress(0);
    const data = new FormData();
    uploadFiles.forEach((f) => data.append("files", f));
    data.append("primary", primaryName);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/projects");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        setProgress(Math.round((100 * e.loaded) / e.total));
    };
    xhr.onload = () => {
      setUploading(false);
      if (xhr.status === 202) {
        choose(JSON.parse(xhr.responseText));
        setFiles([]);
      } else {
        try {
          setError(JSON.parse(xhr.responseText).detail);
        } catch {
          setError("Upload failed");
        }
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setError("Network error during upload");
    };
    xhr.send(data);
  }
  async function edit() {
    if (!project || !version || !prompt.trim()) return;
    const text = prompt;
    setPrompt("");
    setError("");
    try {
      await api(`/api/projects/${project.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: version.id,
          message: text,
          selected_id: selected,
        }),
      });
      setMessages((m) => [
        ...m,
        { role: "user", text },
        {
          role: "system",
          text: "Request queued. A new version is saved only after geometry validation and rendering succeed.",
        },
      ]);
      setProject({ ...project, status: "editing", error: null });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const face = version?.analysis.faces.find((f) => f.id === selected);
  const edge = version?.analysis.edges.find((f) => f.id === selected);
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#">
          <Component size={28} />
          <span>
            FORM<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">ENGINEERING WORKSPACE</div>
        <div className="project-label">
          <div className="project-icon">
            <Box size={19} />
          </div>
          <span>
            CAD Intelligence<small>Local development</small>
          </span>
        </div>
        <div className="nav-label">MODEL ANALYSIS</div>
        <nav>
          {sections.map((name, i) => (
            <a key={name} href={`#section-${i}`}>
              <span className="nav-number">0{i + 1}</span>
              {name}
              {i === 4 && <span className="new-badge">AI</span>}
            </a>
          ))}
        </nav>
        <div className="nav-label recent-label">
          RECENT MODELS <span>{projects.length}</span>
        </div>
        <div className="recent">
          {projects.slice(0, 8).map((p) => (
            <button
              key={p.id}
              className={p.id === project?.id ? "chosen" : ""}
              onClick={() => choose(p)}
            >
              <Box size={15} />
              <span>{p.name}</span>
              <ChevronRight size={13} />
            </button>
          ))}
          {!projects.length && <p>Your imported models will appear here.</p>}
        </div>
        <div className="sidebar-bottom">
          <span className="online-dot" />{" "}
          {health ? "OpenCascade engine" : "CAD server not connected"}
          <div>
            <Settings2 size={15} /> Development environment
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumbs">
            Workspace <ChevronRight size={13} /> CAD analysis{" "}
            <ChevronRight size={13} />
            <strong>{project?.name || "New model"}</strong>
          </div>
          <span className="header-right">
            <span className="online-dot" /> Local storage{" "}
            <span className="avatar">EN</span>
          </span>
        </header>
        <div className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> FROM GEOMETRY TO INSIGHT
              </div>
              <h1>Your model. A new perspective.</h1>
              <p>
                Explore every detail, understand your design, and refine it with
                AI.
              </p>
            </div>
            <a href="#import" className="button secondary">
              <Plus size={16} /> Import model
            </a>
          </div>
          <section
            id="import"
            className="upload-card"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files);
            }}
          >
            <div className="upload-symbol">
              <Upload size={24} />
            </div>
            <div className="upload-copy">
              <h3>Upload your model. Get your results.</h3>
              <p>
                Drop a CAD model here or choose a file. Analysis starts
                automatically.
              </p>
              <div className="file-tags">
                <span>STEP / STP</span>
                <span>CATPart</span>
                <span>CATProduct + components</span>
                <small>200 MB combined</small>
              </div>
            </div>
            <label className="button primary">
              {uploading ? `Uploading ${progress}%` : "Upload 3D model"}{" "}
              <ArrowUpRight size={16} />
              <input
                type="file"
                multiple
                accept=".step,.stp,.CATPart,.CATProduct"
                onChange={(e) => pick(e.target.files)}
              />
            </label>
          </section>
          {files.length > 0 && (
            <div className="import-options">
              <span>{files.length} file(s) selected</span>
              <label>
                Primary model{" "}
                <select
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                >
                  {files.map((f) => (
                    <option key={f.name}>{f.name}</option>
                  ))}
                </select>
              </label>
              <button
                className="button primary"
                onClick={() => upload()}
                disabled={uploading || !health}
              >
                {uploading ? `Uploading ${progress}%` : "Analyze model"}
              </button>
            </div>
          )}
          <div className="support-note">
            <Check size={13} /> Precise measurements from CAD geometry{" "}
            <span>·</span> Original files always preserved <span>·</span> Native
            CATIA requires a licensed adapter
          </div>
          {(error || project?.error) && (
            <div className="alert" role="alert">
              <strong>Action needed</strong> {error || project?.error}
              <button
                aria-label="Dismiss local error"
                onClick={() => setError("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {busy && (
            <div className="processing" role="status">
              <LoaderCircle className="spin" size={20} />
              <div>
                <strong>{project?.status.toUpperCase()}</strong>
                <p>{project?.message}</p>
              </div>
              <span>Processing locally</span>
            </div>
          )}
          <div className="model-bar">
            <div>
              <span className="model-dot" />
              <strong>{project?.name || "No model imported"}</strong>
              <span className="muted">
                {version
                  ? `${version.analysis.solid_count} solid(s) · millimeters`
                  : "Import a STEP model to begin"}
              </span>
            </div>
            {project && version && (
              <div>
                <select
                  aria-label="Version history"
                  value={version.id}
                  onChange={async (e) => {
                    try {
                      const v = await api<Version>(
                        `/api/projects/${project.id}/versions/${e.target.value}`,
                      );
                      const m = await api<MeshData>(
                        `/api/projects/${project.id}/versions/${e.target.value}/files/mesh.json`,
                      );
                      setVersion(v);
                      setMesh(m);
                      setSelected(null);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  {project.versions.map((id, i) => (
                    <option value={id} key={id}>
                      Version {i + 1}
                      {id === project.current_version ? " · Latest" : ""}
                    </option>
                  ))}
                </select>
                <a className="download" href={base + "model.step"}>
                  <Download size={15} /> STEP
                </a>
              </div>
            )}
          </div>
          <Section
            index={0}
            title="Part photographs"
            subtitle="A clearer view, from every angle."
            tag="BLENDER STUDIO"
          >
            <div className="gallery">
              {["isometric", "front", "top", "side"].map((view, i) => (
                <button
                  key={view}
                  className={`photo ${i === 0 ? "hero-photo" : ""}`}
                  disabled={!version}
                  onClick={() => setExpanded(base + view + ".png")}
                >
                  {version ? (
                    <img
                      src={base + view + ".png"}
                      alt={`${view} engineering render`}
                    />
                  ) : (
                    <div className="photo-empty">
                      <Box size={i === 0 ? 65 : 38} />
                      <span>
                        {i === 0
                          ? "Your next design, in focus"
                          : "Awaiting model"}
                      </span>
                    </div>
                  )}
                  <span className="photo-label">
                    {view}
                    <ArrowUpRight size={14} />
                  </span>
                  {i === 0 && <span className="studio-tag">STUDIO / 01</span>}
                </button>
              ))}
            </div>
          </Section>
          <Section
            index={1}
            title="Part description"
            subtitle="Engineering context, grounded in your geometry."
            tag={
              health?.ai_configured
                ? health?.ai_provider === "openai"
                  ? "OPENAI"
                  : "AI"
                : "GEOMETRY ANALYSIS"
            }
          >
            <div className="description-grid">
              <div className="description-main">
                <div className="icon-title">
                  <Sparkles size={18} />
                  <h3>{version?.description.name || "Design intelligence"}</h3>
                </div>
                <p>
                  {version?.description.description ||
                    "A description of your model will appear here after import. Optional AI adds visual interpretation and likely function; uploads, measurements and renders work without it."}
                </p>
                {version && (
                  <>
                    <p>{version.description.geometric_characteristics}</p>
                    <p>
                      <b>Likely function</b> ·{" "}
                      {version.description.likely_function}
                    </p>
                    <small className="muted">
                      {version.description.source}
                    </small>
                    {version.ai_warning && (
                      <p className="warning">{version.ai_warning}</p>
                    )}
                  </>
                )}
              </div>
              <div className="description-details">
                <h4>FEATURES & MATERIAL</h4>
                {version ? (
                  <>
                    <div className="chips">
                      {version.description.features.length ? (
                        version.description.features.map((f, i) => (
                          <span key={i}>{f}</span>
                        ))
                      ) : (
                        <span>No classified features</span>
                      )}
                    </div>
                    <p>
                      Material{" "}
                      <strong>
                        {version.description.material || "Not specified"}
                      </strong>
                    </p>
                    <h4>PROCESS CANDIDATES · ASSUMPTIONS</h4>
                    {version.description.manufacturing_candidates.length ? (
                      version.description.manufacturing_candidates.map(
                        (p, i) => <p key={i}>Assumption: {p}</p>,
                      )
                    ) : (
                      <p className="muted">Not determined</p>
                    )}
                  </>
                ) : (
                  <p className="muted">
                    Hole features, material metadata and manufacturing
                    assumptions will be listed here.
                  </p>
                )}
              </div>
            </div>
          </Section>
          <Section
            index={2}
            title="Part dimensions"
            subtitle="Measured by OpenCascade. Never estimated from images."
            tag="PRECISION GEOMETRY"
          >
            <div className="metrics">
              {[
                ["Length", version?.analysis.length, "mm"],
                ["Width", version?.analysis.width, "mm"],
                ["Height", version?.analysis.height, "mm"],
                ["Volume", version?.analysis.volume, "mm³"],
                ["Surface area", version?.analysis.surface_area, "mm²"],
              ].map(([label, value, unit]) => (
                <div className="metric" key={String(label)}>
                  <span>{label}</span>
                  <strong>
                    {typeof value === "number" ? fmt(value) : "—"}
                    <small>{unit}</small>
                  </strong>
                </div>
              ))}
            </div>
            <div className="dimension-detail">
              <div>
                <h4>BOUNDING BOX</h4>
                <p>
                  {version
                    ? `Min [${version.analysis.bounding_box.min.map(fmt).join(", ")}] · Max [${version.analysis.bounding_box.max.map(fmt).join(", ")}] mm`
                    : "Bounding coordinates appear after import."}
                </p>
              </div>
              <div>
                <h4>CYLINDRICAL HOLE SURFACES</h4>
                <div className="chips">
                  {version?.analysis.holes.length ? (
                    version.analysis.holes.map((h, i) => (
                      <button
                        key={h.id}
                        onClick={() => {
                          setSelected(h.id);
                          document
                            .getElementById("section-4")
                            ?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        H{i + 1} · Ø{fmt(h.diameter!)} mm
                      </button>
                    ))
                  ) : (
                    <span>None identified</span>
                  )}
                </div>
              </div>
            </div>
          </Section>
          <Section
            index={3}
            title="Bill of Materials"
            subtitle={
              version?.bom.kind === "assembly"
                ? "Component occurrences from the STEP product structure."
                : "Single-part information record. No assembly inferred."
            }
            tag={version?.bom.kind === "assembly" ? "ASSEMBLY" : "PART RECORD"}
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>PART NUMBER</th>
                    <th>COMPONENT NAME</th>
                    <th>QTY</th>
                    <th>MATERIAL</th>
                    <th>DESCRIPTION</th>
                  </tr>
                </thead>
                <tbody>
                  {version?.bom.items.map((row, i) => (
                    <tr key={i}>
                      <td className="mono">
                        {row.part_number || "Not specified"}
                      </td>
                      <td>
                        <Box size={15} />
                        {row.name}
                      </td>
                      <td>{row.quantity}</td>
                      <td>{row.material || "Not specified"}</td>
                      <td>{row.description}</td>
                    </tr>
                  )) || (
                    <tr>
                      <td colSpan={5} className="empty-row">
                        Your part or assembly record will appear here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>
          <Section
            index={4}
            title="Interactive 3D workspace"
            subtitle="Select a feature. Describe the change. Keep every version."
            tag="DESIGN WITH AI"
          >
            <div className="workspace-grid">
              <div className="viewer-column">
                {mesh && version ? (
                  <Viewer
                    mesh={mesh}
                    version={version}
                    selected={selected}
                    onSelect={setSelected}
                  />
                ) : (
                  <div className="viewer-empty">
                    <Layers size={50} />
                    <h3>A workspace for your next idea</h3>
                    <p>Import a model to explore its geometry in 3D.</p>
                  </div>
                )}
                <div className="selection-info">
                  <span className="online-dot" />
                  <strong>
                    {face
                      ? "Face selected"
                      : edge
                        ? "Edge selected"
                        : "No selection"}
                  </strong>
                  <span>
                    {face
                      ? `${face.type} · ${fmt(face.area)} mm²${face.radius ? " · R" + fmt(face.radius) + " mm" : ""}`
                      : edge
                        ? `${edge.type} · ${fmt(edge.length)} mm${edge.radius ? " · R" + fmt(edge.radius) + " mm" : ""}`
                        : "Click a face or edge in the viewer"}
                  </span>
                  {selected && (
                    <small className="mono">{selected.slice(0, 8)}</small>
                  )}
                </div>
              </div>
              <div className="chat">
                <div className="chat-heading">
                  <Sparkles size={18} />
                  <div>
                    <strong>Engineering copilot</strong>
                    <small>
                      {health?.ai_configured
                        ? `AI configured · ${health?.ai_model || health?.ai_provider}`
                        : "Ready to test · no API key required"}
                    </small>
                  </div>
                </div>
                <div className="chat-body">
                  <div className="assistant-message">
                    {health?.ai_configured
                      ? "Select a face or edge and describe your change. I’ll interpret it; the CAD kernel validates and applies supported edits."
                      : "Upload a STEP part to test measurements, renders and 3D editing. Select a face or edge and use a command below. GPT interpretation is optional."}
                  </div>
                  <div className="suggestions">
                    {[
                      "Apply a machined surface finish",
                      "Highlight",
                      "Fillet 1 mm",
                      "Chamfer 1 mm",
                      "Increase hole diameter to 12 mm",
                    ].map((s) => (
                      <button
                        key={s}
                        disabled={!version || busy}
                        onClick={() => setPrompt(s)}
                      >
                        {s}
                        <ArrowUpRight size={12} />
                      </button>
                    ))}
                  </div>
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={
                        m.role === "user" ? "user-message" : "assistant-message"
                      }
                    >
                      {m.text}
                    </div>
                  ))}
                  {project?.error && (
                    <div className="chat-error">{project.error}</div>
                  )}
                  {busy && (
                    <div className="chat-status">
                      <LoaderCircle size={14} className="spin" />{" "}
                      {project?.message}
                    </div>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    edit();
                  }}
                >
                  <textarea
                    aria-label="Modification instruction"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe a change to your model…"
                    disabled={!version || busy}
                  />
                  <div>
                    <span>
                      {selected
                        ? "Selection attached"
                        : "Select a face or edge first"}
                    </span>
                    <button
                      title="Send modification"
                      disabled={
                        !version ||
                        busy ||
                        !prompt.trim() ||
                        version.id !== project?.current_version
                      }
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </form>
                <p className="chat-footnote">
                  Precision edits use OpenCascade. Appearance uses Blender.
                  <br />
                  Unsupported operations leave your model unchanged.
                </p>
              </div>
            </div>
          </Section>
          {project && (
            <div className="originals">
              <strong>Preserved originals</strong>
              {project.original_files.map((n) => (
                <a
                  key={n}
                  href={`/api/projects/${project.id}/originals/${encodeURIComponent(n)}`}
                >
                  <Download size={13} />
                  {n}
                </a>
              ))}
              {version && <a href={base + "model.stl"}>Download STL</a>}
            </div>
          )}
          <footer>
            <Component size={16} /> FORM{" "}
            <span>Engineering intelligence. Built around your geometry.</span>
            <small>Local prototype · v0.1</small>
          </footer>
        </div>
      </main>
      {expanded && (
        <div className="lightbox" onClick={() => setExpanded(null)}>
          <button aria-label="Close image">
            <X />
          </button>
          <img src={expanded} alt="Expanded engineering render" />
        </div>
      )}
    </div>
  );
}
function Section({
  index,
  title,
  subtitle,
  tag,
  children,
}: {
  index: number;
  title: string;
  subtitle: string;
  tag: string;
  children: React.ReactNode;
}) {
  return (
    <section className="analysis-section" id={`section-${index}`}>
      <div className="section-heading">
        <span className="section-index">0{index + 1}</span>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className="section-tag">{tag}</span>
      </div>
      {children}
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
