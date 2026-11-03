"""OpenCascade B-rep analysis. All lengths are normalized by STEP reader to mm."""

from collections import Counter
import math
import uuid
import cadquery as cq
from OCP.BRepAdaptor import BRepAdaptor_Surface, BRepAdaptor_Curve
from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Circle
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TDocStd import TDocStd_Document
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDF import TDF_LabelSequence
from OCP.XCAFDoc import XCAFDoc_DocumentTool
from OCP.TDataStd import TDataStd_Name


def load(path):
    obj = cq.importers.importStep(str(path)).val()
    if not obj.Solids() or not obj.isValid():
        raise ValueError("STEP must contain valid closed solid geometry.")
    return obj


def material_for_label(label):
    """Read the actual typed XCAF relationship, avoiding nullable output handles."""
    from OCP.TDF import TDF_AttributeIterator
    from OCP.XCAFDoc import XCAFDoc, XCAFDoc_Material

    attributes = TDF_AttributeIterator(label)
    while attributes.More():
        attribute = attributes.Value()
        if attribute.ID().IsSame(XCAFDoc.MaterialRefGUID_s()) and attribute.HasFather():
            material_attributes = TDF_AttributeIterator(attribute.Father().Label())
            while material_attributes.More():
                material = material_attributes.Value()
                if isinstance(material, XCAFDoc_Material):
                    return material.GetName().ToCString() or None
                material_attributes.Next()
        attributes.Next()
    return None


def assembly_bom(path):
    """Read XCAF product hierarchy, including repeated occurrences; do not guess material."""
    doc = TDocStd_Document(TCollection_ExtendedString("cad"))
    reader = STEPCAFControl_Reader()
    reader.SetNameMode(True)
    reader.SetMatMode(True)
    if int(reader.ReadFile(str(path))) != 1 or not reader.Transfer(doc):
        raise ValueError("Unable to read STEP product structure")
    tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    roots = TDF_LabelSequence()
    tool.GetFreeShapes(roots)
    rows = {}
    is_assembly = False

    def walk(label):
        nonlocal is_assembly
        if tool.IsReference_s(label):
            from OCP.TDF import TDF_Label

            referred = TDF_Label()
            tool.GetReferredShape_s(label, referred)
            label = referred
        if tool.IsAssembly_s(label):
            is_assembly = True
            children = TDF_LabelSequence()
            tool.GetComponents_s(label, children, False)
            for i in range(1, children.Length() + 1):
                walk(children.Value(i))
            return
        name_attr = TDataStd_Name()
        name = (
            name_attr.Get().ToExtString()
            if label.FindAttribute(TDataStd_Name.GetID_s(), name_attr)
            else "Unnamed component"
        )
        # Label entry identifies a definition within this document, not just a display name.
        from OCP.TDF import TDF_Tool
        from OCP.TCollection import TCollection_AsciiString

        entry = TCollection_AsciiString()
        TDF_Tool.Entry_s(label, entry)
        key = entry.ToCString()
        material_name = material_for_label(label)
        if key not in rows:
            rows[key] = dict(
                part_number=None,
                name=name,
                quantity=0,
                material=material_name,
                description="STEP product definition",
                definition_id=key,
            )
        rows[key]["quantity"] += 1

    for i in range(1, roots.Length() + 1):
        walk(roots.Value(i))
    return {
        "kind": "assembly" if is_assembly else "single-part",
        "items": list(rows.values()),
    }


def signature(entity):
    c = entity.Center()
    bb = entity.BoundingBox()
    values = [
        c.x,
        c.y,
        c.z,
        bb.xlen,
        bb.ylen,
        bb.zlen,
        entity.Area() if isinstance(entity, cq.Face) else entity.Length(),
    ]
    return entity.geomType() + ":" + ",".join(f"{v:.5f}" for v in values)


def analyze(shape, previous=None):
    bb = shape.BoundingBox()
    previous = previous or {}
    result = dict(
        units="mm",
        length=bb.xlen,
        width=bb.ylen,
        height=bb.zlen,
        bounding_box={
            "min": [bb.xmin, bb.ymin, bb.zmin],
            "max": [bb.xmax, bb.ymax, bb.zmax],
        },
        volume=shape.Volume(),
        surface_area=shape.Area(),
        solid_count=len(shape.Solids()),
    )
    mesh, faces, edges = [], [], []
    current_counts = {
        kind: Counter(signature(e) for e in entities)
        for kind, entities in [("faces", shape.Faces()), ("edges", shape.Edges())]
    }

    # Retain IDs only for unique, exactly matching geometric signatures. Ambiguous faces get new IDs.
    def identity(kind, sig):
        matches = [x for x in previous.get(kind, []) if x["signature"] == sig]
        return (
            matches[0]["id"]
            if len(matches) == 1 and current_counts[kind][sig] == 1
            else str(uuid.uuid4())
        )

    for face in shape.Faces():
        sig = signature(face)
        info = dict(
            id=identity("faces", sig),
            signature=sig,
            type=face.geomType(),
            area=face.Area(),
            center=list(face.Center().toTuple()),
        )
        surface = BRepAdaptor_Surface(face.wrapped)
        if surface.GetType() == GeomAbs_Cylinder:
            cylinder = surface.Cylinder()
            u1, u2, v1, v2 = (
                surface.FirstUParameter(),
                surface.LastUParameter(),
                surface.FirstVParameter(),
                surface.LastVParameter(),
            )
            # Inner cylinder normals point toward their own axis.
            p = surface.Value((u1 + u2) / 2, (v1 + v2) / 2)
            normal = face.normalAt(cq.Vector(p.X(), p.Y(), p.Z()))
            axis = cylinder.Axis()
            origin = cq.Vector(
                cylinder.Location().X(),
                cylinder.Location().Y(),
                cylinder.Location().Z(),
            )
            direction = cq.Vector(
                axis.Direction().X(), axis.Direction().Y(), axis.Direction().Z()
            )
            radial = cq.Vector(p.X(), p.Y(), p.Z()) - origin
            radial = radial - direction * radial.dot(direction)
            info.update(
                radius=cylinder.Radius(),
                diameter=2 * cylinder.Radius(),
                feature="hole" if normal.dot(radial) < 0 else "cylindrical surface",
                axis=list(direction.toTuple()),
                axis_origin=list(origin.toTuple()),
                full_cylinder=abs((u2 - u1) - 2 * math.pi) < 1e-5,
            )
        vertices, triangles = face.tessellate(0.15, 0.15)
        mesh.append(
            dict(
                id=info["id"],
                positions=[list(v.toTuple()) for v in vertices],
                triangles=triangles,
            )
        )
        faces.append(info)
    for edge in shape.Edges():
        sig = signature(edge)
        info = dict(
            id=identity("edges", sig),
            signature=sig,
            type=edge.geomType(),
            length=edge.Length(),
        )
        curve = BRepAdaptor_Curve(edge.wrapped)
        if curve.GetType() == GeomAbs_Circle:
            info["radius"] = curve.Circle().Radius()
        points = edge.sample(32)[0]
        info["points"] = [list(p.toTuple()) for p in points]
        edges.append(info)
    result.update(
        faces=faces, edges=edges, holes=[f for f in faces if f.get("feature") == "hole"]
    )
    return result, {
        "faces": mesh,
        "edges": [{k: e[k] for k in ("id", "points")} for e in edges],
    }


def modify(shape, analysis, operation, selected, value):
    if operation in ("fillet", "chamfer"):
        index = next(
            (i for i, e in enumerate(analysis["edges"]) if e["id"] == selected), None
        )
        if index is None:
            raise ValueError("Select an edge from the current version.")
        edge = shape.Edges()[index]
        result = (
            shape.fillet(value, [edge])
            if operation == "fillet"
            else shape.chamfer(value, None, [edge])
        )
    elif operation == "increase_hole":
        index = next(
            (i for i, f in enumerate(analysis["faces"]) if f["id"] == selected), None
        )
        if index is None:
            raise ValueError("Select a cylindrical hole face.")
        face = analysis["faces"][index]
        if face.get("feature") != "hole" or not face.get("full_cylinder"):
            raise ValueError("Only complete cylindrical holes are supported.")
        if value <= face["diameter"]:
            raise ValueError("New diameter must exceed the measured diameter.")
        direction = cq.Vector(*face["axis"])
        origin = cq.Vector(*face["axis_origin"])
        # Only a simple through-hole with two circular boundary edges is reliable here.
        boundaries = shape.Faces()[index].Edges()
        circles = [e for e in boundaries if e.geomType() == "CIRCLE"]
        if len(circles) != 2:
            raise ValueError(
                "Only simple through-holes are supported; this face has complex boundaries."
            )
        ends = [cq.Vector(*e.Center().toTuple()) for e in circles]
        for point in ends:
            if shape.isInside(point, 1e-5):
                raise ValueError("Blind or intersecting holes are not supported.")
        lo = min((p - origin).dot(direction) for p in ends)
        hi = max((p - origin).dot(direction) for p in ends)
        # Require intact wall around the entire proposed bore at several depths.
        # Conservative sampling rejects nearby holes, thin walls and intersecting features.
        reference = cq.Vector(1, 0, 0) if abs(direction.x) < 0.8 else cq.Vector(0, 1, 0)
        radial = direction.cross(reference).normalized()
        tangent = direction.cross(radial).normalized()
        for depth in (lo + (hi - lo) * 0.02, (lo + hi) / 2, hi - (hi - lo) * 0.02):
            for i in range(64):
                angle = 2 * math.pi * i / 64
                point = (
                    origin
                    + direction * depth
                    + (radial * math.cos(angle) + tangent * math.sin(angle))
                    * (value / 2 + 0.001)
                )
                if not shape.isInside(point, 1e-6):
                    raise ValueError(
                        "Proposed bore intersects a boundary or another feature; reliable enlargement is unavailable."
                    )
        tool = cq.Solid.makeCylinder(
            value / 2, hi - lo + 0.02, origin + direction * (lo - 0.01), direction
        )
        result = shape.cut(tool)
    else:
        raise ValueError(
            "This geometric operation is not reliably supported. No model was changed."
        )
    if (
        not result.isValid()
        or not result.Solids()
        or len(result.Solids()) != len(shape.Solids())
    ):
        raise ValueError(
            "Kernel rejected the edit or it changed the solid count. No version was saved."
        )
    if abs(result.Volume() - shape.Volume()) < 1e-6:
        raise ValueError("Edit produced no measurable geometry change.")
    return result
