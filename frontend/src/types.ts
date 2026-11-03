export type Face = {
  id: string;
  type: string;
  area: number;
  center: number[];
  radius?: number;
  diameter?: number;
  feature?: string;
};
export type Edge = {
  id: string;
  type: string;
  length: number;
  radius?: number;
  points: number[][];
};
export type Analysis = {
  length: number;
  width: number;
  height: number;
  volume: number;
  surface_area: number;
  solid_count: number;
  faces: Face[];
  edges: Edge[];
  holes: Face[];
  bounding_box: { min: number[]; max: number[] };
};
export type Project = {
  id: string;
  name: string;
  status: string;
  message: string;
  versions: string[];
  current_version: string | null;
  original_files: string[];
  error: string | null;
};
export type Version = {
  id: string;
  parent: string | null;
  created_at: string;
  change: string;
  name: string;
  analysis: Analysis;
  appearance: Record<string, string>;
  description: {
    name: string;
    description: string;
    geometric_characteristics?: string;
    likely_function?: string;
    features: string[];
    material: string | null;
    manufacturing_candidates: string[];
    source: string;
  };
  ai_warning?: string;
  bom: {
    kind: string;
    items: {
      part_number: string | null;
      name: string;
      quantity: number;
      material: string | null;
      description: string;
    }[];
  };
};
export type MeshData = {
  faces: { id: string; positions: number[][]; triangles: number[][] }[];
  edges: { id: string; points: number[][] }[];
};
