import * as THREE from "three";
import type { MeshData, Version } from "../types";
export function snapshots(mesh: MeshData, version: Version) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(800, 650);
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1c2733");
  scene.add(new THREE.AmbientLight(0xffffff, 2));
  const a = version.analysis,
    center = new THREE.Vector3(...a.bounding_box.min)
      .add(new THREE.Vector3(...a.bounding_box.max))
      .multiplyScalar(0.5),
    size = Math.max(a.length, a.width, a.height);
  const group = new THREE.Group();
  group.position.copy(center).multiplyScalar(-1);
  scene.add(group);
  for (const face of mesh.faces) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(face.positions.flat(), 3),
    );
    geometry.setIndex(face.triangles.flat());
    geometry.computeVertexNormals();
    const finish = version.appearance[face.id];
    const material = new THREE.MeshStandardMaterial({
      color:
        finish === "highlight"
          ? "#f4a348"
          : finish === "machined"
            ? "#d6e3eb"
            : "#92a7ba",
      roughness: finish === "machined" ? 0.15 : 0.38,
      metalness: 0.5,
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(geometry, material));
  }
  for (const [pos, power] of [
    [[1, -2, 3], 4],
    [[-2, 0, 1], 2],
    [[0, 2, 1], 3],
  ] as [[number, number, number], number][]) {
    const light = new THREE.DirectionalLight(0xffffff, power);
    light.position.set(...pos).multiplyScalar(size);
    scene.add(light);
  }
  const camera = new THREE.OrthographicCamera(
    -size * 0.95,
    size * 0.95,
    (size * 0.95 * 650) / 800,
    (-size * 0.95 * 650) / 800,
    size * 0.001,
    size * 10,
  );
  const views: Record<string, string> = {};
  try {
    for (const [name, direction] of [
      ["isometric", [1, -1, 0.85]],
      ["front", [0, -1, 0]],
      ["top", [0, 0, 1]],
      ["side", [1, 0, 0]],
    ] as [string, [number, number, number]][]) {
      camera.position
        .set(...direction)
        .normalize()
        .multiplyScalar(size * 4);
      camera.up.set(
        ...((name === "top" ? [0, 1, 0] : [0, 0, 1]) as [
          number,
          number,
          number,
        ]),
      );
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      views[name] = renderer.domElement.toDataURL("image/png");
    }
  } finally {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return views;
}
