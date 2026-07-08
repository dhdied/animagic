"""
fish_mesh_builder.py
--------------------
Процедурный 3D-меш рыбки. Ориентация исправлена: строится вдоль X, 
инвертируется текстура, затем поворачивается для совместимости с клиентом.
"""

from __future__ import annotations
import math
from dataclasses import dataclass
from typing import List, Tuple
import cv2
import numpy as np

@dataclass
class FishMesh:
    vertices: np.ndarray       
    normals: np.ndarray        
    uvs: np.ndarray            
    triangles: np.ndarray      
    texture_png: bytes         


def _ellipsoid_grid(length: float, height: float, width: float,
                    seg_long: int = 32, seg_lat: int = 16) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    verts: List[List[float]] = []
    uvs: List[List[float]] = []
    lat_indices: List[Tuple[int, int]] = []

    hlx = length * 0.5
    hhy = height * 0.5
    hwz = width * 0.5

    for r in range(seg_lat + 1):
        phi = ((r / seg_lat) - 0.5) * math.pi  
        ring_start = len(verts)
        for s in range(seg_long + 1):
            theta = (s / seg_long) * 2 * math.pi

            # Снова строим вдоль оси X (параллельно экрану)
            x = math.cos(theta) * math.cos(phi) * hlx
            y = math.sin(phi) * hhy
            z = math.sin(theta) * math.cos(phi) * hwz
            verts.append([x, y, z])

            # Инвертируем U, чтобы нос (+X) получал U=0 (нос с рисунка)
            u = 0.5 - x / length  
            v = 0.5 + y / height  
            uvs.append([u, v])
        lat_indices.append((ring_start, len(verts)))

    return (np.asarray(verts, dtype=np.float32), np.asarray(uvs, dtype=np.float32), lat_indices)


def _ellipsoid_triangles(seg_long: int, seg_lat: int, lat_indices: List[Tuple[int, int]]) -> np.ndarray:
    tris: List[List[int]] = []
    for r in range(seg_lat):
        a0, b0 = lat_indices[r]
        a1, b1 = lat_indices[r + 1]
        for s in range(seg_long):
            i00 = a0 + s
            i01 = a0 + s + 1
            i10 = a1 + s
            i11 = a1 + s + 1
            tris.extend([[i00, i10, i11], [i00, i11, i01]])
    return np.asarray(tris, dtype=np.int32)


def _append_fin(vertices: List[List[float]], uvs: List[List[float]], tris: List[List[int]],
                root: Tuple[float, float, float], tip: Tuple[float, float, float],
                spread: float, spine: int, width: int, spec_len: float, spec_h: float) -> None:
    rx, ry, rz = root
    tx, ty, tz = tip
    dx, dy, dz = tx - rx, ty - ry, tz - rz
    length = (dx**2 + dy**2 + dz**2)**0.5 or 1.0
    
    nx, ny, nz = -dz / length, 0.0, dx / length  
    if abs(nx) < 0.001 and abs(nz) < 0.001:
        nx, ny, nz = 0.0, 0.0, 1.0
        
    base = len(vertices)
    for s in range(spine + 1):
        t = s / spine
        scale = 1.0 - 0.4 * t
        for w in range(width + 1):
            u = w / width - 0.5  
            ox = nx * u * spread * scale
            oy = ny * u * spread * scale
            oz = nz * u * spread * scale
            px = rx + dx * t + ox
            py = ry + dy * t + oy
            pz = rz + dz * t + oz
            vertices.append([px, py, pz])
            uvs.append([0.5 - px / spec_len, 0.5 + py / spec_h])
            
    for s in range(spine):
        for w in range(width):
            i00 = base + s * (width + 1) + w
            i01 = base + s * (width + 1) + w + 1
            i10 = base + (s + 1) * (width + 1) + w
            i11 = base + (s + 1) * (width + 1) + w + 1
            tris.extend([[i00, i10, i11], [i00, i11, i01]])


def _process_texture(png_bytes: bytes) -> bytes:
    arr = np.frombuffer(png_bytes, dtype=np.uint8)
    bgra = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
    if bgra is None: return _empty_png()

    if bgra.ndim == 2:
        bgra = np.dstack([bgra, bgra, bgra, np.full(bgra.shape, 255, dtype=np.uint8)])
    elif bgra.shape[2] == 3:
        alpha = np.full(bgra.shape[:2], 255, dtype=np.uint8)
        bgra = np.dstack([bgra, alpha])

    h, w = bgra.shape[:2]
    m = max(h, w)
    if m > 512:
        scale = 512 / m
        bgra = cv2.resize(bgra, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    ok, png = cv2.imencode(".png", bgra)
    return png.tobytes() if ok else _empty_png()


def _empty_png() -> bytes:
    import base64
    return base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=")


def build_fish_mesh(png_bytes: bytes, species: str = "shark") -> FishMesh:
    if species == "shark": length, height, width = 2.4, 0.9, 0.7
    elif species == "tropical": length, height, width = 1.7, 1.1, 0.5
    else: length, height, width = 1.8, 1.1, 0.6

    verts_arr, uvs_arr, lat_indices = _ellipsoid_grid(length, height, width)
    vertices = verts_arr.tolist()
    uvs = uvs_arr.tolist()
    triangles = _ellipsoid_triangles(32, 16, lat_indices).tolist()

    # Хвост (на -X)
    _append_fin(vertices, uvs, triangles, root=(-length * 0.45, 0.0, 0.0), tip=(-length * 0.55, 0.0, 0.0), spread=0.55, spine=8, width=2, spec_len=length, spec_h=height)
    _append_fin(vertices, uvs, triangles, root=(-length * 0.45, 0.0, 0.0), tip=(-length * 0.55, 0.4, 0.0), spread=0.2, spine=4, width=2, spec_len=length, spec_h=height)
    _append_fin(vertices, uvs, triangles, root=(-length * 0.45, 0.0, 0.0), tip=(-length * 0.55, -0.4, 0.0), spread=0.2, spine=4, width=2, spec_len=length, spec_h=height)

    # Спинной плавник (+Y)
    _append_fin(vertices, uvs, triangles, root=(-0.2, height * 0.5, 0.0), tip=(-0.5, height * 0.5 + 0.55, 0.0), spread=0.25, spine=8, width=2, spec_len=length, spec_h=height)

    # Брюшной плавник (-Y)
    _append_fin(vertices, uvs, triangles, root=(0.05, -height * 0.5, 0.0), tip=(-0.05, -height * 0.5 - 0.35, 0.0), spread=0.18, spine=6, width=2, spec_len=length, spec_h=height)

    # Грудные плавники (бока по оси Z)
    _append_fin(vertices, uvs, triangles, root=(length * 0.15, 0.0, width * 0.5), tip=(0.0, 0.0, width * 0.5 + 0.45), spread=0.15, spine=6, width=2, spec_len=length, spec_h=height)
    _append_fin(vertices, uvs, triangles, root=(length * 0.15, 0.0, -width * 0.5), tip=(0.0, 0.0, -width * 0.5 - 0.45), spread=0.15, spine=6, width=2, spec_len=length, spec_h=height)

    vertices_np = np.asarray(vertices, dtype=np.float32)
    uvs_np = np.asarray(uvs, dtype=np.float32)
    triangles_np = np.asarray(triangles, dtype=np.int32)

    normals = np.zeros_like(vertices_np)
    v0 = vertices_np[triangles_np[:, 0]]
    v1 = vertices_np[triangles_np[:, 1]]
    v2 = vertices_np[triangles_np[:, 2]]
    face_normals = np.cross(v1 - v0, v2 - v0)
    for i, fn in enumerate(face_normals):
        for idx in triangles_np[i]:
            normals[idx] += fn
            
    norm_len = np.linalg.norm(normals, axis=1, keepdims=True)
    norm_len[norm_len == 0] = 1.0
    normals = normals / norm_len

    # Поворот -90 градусов по оси Z (Новый X = Старый Y, Новый Y = -Старый X)
    rot_vertices = np.empty_like(vertices_np)
    rot_vertices[:, 0] = vertices_np[:, 1]
    rot_vertices[:, 1] = -vertices_np[:, 0]
    rot_vertices[:, 2] = vertices_np[:, 2]
    
    rot_normals = np.empty_like(normals)
    rot_normals[:, 0] = normals[:, 1]
    rot_normals[:, 1] = -normals[:, 0]
    rot_normals[:, 2] = normals[:, 2]

    return FishMesh(vertices=rot_vertices, normals=rot_normals, uvs=uvs_np, triangles=triangles_np, texture_png=_process_texture(png_bytes))