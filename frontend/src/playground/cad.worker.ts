import init from "replicad-opencascadejs/src/replicad_with_exceptions.js";
import wasmURL from "replicad-opencascadejs/src/replicad_with_exceptions.wasm?url";
import {
  setOC,
  getOC,
  importSTEP,
  measureVolume,
  measureArea,
  makeBox,
  makeCylinder,
  type Shape3D,
} from "replicad";
import type { Analysis, MeshData, Version } from "../types";
let initialized: Promise<void> | undefined;
const versions = new Map<string, { shape: Shape3D; version: Version }>();
const triples = (values: number[]) =>
  Array.from({ length: values.length / 3 }, (_, i) =>
    values.slice(i * 3, i * 3 + 3),
  );
function countSolids(shape: Shape3D) {
  const oc = getOC();
  const exp = new oc.TopExp_Explorer_2(
    shape.wrapped,
    oc.TopAbs_ShapeEnum.TopAbs_SOLID as ConstructorParameters<
      typeof oc.TopExp_Explorer_2
    >[1],
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE as ConstructorParameters<
      typeof oc.TopExp_Explorer_2
    >[2],
  );
  let n = 0;
  while (exp.More()) {
    n++;
    exp.Next();
  }
  exp.delete();
  return n;
}
function validate(shape: Shape3D) {
  const check = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false);
  const valid = check.IsValid_2();
  check.delete();
  if (!valid || !countSolids(shape) || measureVolume(shape) <= 0)
    throw new Error("The STEP document must contain valid closed solids.");
}
function result(
  shape: Shape3D,
  name: string,
  parent: Version | null,
  change: string,
  appearance: Record<string, string> = {},
) {
  validate(shape);
  const id = crypto.randomUUID();
  const bbox = shape.boundingBox;
  const [min, max] = bbox.bounds;
  bbox.delete();
  if (shape.faces.length > 1500)
    throw new Error(
      "This browser playground supports up to 1,500 faces. Use a smaller model.",
    );
  const tessellation = shape.mesh({ tolerance: 0.15, angularTolerance: 0.15 });
  const positions = triples(tessellation.vertices);
  const mesh: MeshData = {
    faces: tessellation.faceGroups.map((group) => {
      const indices = tessellation.triangles.slice(
        group.start,
        group.start + group.count,
      );
      const unique = [...new Set(indices)],
        remap = new Map(unique.map((n, i) => [n, i]));
      return {
        id: "face-" + group.faceId,
        positions: unique.map((n) => positions[n]),
        triangles: triples(indices.map((n) => remap.get(n)!)),
      };
    }),
    edges: [],
  };
  const edgeMesh = shape.meshEdges({ tolerance: 0.15, angularTolerance: 0.15 });
  mesh.edges = edgeMesh.edgeGroups.map((g) => ({
    id: "edge-" + g.edgeId,
    points: triples(edgeMesh.lines.slice(g.start * 3, (g.start + g.count) * 3)),
  }));
  const faces = shape.faces.map((face) => {
    const info: Analysis["faces"][number] = {
      id: "face-" + face.hashCode,
      type: face.geomType,
      area: measureArea(face),
      center: face.center.toTuple(),
    };
    if (info.type === "CYLINDRE") {
      const surface = new (getOC().BRepAdaptor_Surface_2)(face.wrapped, true);
      const cylinder = surface.Cylinder(),
        location = cylinder.Location(),
        axis = cylinder.Axis(),
        dir = axis.Direction();
      const point = face.pointOnSurface(0.5, 0.5),
        normal = face.normalAt(point),
        delta = [
          point.x - location.X(),
          point.y - location.Y(),
          point.z - location.Z(),
        ];
      const d = [dir.X(), dir.Y(), dir.Z()],
        projection = delta.reduce((sum, v, i) => sum + v * d[i], 0);
      const radial = delta.map((v, i) => v - projection * d[i]);
      info.radius = cylinder.Radius();
      info.diameter = info.radius * 2;
      info.feature =
        normal.toTuple().reduce((sum, v, i) => sum + v * radial[i], 0) < 0
          ? "hole"
          : "cylindrical surface";
      normal.delete();
      point.delete();
      dir.delete();
      axis.delete();
      location.delete();
      cylinder.delete();
      surface.delete();
    }
    face.delete();
    return info;
  });
  const edges = shape.edges.map((edge) => {
    const info: Analysis["edges"][number] = {
      id: "edge-" + edge.hashCode,
      type: edge.geomType,
      length: edge.length,
      points:
        mesh.edges.find((e) => e.id === "edge-" + edge.hashCode)?.points || [],
    };
    if (info.type === "CIRCLE") {
      const curve = new (getOC().BRepAdaptor_Curve_2)(edge.wrapped);
      const circle = curve.Circle();
      info.radius = circle.Radius();
      circle.delete();
      curve.delete();
    }
    edge.delete();
    return info;
  });
  const analysis: Analysis = {
    length: max[0] - min[0],
    width: max[1] - min[1],
    height: max[2] - min[2],
    bounding_box: { min, max },
    volume: measureVolume(shape),
    surface_area: measureArea(shape),
    solid_count: countSolids(shape),
    faces,
    edges,
    holes: faces.filter((f) => f.feature === "hole"),
  };
  const ids = new Set(faces.map((f) => f.id));
  appearance = Object.fromEntries(
    Object.entries(appearance).filter(([key]) => ids.has(key)),
  );
  const version: Version = {
    id,
    parent: parent?.id || null,
    created_at: new Date().toISOString(),
    change,
    name,
    analysis,
    appearance,
    description: {
      name,
      description: `A solid CAD model with ${analysis.solid_count} solid(s) and ${faces.length} surfaces.`,
      geometric_characteristics: `${analysis.length.toFixed(2)} × ${analysis.width.toFixed(2)} × ${analysis.height.toFixed(2)} mm`,
      likely_function: "Not inferred in browser mode",
      features: analysis.holes.map(
        (h) => `Cylindrical hole surface Ø${h.diameter!.toFixed(3)} mm`,
      ),
      material: null,
      manufacturing_candidates: [],
      source: "OpenCascade WebAssembly geometry; no AI inference",
    },
    bom: {
      kind: analysis.solid_count === 1 ? "single-part" : "solid-inventory",
      items: [
        {
          part_number: null,
          name,
          quantity: 1,
          material: null,
          description:
            analysis.solid_count === 1
              ? "Single-part geometry record"
              : `${analysis.solid_count} solids; assembly names and component quantities are not available in this browser importer.`,
        },
      ],
    },
  };
  const step = shape.blobSTEP();
  versions.set(id, { shape, version });
  return { version, mesh, step };
}
// Serial promise chain prevents concurrent access to one OpenCascade instance.
let queue = Promise.resolve();
self.onmessage = (event) => {
  queue = queue.then(async () => {
    const { requestId, operation } = event.data;
    try {
      initialized ??= (async () => {
        const oc = await init({ locateFile: () => wasmURL });
        setOC(oc as Parameters<typeof setOC>[0]);
      })();
      await initialized;
      if (versions.size >= 20)
        throw new Error(
          "This tab has reached 20 versions. Download your result and refresh to start a new session.",
        );
      let output;
      if (operation === "sample") {
        let shape: Shape3D = makeBox([-40, -25, -6], [40, 25, 6]);
        for (const [x, y] of [
          [-25, -12],
          [25, -12],
          [-25, 12],
          [25, 12],
        ]) {
          const tool = makeCylinder(4, 12, [x, y, -6], [0, 0, 1]);
          const next = shape.cut(tool);
          shape.delete();
          tool.delete();
          shape = next;
        }
        output = result(shape, "Mounting plate", null, "Generated sample");
      } else if (operation === "import") {
        const file: File = event.data.file;
        if (!/\.(step|stp)$/i.test(file.name))
          throw new Error(
            "The browser playground accepts STEP/STP. Native CATIA needs the licensed full application.",
          );
        if (file.size > 20 * 1024 * 1024 || !file.size)
          throw new Error("Choose a nonempty STEP file up to 20 MB.");
        if (!(await file.slice(0, 4096).text()).includes("ISO-10303-21;"))
          throw new Error("File content is not a STEP document.");
        const shape = await importSTEP(file);
        if (!("cut" in shape)) throw new Error("No closed solid found.");
        output = result(
          shape as Shape3D,
          file.name.replace(/\.(step|stp)$/i, ""),
          null,
          "Original import",
        );
      } else {
        const record = versions.get(event.data.version);
        if (!record) throw new Error("Model version is no longer available.");
        const { shape, version } = record,
          selected = event.data.selected as string;
        const command = (event.data.command as string).trim().toLowerCase();
        const appearance = { ...version.appearance };
        let next: Shape3D;
        if (
          ["highlight", "machined", "apply a machined surface finish"].includes(
            command,
          )
        ) {
          if (!version.analysis.faces.some((f) => f.id === selected))
            throw new Error("Select a face in the viewer first.");
          appearance[selected] =
            command === "highlight" ? "highlight" : "machined";
          next = shape.clone();
        } else {
          const match = /^(fillet|chamfer)\s+(\d+(?:\.\d+)?)\s*mm$/.exec(
            command,
          );
          if (!match)
            throw new Error(
              "Browser commands: highlight; machined; fillet 1 mm; chamfer 1 mm. Hole resizing and boss removal are available only where explicitly supported by the full application. No edit was made.",
            );
          if (version.analysis.solid_count !== 1)
            throw new Error(
              "Browser precision edits are limited to single-solid parts.",
            );
          if (!version.analysis.edges.some((e) => e.id === selected))
            throw new Error("Switch to Edges and select an edge first.");
          const value = Number(match[2]);
          if (value <= 0 || value > 1000)
            throw new Error("Use a dimension between 0 and 1,000 mm.");
          next =
            match[1] === "fillet"
              ? shape.fillet((e) =>
                  "edge-" + e.hashCode === selected ? value : null,
                )
              : shape.chamfer((e) =>
                  "edge-" + e.hashCode === selected ? value : null,
                );
          validate(next);
          if (
            countSolids(next) !== version.analysis.solid_count ||
            Math.abs(measureVolume(next) - version.analysis.volume) < 1e-6
          )
            throw new Error(
              "Kernel rejected the edit or it produced no geometric change.",
            );
        }
        output = result(next, version.name, version, command, appearance);
      }
      self.postMessage({ requestId, output });
    } catch (error) {
      self.postMessage({
        requestId,
        error:
          error instanceof Error
            ? error.message
            : "OpenCascade could not process this model or operation. The previous version is preserved.",
      });
    }
  });
};
