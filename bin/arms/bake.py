"""Bake a MuJoCo Menagerie arm into a small web asset: a JSON kinematic tree plus one binary of decimated meshes.

    python bake.py MODEL_XML OUT_STEM ROBOT

Writes OUT_STEM.json and OUT_STEM.bin. Meshes are in their geom frames, positions quantised to int16 over each
mesh's bounding box, indices uint16.
"""

import json
import pathlib
import sys

import fast_simplification
import mujoco
import numpy as np

xml, out_stem, robot = sys.argv[1], pathlib.Path(sys.argv[2]), sys.argv[3]
model = mujoco.MjModel.from_xml_path(xml)
data = mujoco.MjData(model)

# How many triangles a mesh may keep, by how much of the picture it is.
BUDGET = {"xarm7": lambda n, name: 2200 if "knuckle" in name else 2600 if "finger" in name else 5200, "yam": lambda n, name: 3200}[robot]
ARM_JOINTS = {"xarm7": [f"joint{i}" for i in range(1, 8)], "yam": [f"joint{i}" for i in range(1, 7)]}[robot]


def name(kind, i):
    return mujoco.mj_id2name(model, kind, i) or ""


def r5(a):
    return [round(float(x), 6) for x in a]


bodies = []
for b in range(1, model.nbody):
    bodies.append({"name": name(mujoco.mjtObj.mjOBJ_BODY, b), "parent": int(model.body_parentid[b]) - 1, "pos": r5(model.body_pos[b]), "quat": r5(model.body_quat[b])})

joints = []
for j in range(model.njnt):
    kind = {int(mujoco.mjtJoint.mjJNT_HINGE): "hinge", int(mujoco.mjtJoint.mjJNT_SLIDE): "slide"}[int(model.jnt_type[j])]
    joints.append(
        {
            "name": name(mujoco.mjtObj.mjOBJ_JOINT, j),
            "body": int(model.jnt_bodyid[j]) - 1,
            "type": kind,
            "axis": r5(model.jnt_axis[j]),
            "pos": r5(model.jnt_pos[j]),
            "range": r5(model.jnt_range[j]),
        }
    )

blob = bytearray()
meshes, mesh_of, geoms = [], {}, []
total_in = total_out = 0
for g in range(model.ngeom):
    if int(model.geom_type[g]) != int(mujoco.mjtGeom.mjGEOM_MESH) or model.geom_group[g] == 3:
        continue
    m = int(model.geom_dataid[g])
    if m not in mesh_of:
        v0, nv = model.mesh_vertadr[m], model.mesh_vertnum[m]
        f0, nf = model.mesh_faceadr[m], model.mesh_facenum[m]
        verts = np.array(model.mesh_vert[v0 : v0 + nv], dtype=np.float32)
        faces = np.array(model.mesh_face[f0 : f0 + nf], dtype=np.int32)
        mesh_name = name(mujoco.mjtObj.mjOBJ_MESH, m)
        budget = BUDGET(nf, mesh_name)
        total_in += nf
        if nf > budget:
            verts, faces = fast_simplification.simplify(verts, faces, target_count=budget, agg=5)
            verts, faces = np.asarray(verts, dtype=np.float32), np.asarray(faces, dtype=np.int32)
        total_out += len(faces)
        assert len(verts) < 65536, mesh_name
        lo, hi = verts.min(0), verts.max(0)
        span = np.maximum(hi - lo, 1e-9)
        q = np.round((verts - lo) / span * 65535 - 32768).astype("<i2")
        entry = {"name": mesh_name, "lo": r5(lo), "hi": r5(hi), "vOff": len(blob), "vCount": int(len(verts))}
        blob += q.tobytes()
        entry["iOff"] = len(blob)
        entry["iCount"] = int(faces.size)
        blob += faces.astype("<u2").tobytes()
        mesh_of[m] = len(meshes)
        meshes.append(entry)
    rgba = model.geom_rgba[g] if model.geom_matid[g] < 0 else model.mat_rgba[model.geom_matid[g]]
    geoms.append({"body": int(model.geom_bodyid[g]) - 1, "pos": r5(model.geom_pos[g]), "quat": r5(model.geom_quat[g]), "color": r5(rgba[:3]), "mesh": mesh_of[m]})


def jid(n):
    return mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, n)


def bid(n):
    return mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, n)


def pose(q_by_joint):
    data.qpos[:] = 0
    for n, value in q_by_joint.items():
        data.qpos[model.jnt_qposadr[jid(n)]] = value
    mujoco.mj_kinematics(model, data)


# The gripper: one number drives it. For each value, the clear gap between the pads.
if robot == "xarm7":
    drive = {n: 1.0 for n in ("left_driver_joint", "left_finger_joint", "left_inner_knuckle_joint", "right_driver_joint", "right_finger_joint", "right_inner_knuckle_joint")}
    hand = bid("xarm_gripper_base_link")
    tcp = {"body": hand - 1, "pos": [0, 0, 0.172]}
    samples = np.linspace(0, 0.85, 18)
    pad_l = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, "left_finger_pad_2")
    pad_r = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, "right_finger_pad_2")
    table = []
    for s in samples:
        pose({n: c * s for n, c in drive.items()})
        gap = np.linalg.norm(data.geom_xpos[pad_l] - data.geom_xpos[pad_r]) - 2 * model.geom_size[pad_l][1]
        # The linkage is a parallelogram: check the finger has not turned.
        turn = np.degrees(np.arccos(np.clip((np.trace(data.xmat[bid("left_finger")].reshape(3, 3).T @ data.xmat[hand].reshape(3, 3)) - 1) / 2, -1, 1)))
        table.append([round(float(s), 4), round(float(gap), 5)])
        assert turn < 0.01, turn
    pose({})
    R = data.xmat[hand].reshape(3, 3)
    approach, jaw = R[:, 2], R[:, 1]
    pads_z = float((R.T @ (data.geom_xpos[pad_l] - data.xpos[hand]))[2])
    tcp["pos"] = [0, 0, round(pads_z, 5)]
    tcp["approach"], tcp["jaw"] = [0, 0, 1], [0, 1, 0]
else:
    drive = {"left_finger": 1.0, "right_finger": -1.0}
    hand = bid("link_6")
    tcp = {"body": hand - 1, "pos": [0, 0, 0.1347], "approach": [0, 0, 1]}
    pose({})
    R = data.xmat[hand].reshape(3, 3)
    # The fingers slide along their own z axis.
    jaw = R.T @ data.xmat[bid("link_left_finger")].reshape(3, 3)[:, 2]
    tcp["jaw"] = r5(np.round(jaw, 6))
    table = [[round(float(s), 4), round(float(2 * s), 5)] for s in np.linspace(0, 0.0375, 6)]

out = {
    "robot": robot,
    "source": "MuJoCo Menagerie, " + pathlib.Path(xml).parent.name,
    "bodies": bodies,
    "joints": joints,
    "armJoints": ARM_JOINTS,
    "geoms": geoms,
    "meshes": meshes,
    "gripper": {"joints": drive, "table": table},
    "tcp": tcp,
}
key = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_KEY, "home")
if key >= 0:
    out["home"] = r5(model.key_qpos[key][: len(ARM_JOINTS)])

out_stem.with_suffix(".json").write_text(json.dumps(out, separators=(",", ":")))
out_stem.with_suffix(".bin").write_bytes(bytes(blob))
print(robot, "bodies", len(bodies), "joints", len(joints), "geoms", len(geoms), "meshes", len(meshes), "tris", total_in, "->", total_out, "bin", len(blob), "json", out_stem.with_suffix(".json").stat().st_size)
print("gripper table", table[0], table[-1], "tcp", tcp)

# A reference pose for checking the browser's forward kinematics against MuJoCo's.
rng = np.random.default_rng(0)
q = {n: float(rng.uniform(-1, 1)) for n in ARM_JOINTS}
pose(q)
R = data.xmat[hand].reshape(3, 3)
print("check", json.dumps({"q": [round(v, 5) for v in q.values()], "tcp": r5(data.xpos[hand] + R @ np.array(tcp["pos"])), "approach": r5(R @ np.array(tcp["approach"]))}))
