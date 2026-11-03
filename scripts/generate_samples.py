"""Generate analytically testable STEP samples using the same OpenCascade kernel."""

from pathlib import Path
import cadquery as cq


def generate(folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    plate = (
        cq.Workplane("XY")
        .box(80, 50, 12)
        .faces(">Z")
        .workplane()
        .pushPoints([(-25, -12), (25, -12), (-25, 12), (25, 12)])
        .hole(8)
    )
    cq.exporters.export(plate, str(folder / "mounting_plate.step"))
    cq.exporters.export(
        cq.Workplane("XY").box(20, 30, 40), str(folder / "calibration_block.step")
    )
    assembly = cq.Assembly(name="Fixture")
    assembly.add(plate, name="Plate")
    pin = cq.Workplane("XY").circle(4).extrude(20)
    assembly.add(pin, name="Pin_A", loc=cq.Location(cq.Vector(-25, -12, 0)))
    assembly.add(pin, name="Pin_B", loc=cq.Location(cq.Vector(25, 12, 0)))
    assembly.save(str(folder / "fixture_assembly.step"))


if __name__ == "__main__":
    generate(Path(__file__).resolve().parents[1] / "samples")
