import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Bounds,
  OrbitControls,
  Grid,
  Line,
  GizmoHelper,
  GizmoViewport,
} from "@react-three/drei";
import * as THREE from "three";
import type { MeshData, Version } from "./types";
function FaceMesh({
  face,
  selected,
  finish,
  onSelect,
}: {
  face: MeshData["faces"][number];
  selected: boolean;
  finish?: string;
  onSelect: () => void;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(face.positions.flat(), 3),
    );
    g.setIndex(face.triangles.flat());
    g.computeVertexNormals();
    return g;
  }, [face]);
  return (
    <mesh
      geometry={geometry}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <meshStandardMaterial
        color={
          selected
            ? "#ffb55b"
            : finish === "highlight"
              ? "#f28d35"
              : finish === "machined"
                ? "#ced9e0"
                : "#8298ad"
        }
        roughness={finish === "machined" ? 0.18 : 0.38}
        metalness={0.65}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
export default function Viewer({
  mesh,
  version,
  selected,
  onSelect,
}: {
  mesh: MeshData;
  version: Version;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [mode, setMode] = useState<"face" | "edge">("face");
  const [wire, setWire] = useState(false);
  const a = version.analysis;
  const center = a.bounding_box.min.map(
    (n, i) => (n + a.bounding_box.max[i]) / 2,
  );
  const size = Math.max(a.length, a.width, a.height);
  return (
    <div className="viewport">
      <div className="viewer-tools">
        <button
          className={mode === "face" ? "active" : ""}
          onClick={() => setMode("face")}
        >
          Faces
        </button>
        <button
          className={mode === "edge" ? "active" : ""}
          onClick={() => setMode("edge")}
        >
          Edges
        </button>
        <button className={wire ? "active" : ""} onClick={() => setWire(!wire)}>
          Wireframe
        </button>
      </div>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{
          position: [size * 1.5, -size * 1.5, size * 1.2],
          up: [0, 0, 1],
          near: 0.01,
          far: 100000,
        }}
        onPointerMissed={() => onSelect("")}
      >
        <color attach="background" args={["#131c26"]} />
        <ambientLight intensity={1.4} />
        <directionalLight position={[size, -size, size * 2]} intensity={3} />
        <directionalLight position={[-size, size, size]} intensity={2} />
        <Bounds fit clip observe margin={1.45}>
          <group position={[-center[0], -center[1], -center[2]]}>
            {mesh.faces.map((f) => (
              <FaceMesh
                key={f.id}
                face={f}
                selected={f.id === selected}
                finish={version.appearance[f.id]}
                onSelect={() => {
                  if (mode === "face") onSelect(f.id);
                }}
              />
            ))}
            {(wire || mode === "edge") &&
              mesh.edges.map((e) => (
                <Line
                  key={e.id}
                  points={e.points as [number, number, number][]}
                  color={e.id === selected ? "#ffb55b" : "#354758"}
                  lineWidth={e.id === selected ? 4 : mode === "edge" ? 2 : 1}
                  onClick={(event) => {
                    if (mode === "edge") {
                      event.stopPropagation();
                      onSelect(e.id);
                    }
                  }}
                />
              ))}
          </group>
        </Bounds>
        <Grid
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, -a.height / 2 - 0.05]}
          args={[size * 4, size * 4]}
          cellSize={size / 10}
          sectionSize={size / 2}
          fadeDistance={size * 5}
          cellColor="#253440"
          sectionColor="#354757"
        />
        <OrbitControls makeDefault />
        <GizmoHelper alignment="bottom-right" margin={[65, 65]}>
          <GizmoViewport
            axisColors={["#df866e", "#9da96b", "#74a3d5"]}
            labelColor="white"
          />
        </GizmoHelper>
      </Canvas>
      <div className="viewer-caption">
        Click a {mode} to inspect · Drag to orbit · Scroll to zoom
      </div>
    </div>
  );
}
