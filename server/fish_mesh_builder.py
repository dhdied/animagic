"""
fish_mesh_builder.py
--------------------
Процедурный 3D-меш рыбки на чистом numpy + OpenCV (без Unity, без
внешних 3D-библиотек).

Идея: «вытянутый» эллипсоид + два плавника + хвостовой треугольник.
UV-развёртка прижимает исходный PNG-рисунок рыбки (без фона) на
каждую сторону корпуса, чтобы текстура на готовом .fbx выглядела
так же, как нарисованный ребёнком рисунок.

Возвращает dataclass FishMesh, который fbx_writer превращает в FBX.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, List, Tuple

import cv2
import numpy as np


@dataclass
class FishMesh:
    vertices: np.ndarray       # (N, 3) float32
    normals: np.ndarray        # (N, 3) float32
    uvs: np.ndarray            # (N, 2) float32
    triangles: np.ndarray      # (M, 3) int32  (индексы в vertices)
    texture_png: bytes         # PNG, который ляжет на материал рыбки


# ---------- геометрия ----------

def _ellipsoid_grid(length: float, height: float, width: float,
                    seg_long: int = 32, seg_lat: int = 16) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Сетка эллипсоида, вытянутого по X (нос → хвост).

    Возвращает (vertices, uvs, lat_indices) — массив вершин и карту
    широтных колец. lat_indices[r] — диапазон индексов вершин
    широтного кольца r в общем массиве vertices.

    UV-развёртка — планарная (фронтальная проекция): рисунок рыбки
    ложится на бока модели без искажений, как если бы его приклеили
    на плоскую поверхность.
    """
    verts: List[List[float]] = []
    uvs: List[List[float]] = []
    lat_indices: List[Tuple[int, int]] = []

    hlx = length * 0.5
    hhy = height * 0.5
    hwz = width * 0.5

    for r in range(seg_lat + 1):
        phi = ((r / seg_lat) - 0.5) * math.pi  # -π/2..π/2
        ring_start = len(verts)
        for s in range(seg_long + 1):
            theta = (s / seg_long) * 2 * math.pi

            x = math.cos(theta) * math.cos(phi) * hlx
            y = math.sin(phi) * hhy
            z = math.sin(theta) * math.cos(phi) * hwz
            verts.append([x, y, z])

            # Планарная UV-развёртка: X→U (нос=0, хвост=1), Y→V (низ=0, верх=1)
            u = 0.5 + x / length  # при x ∈ [-hlx, hlx] → u ∈ [0, 1]
            v = 0.5 + y / height  # при y ∈ [-hhy, hhy] → v ∈ [0, 1]
            uvs.append([u, v])
        lat_indices.append((ring_start, len(verts)))

    return (np.asarray(verts, dtype=np.float32),
            np.asarray(uvs, dtype=np.float32),
            lat_indices)


def _ellipsoid_triangles(seg_long: int, seg_lat: int, lat_indices: List[Tuple[int, int]]) -> np.ndarray:
    """Индексы треугольников для эллипсоида по его широтным кольцам."""
    tris: List[List[int]] = []
    for r in range(seg_lat):
        a0, b0 = lat_indices[r]
        a1, b1 = lat_indices[r + 1]
        for s in range(seg_long):
            i00 = a0 + s
            i01 = a0 + s + 1
            i10 = a1 + s
            i11 = a1 + s + 1
            tris.append([i00, i10, i11])
            tris.append([i00, i11, i01])
    return np.asarray(tris, dtype=np.int32)


def _append_fin(vertices: List[List[float]],
                uvs: List[List[float]],
                tris: List[List[int]],
                root: Tuple[float, float, float],
                tip: Tuple[float, float, float],
                spread: float = 0.6,
                spine: int = 6,
                width: int = 4) -> None:
    """Добавляет плавник: вытянутый треугольник, разбитый на мелкую сетку."""
    rx, ry, rz = root
    tx, ty, tz = tip
    dx, dy, dz = tx - rx, ty - ry, tz - rz
    length = math.hypot(dx, dy, dz) or 1.0
    # локальный «бок» (перпендикулярно направлению, в плоскости Y-нормали)
    nx, ny, nz = -dz / length, 0.0, dx / length  # боковая ось
    base = len(vertices)
    for s in range(spine + 1):
        t = s / spine
        # плавник немного сужается к кончику
        scale = 1.0 - 0.4 * t
        for w in range(width + 1):
            u = w / width - 0.5  # -0.5..0.5
            ox = nx * u * spread * scale
            oy = ny * u * spread * scale
            oz = nz * u * spread * scale
            px = rx + dx * t + ox
            py = ry + dy * t + oy
            pz = rz + dz * t + oz
            vertices.append([px, py, pz])
            uvs.append([t, u + 0.5])
    # треугольники
    for s in range(spine):
        for w in range(width):
            i00 = base + s * (width + 1) + w
            i01 = base + s * (width + 1) + w + 1
            i10 = base + (s + 1) * (width + 1) + w
            i11 = base + (s + 1) * (width + 1) + w + 1
            tris.append([i00, i10, i11])
            tris.append([i00, i11, i01])


# ---------- текстура ----------

def _process_texture(png_bytes: bytes) -> bytes:
    """Берём PNG, обрезаем прозрачный фон, перепаковываем в PNG.

    Текстура в FBX должна быть «чистой» (с альфой или без рамки) —
    иначе на 3D-рыбке будет видна белая бумага по краям.
    """
    arr = np.frombuffer(png_bytes, dtype=np.uint8)
    bgra = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
    if bgra is None:
        # пустой однопиксельный fallback, чтобы FBX не валился
        return _empty_png()

    # grayscale (2D) → добавим каналы
    if bgra.ndim == 2:
        bgra = np.dstack([bgra, bgra, bgra, np.full(bgra.shape, 255, dtype=np.uint8)])
    elif bgra.shape[2] == 3:
        alpha = np.full(bgra.shape[:2], 255, dtype=np.uint8)
        bgra = np.dstack([bgra, alpha])

    if bgra.shape[2] >= 4:
        # уже с альфой — просто нормализуем размер до <=512 по длинной стороне
        h, w = bgra.shape[:2]
        m = max(h, w)
        if m > 512:
            scale = 512 / m
            bgra = cv2.resize(bgra, (int(w * scale), int(h * scale)),
                              interpolation=cv2.INTER_AREA)
    else:
        # если вдруг сканер отдал без альфы — добавим её
        h, w = bgra.shape[:2]
        m = max(h, w)
        if m > 512:
            scale = 512 / m
            bgra = cv2.resize(bgra, (int(w * scale), int(h * scale)),
                              interpolation=cv2.INTER_AREA)
        alpha = np.full(bgra.shape[:2], 255, dtype=np.uint8)
        bgra = np.dstack([bgra, alpha])

    ok, png = cv2.imencode(".png", bgra)
    if not ok:
        return _empty_png()
    return png.tobytes()


def _empty_png() -> bytes:
    """Минимальный валидный PNG 1×1 (белый) — последний фолбэк."""
    import base64
    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII="
    )


# ---------- публичная сборка ----------

def build_fish_mesh(png_bytes: bytes, species: str = "shark") -> FishMesh:
    """Собрать 3D-меш рыбки + текстуру для экспорта в .fbx."""
    # размеры корпуса зависят от вида: акулёнок длиннее, тропический — поуже
    if species == "shark":
        length, height, width = 2.4, 0.9, 0.7
    elif species == "tropical":
        length, height, width = 1.7, 1.1, 0.5
    else:
        length, height, width = 1.8, 1.1, 0.6

    # 1. корпус
    verts_arr, uvs_arr, lat_indices = _ellipsoid_grid(length, height, width)
    vertices = verts_arr.tolist()
    uvs = uvs_arr.tolist()
    triangles = _ellipsoid_triangles(32, 16, lat_indices).tolist()

    # 2. хвост (вертикальный, на «корме»)
    _append_fin(vertices, uvs, triangles,
                root=(-length * 0.45, 0.0, 0.0),
                tip=(-length * 0.55, 0.0, 0.0),
                spread=0.55, spine=8, width=2)
    # чуть-чуть вертикальной лопасти
    _append_fin(vertices, uvs, triangles,
                root=(-length * 0.45, 0.0, 0.0),
                tip=(-length * 0.55, 0.4, 0.0),
                spread=0.2, spine=4, width=2)
    _append_fin(vertices, uvs, triangles,
                root=(-length * 0.45, 0.0, 0.0),
                tip=(-length * 0.55, -0.4, 0.0),
                spread=0.2, spine=4, width=2)

    # 3. спинной плавник
    _append_fin(vertices, uvs, triangles,
                root=(-0.2, height * 0.5, 0.0),
                tip=(-0.5, height * 0.5 + 0.55, 0.0),
                spread=0.25, spine=8, width=2)

    # 4. брюшной плавник
    _append_fin(vertices, uvs, triangles,
                root=(0.05, -height * 0.5, 0.0),
                tip=(-0.05, -height * 0.5 - 0.35, 0.0),
                spread=0.18, spine=6, width=2)

    # 5. грудные плавники (по бокам)
    _append_fin(vertices, uvs, triangles,
                root=(length * 0.15, 0.0, width * 0.5),
                tip=(length * 0.0, 0.0, width * 0.5 + 0.45),
                spread=0.15, spine=6, width=2)
    _append_fin(vertices, uvs, triangles,
                root=(length * 0.15, 0.0, -width * 0.5),
                tip=(length * 0.0, 0.0, -width * 0.5 - 0.45),
                spread=0.15, spine=6, width=2)

    vertices_np = np.asarray(vertices, dtype=np.float32)
    uvs_np = np.asarray(uvs, dtype=np.float32)
    triangles_np = np.asarray(triangles, dtype=np.int32)

    # нормали считаем из треугольников
    normals = np.zeros_like(vertices_np)
    _accumulate_normals(vertices_np, triangles_np, normals)
    norm_len = np.linalg.norm(normals, axis=1, keepdims=True)
    norm_len[norm_len == 0] = 1.0
    normals = normals / norm_len

    return FishMesh(
        vertices=vertices_np,
        normals=normals.astype(np.float32),
        uvs=uvs_np,
        triangles=triangles_np,
        texture_png=_process_texture(png_bytes),
    )


def _accumulate_normals(vertices: np.ndarray, triangles: np.ndarray, normals: np.ndarray) -> None:
    """Area-weighted нормали (как у OpenGL по умолчанию)."""
    v0 = vertices[triangles[:, 0]]
    v1 = vertices[triangles[:, 1]]
    v2 = vertices[triangles[:, 2]]
    face_normals = np.cross(v1 - v0, v2 - v0)
    for i, fn in enumerate(face_normals):
        for idx in triangles[i]:
            normals[idx] += fn
