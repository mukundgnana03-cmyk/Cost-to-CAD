import { useRef, useState } from "react";
import {
  Component,
  Upload,
  Box,
  Download,
  Share2,
  LoaderCircle,
  ArrowUpRight,
  Send,
  ShieldCheck,
} from "lucide-react";
import Viewer from "../Viewer";
import type { MeshData, Version } from "../types";
import { snapshots } from "./snapshots";
import "./playground.css";
type Result = {
  version: Version;
  mesh: MeshData;
  step: Blob;
  views: Record<string, string>;
};
const fmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 3 });
export default function Playground() {
  const [results, setResults] = useState<Result[]>([]),
    [active, setActive] = useState(0),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [command, setCommand] = useState(""),
    [notice, setNotice] = useState("");
  const worker = useRef<Worker | null>(null);
  const requests = useRef(
    new Map<
      string,
      {
        resolve: (x: Omit<Result, "views">) => void;
        reject: (e: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    >(),
  );
  const original = useRef<File | null>(null);
  const current = results[active];
  function engine() {
    if (!worker.current) {
      const w = new Worker(new URL("./cad.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.current = w;
      w.onmessage = (e) => {
        const pending = requests.current.get(e.data.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        requests.current.delete(e.data.requestId);
        e.data.error
          ? pending.reject(new Error(e.data.error))
          : pending.resolve(e.data.output);
      };
      w.onerror = () => {
        for (const request of requests.current.values()) {
          clearTimeout(request.timer);
          request.reject(
            new Error(
              "The browser CAD engine stopped. Download any result and reload to start again.",
            ),
          );
        }
        requests.current.clear();
        w.terminate();
        worker.current = null;
      };
    }
    return worker.current;
  }
  async function process(payload: Record<string, unknown>) {
    if (busy) return;
    setError("");
    setNotice("");
    setBusy(
      results.length
        ? "Updating geometry and previews…"
        : "Loading CAD engine and analyzing geometry locally…",
    );
    try {
      const w = engine(),
        requestId = crypto.randomUUID();
      const result = await new Promise<Omit<Result, "views">>(
        (resolve, reject) => {
          const timer = setTimeout(() => {
            requests.current.delete(requestId);
            w.terminate();
            worker.current = null;
            reject(
              new Error(
                "This model took too long for the browser playground. Try a smaller STEP file. Reload to edit earlier results.",
              ),
            );
          }, 90000);
          requests.current.set(requestId, { resolve, reject, timer });
          w.postMessage({ ...payload, requestId });
        },
      );
      setBusy("Creating four WebGL previews…");
      const views = snapshots(result.mesh, result.version);
      const completed = { ...result, views };
      setResults((list) => {
        const next = [...list, completed];
        setActive(next.length - 1);
        return next;
      });
      setSelected(null);
      setCommand("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not process model. Previous results are preserved.",
      );
    } finally {
      setBusy("");
    }
  }
  function choose(file: File | undefined) {
    if (!file || busy) return;
    if (!/\.(step|stp)$/i.test(file.name)) {
      setError(
        "Choose STEP/STP for the public playground. Native CATIA files require the licensed full app.",
      );
      return;
    }
    if (!file.size || file.size > 20 * 1024 * 1024) {
      setError("Choose a nonempty STEP file up to 20 MB.");
      return;
    }
    original.current = file;
    process({ operation: "import", file });
  }
  function save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(location.href.split("#")[0]);
      setNotice(
        "Website link copied. Each visitor opens their own private modeling session.",
      );
    } catch {
      setNotice(
        "Copy this page’s address from your browser to share the playground.",
      );
    }
  }
  const a = current?.version.analysis;
  const face = a?.faces.find((f) => f.id === selected),
    edge = a?.edges.find((e) => e.id === selected);
  return (
    <div className="app playground">
      <aside className="sidebar">
        <a className="brand" href="#">
          <Component size={28} />
          <span>
            FORM<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">PUBLIC CAD PLAYGROUND</div>
        <div className="project-label">
          <div className="project-icon">
            <Box size={19} />
          </div>
          <span>
            Upload. Explore. Refine.<small>No account or API key needed</small>
          </span>
        </div>
        <div className="nav-label">EXPLORE YOUR MODEL</div>
        <nav>
          {[
            "Engineering views",
            "Part description",
            "Exact dimensions",
            "Part record",
            "Interactive workspace",
          ].map((label, i) => (
            <a href={"#play-" + i} key={label}>
              <span className="nav-number">0{i + 1}</span>
              {label}
            </a>
          ))}
        </nav>
        <div className="recent-label nav-label">
          THIS SESSION <span>{results.length} versions</span>
        </div>
        <div className="recent">
          <p>
            Models stay on your device. Refreshing clears this tab’s session.
            Download a result to keep it.
          </p>
        </div>
        <div className="sidebar-bottom">
          <span className="online-dot" /> OpenCascade WebAssembly
          <div>
            <ShieldCheck size={14} /> Your files never leave this browser
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumbs">
            FORM <span>/</span> Public playground <span>/</span>
            <strong>{current?.version.name || "New model"}</strong>
          </div>
          <button className="button secondary" onClick={share}>
            <Share2 size={14} /> Share website
          </button>
        </header>
        <div className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> REAL CAD. RIGHT IN YOUR BROWSER.
              </div>
              <h1>Drop a part. Discover the details.</h1>
              <p>
                Upload a STEP model, explore its geometry, and try a precision
                edit.
              </p>
            </div>
            <span className="section-tag">FREE TO EXPLORE · NO SIGN-IN</span>
          </div>
          <section
            className="upload-card"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              choose(e.dataTransfer.files[0]);
            }}
          >
            <div className="upload-symbol">
              <Upload size={24} />
            </div>
            <div className="upload-copy">
              <h3>Upload your 3D model</h3>
              <p>Choose a file. Real geometry analysis starts automatically.</p>
              <div className="file-tags">
                <span>STEP / STP</span>
                <span>Up to 20 MB</span>
                <span>Processed on your device</span>
              </div>
            </div>
            <button
              className="button secondary"
              disabled={!!busy}
              onClick={() => {
                original.current = null;
                process({ operation: "sample" });
              }}
            >
              Try sample part
            </button>
            <label className="button primary">
              Upload model <ArrowUpRight size={16} />
              <input
                aria-label="Upload STEP model"
                type="file"
                accept=".step,.stp"
                disabled={!!busy}
                onChange={(e) => {
                  choose(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </section>
          <div className="support-note">
            <ShieldCheck size={13} /> Real OpenCascade measurements{" "}
            <span>·</span> Browser WebGL previews <span>·</span> No server
            connection required
          </div>
          <div className="play-limits">
            This public playground uses WebGL, not Blender. Native CATIA import,
            AI chat and assembly BOM extraction are available only with the full
            app’s integrations.
          </div>
          {error && (
            <div className="alert" role="alert">
              <strong>Could not complete this action</strong>
              {error}
            </div>
          )}
          {notice && (
            <p className="share-notice" role="status">
              {notice}
            </p>
          )}
          {busy && (
            <div className="processing" role="status">
              <LoaderCircle className="spin" size={20} />
              <div>
                <strong>PROCESSING ON YOUR DEVICE</strong>
                <p>{busy}</p>
              </div>
              <small>The first run downloads the CAD engine.</small>
            </div>
          )}
          <div className="model-bar">
            <div>
              <span className="model-dot" />
              <strong>
                {current?.version.name || "Ready for your first model"}
              </strong>
              <span className="muted">
                {a
                  ? `${a.solid_count} solid(s) · millimeters`
                  : "Try the sample, or upload your own STEP file"}
              </span>
            </div>
            {current && (
              <div>
                <select
                  aria-label="Version history"
                  value={active}
                  onChange={(e) => {
                    setActive(Number(e.target.value));
                    setSelected(null);
                  }}
                >
                  {results.map((r, i) => (
                    <option key={r.version.id} value={i}>
                      {r.version.name} · v{i + 1}
                    </option>
                  ))}
                </select>
                <button
                  className="download"
                  onClick={() =>
                    save(current.step, current.version.name + ".step")
                  }
                >
                  <Download size={14} /> STEP
                </button>
              </div>
            )}
          </div>
          <Section
            index={0}
            title="Engineering views"
            subtitle="Four browser-generated previews of your actual geometry."
            tag="WEBGL · NOT BLENDER"
          >
            <div className="gallery">
              {["isometric", "front", "top", "side"].map((view, i) => (
                <a
                  key={view}
                  className={"photo " + (i === 0 ? "hero-photo" : "")}
                  href={current?.views[view]}
                  download={
                    current ? `${current.version.name}-${view}.png` : undefined
                  }
                  onClick={(e) => {
                    if (!current) e.preventDefault();
                  }}
                >
                  {current ? (
                    <img
                      src={current.views[view]}
                      alt={view + " WebGL preview"}
                    />
                  ) : (
                    <div className="photo-empty">
                      <Box size={i === 0 ? 65 : 38} />
                      <span>
                        {i === 0
                          ? "Your next part, in focus"
                          : "Awaiting model"}
                      </span>
                    </div>
                  )}
                  <span className="photo-label">
                    {view}
                    <Download size={13} />
                  </span>
                  {i === 0 && (
                    <span className="studio-tag">BROWSER PREVIEW</span>
                  )}
                </a>
              ))}
            </div>
          </Section>
          <Section
            index={1}
            title="Part description"
            subtitle="Facts from geometry. No visual guesses or invented material."
            tag="GEOMETRY ONLY"
          >
            <div className="description-grid">
              <div className="description-main">
                <h3>{current?.version.name || "Your model, explained"}</h3>
                <p>
                  {current?.version.description.description ||
                    "Upload a model to see its solid count, surfaces and geometric characteristics."}
                </p>
                <p>{current?.version.description.geometric_characteristics}</p>
                <small className="muted">
                  Material and likely function are not inferred in this
                  playground.
                </small>
              </div>
              <div className="description-details">
                <h4>CYLINDRICAL HOLE SURFACES</h4>
                <div className="chips">
                  {a?.holes.length ? (
                    a.holes.map((hole, i) => (
                      <button
                        key={hole.id}
                        onClick={() => {
                          setSelected(hole.id);
                          document
                            .getElementById("play-4")
                            ?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        H{i + 1} · Ø{fmt(hole.diameter!)} mm
                      </button>
                    ))
                  ) : (
                    <span>{a ? "None identified" : "Awaiting model"}</span>
                  )}
                </div>
                <p>
                  Holes are identified from inward-facing cylindrical surfaces.
                </p>
              </div>
            </div>
          </Section>
          <Section
            index={2}
            title="Exact dimensions"
            subtitle="OpenCascade B-rep measurements in millimeters, not mesh or image estimates."
            tag="NATIVE GEOMETRY IN WASM"
          >
            <div className="metrics">
              {[
                ["Length", a?.length, "mm"],
                ["Width", a?.width, "mm"],
                ["Height", a?.height, "mm"],
                ["Volume", a?.volume, "mm³"],
                ["Surface area", a?.surface_area, "mm²"],
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
          </Section>
          <Section
            index={3}
            title="Part record"
            subtitle="Browser mode preserves a geometry record; assembly hierarchy and material metadata are not extracted."
            tag={
              a && a.solid_count > 1 ? "SOLID INVENTORY" : "SINGLE-PART RECORD"
            }
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>MODEL</th>
                    <th>SOLIDS</th>
                    <th>MATERIAL</th>
                    <th>RECORD</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{current?.version.name || "Awaiting model"}</td>
                    <td>{a?.solid_count ?? "—"}</td>
                    <td>Not extracted</td>
                    <td>
                      {a
                        ? a.solid_count === 1
                          ? "Single solid part"
                          : "Solid inventory; not an assembly BOM"
                        : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>
          <Section
            index={4}
            title="Interactive workspace"
            subtitle="Select a face to change its appearance, or an edge for a kernel-validated edit."
            tag="LOCAL COMMANDS"
          >
            <div className="workspace-grid">
              <div className="viewer-column">
                {current ? (
                  <Viewer
                    key={current.version.id}
                    mesh={current.mesh}
                    version={current.version}
                    selected={selected}
                    onSelect={setSelected}
                  />
                ) : (
                  <div className="viewer-empty">
                    <Box size={55} />
                    <h3>Your next idea starts here</h3>
                    <p>Try a sample or upload a STEP model.</p>
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
                        : "Click on the model"}
                  </span>
                  {a && (
                    <select
                      aria-label="Select measured edge"
                      value={edge?.id || ""}
                      onChange={(event) => setSelected(event.target.value)}
                    >
                      <option value="">Select a measured edge…</option>
                      {a.edges.map((e, i) => (
                        <option key={e.id} value={e.id}>
                          E{i + 1} · {e.type} · {fmt(e.length)} mm
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <div className="chat">
                <div className="chat-heading">
                  <Component size={18} />
                  <div>
                    <strong>Precision edit playground</strong>
                    <small>Local command parser · no AI service</small>
                  </div>
                </div>
                <div className="chat-body">
                  <div className="assistant-message">
                    Select a face or edge, then try a command. Supported changes
                    create a new version; the original geometry stays intact.
                    STEP files can be downloaded from any version.
                  </div>
                  <div className="suggestions">
                    {[
                      "highlight",
                      "machined",
                      "fillet 1 mm",
                      "chamfer 1 mm",
                    ].map((c) => (
                      <button
                        key={c}
                        disabled={!current || !!busy}
                        onClick={() => setCommand(c)}
                      >
                        {c}
                        <ArrowUpRight size={12} />
                      </button>
                    ))}
                  </div>
                  <p className="muted">
                    Fillet and chamfer use the same OpenCascade kernel as the
                    measurements. Complex edits can be rejected. No operation is
                    claimed successful until a valid revised solid exists.
                  </p>
                  {current && (
                    <p className="muted">
                      Version action: {current.version.change}
                    </p>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (current && command.trim())
                      process({
                        operation: "edit",
                        version: current.version.id,
                        selected,
                        command,
                      });
                  }}
                >
                  <textarea
                    aria-label="Modification instruction"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="For example: fillet 1 mm"
                    disabled={!current || !!busy}
                  />
                  <div>
                    <span>
                      {selected
                        ? "Selection attached"
                        : "Select a face or edge"}
                    </span>
                    <button
                      title="Apply modification"
                      disabled={
                        !current || !command.trim() || !selected || !!busy
                      }
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </form>
                <p className="chat-footnote">
                  No API key. No model upload to a server.
                  <br />
                  Session history stays in this tab until refresh.
                </p>
              </div>
            </div>
          </Section>
          {current && (
            <div className="originals">
              <strong>Keep your work</strong>
              <button
                onClick={() =>
                  save(current.step, current.version.name + ".step")
                }
              >
                <Download size={13} /> Download selected STEP version
              </button>
              {original.current && (
                <button
                  onClick={() =>
                    save(original.current!, original.current!.name)
                  }
                >
                  Download last selected original
                </button>
              )}
              <span>Each visitor has their own session.</span>
            </div>
          )}
          <footer>
            <Component size={16} /> FORM{" "}
            <span>Share the playground. Keep your geometry private.</span>
            <small>
              <a
                href="/third-party-notices.txt"
                target="_blank"
                rel="noreferrer"
              >
                Open-source notices
              </a>
            </small>
          </footer>
        </div>
      </main>
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
    <section className="analysis-section" id={"play-" + index}>
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
