"""
fbx_writer.py
-------------
Минимальный ASCII FBX 7.4 writer. Без зависимостей — только Python и
numpy. Цель: выдать валидный .fbx, который открывается в Blender,
Unity и Maya как меш с одной UV-развёрткой и одной текстурой.

ASCII FBX — это обычный текстовый иерархический формат Autodesk.
Мы пишем ровно те ноды, которые нужны для одного меша с материалом
и текстурой: FBXHeaderExtension, Objects (Geometry, Model, Material,
Texture, Video), Connections. Никаких анимаций, камер и т.п.

Источники: официальная спецификация Autodesk FBX SDK.
"""

from __future__ import annotations

import io
import time
from typing import List

import numpy as np

from .fish_mesh_builder import FishMesh


def _f(v) -> str:
    """FBX-число: всегда с десятичной точкой."""
    if isinstance(v, (np.floating, np.integer)):
        v = float(v)
    if isinstance(v, float):
        if v != v:  # NaN
            return "0"
        return f"{v:.6f}"
    return str(v)


def _array(values) -> str:
    """Список чисел через запятую — компактно, как любит Blender."""
    if isinstance(values, np.ndarray):
        values = values.flatten().tolist()
    return ",".join(_f(v) for v in values)


def _make_layer_uv(uvs: np.ndarray, poly_vertex_count: int) -> str:
    """UV-слой: каждый полигон-вертекс ссылается на свой UV."""
    return (
        "        Version: 101\n"
        "        Name: \"\"\n"
        "        MappingInformationType: \"ByPolygonVertex\"\n"
        "        ReferenceInformationType: \"IndexToDirect\"\n"
        f"        UV: *{uvs.size} {{\n"
        "          a: " + _array(uvs) + "\n"
        "        }\n"
        f"        UVIndex: *{poly_vertex_count} {{\n"
        "          a: " + _array(np.arange(poly_vertex_count, dtype=np.int32)) + "\n"
        "        }\n"
    )


def _make_layer_normal(normals: np.ndarray, poly_vertex_count: int) -> str:
    return (
        "        Version: 101\n"
        "        Name: \"\"\n"
        "        MappingInformationType: \"ByPolygonVertex\"\n"
        "        ReferenceInformationType: \"IndexToDirect\"\n"
        f"        Normals: *{normals.size} {{\n"
        "          a: " + _array(normals) + "\n"
        "        }\n"
        f"        NormalIndex: *{poly_vertex_count} {{\n"
        "          a: " + _array(np.arange(poly_vertex_count, dtype=np.int32)) + "\n"
        "        }\n"
    )


def _make_geometry(mesh: FishMesh, geom_id: int) -> str:
    """Geometry-узел: вершины, треугольники, UV, нормали."""
    # PolygonVertexIndex: 0-базированные индексы, последняя вершина
    # каждого полигона инвертируется битово (~idx = -idx-1).
    pvi: List[int] = []
    for tri in mesh.triangles:
        pvi.extend([int(tri[0]), int(tri[1]), ~int(tri[2])])

    tri_count = len(mesh.triangles)
    # по 3 индекса на каждый треугольник (по одному на вершину полигона)
    poly_vertex_count = tri_count * 3
    # NormalIndex сопоставляет каждую вершину полигона с её нормалью
    normal_index = mesh.triangles.flatten().astype(np.int32)

    return (
        f"    Geometry: {geom_id}, \"Geometry::FishMesh\", \"Mesh\" {{\n"
        "        Vertices: *" + str(len(mesh.vertices) * 3) + " {\n"
        "          a: " + _array(mesh.vertices) + "\n"
        "        }\n"
        "        PolygonVertexIndex: *" + str(len(pvi)) + " {\n"
        "          a: " + _array(np.asarray(pvi, dtype=np.int32)) + "\n"
        "        }\n"
        f"        GeometryVersion: 124\n"
        "        LayerElementNormal: 0 {\n"
        "          Version: 101\n"
        "          Name: \"\"\n"
        "          MappingInformationType: \"ByPolygonVertex\"\n"
        "          ReferenceInformationType: \"IndexToDirect\"\n"
        f"          Normals: *{mesh.normals.size} {{\n"
        "            a: " + _array(mesh.normals) + "\n"
        "          }\n"
        f"          NormalIndex: *{poly_vertex_count} {{\n"
        "            a: " + _array(normal_index) + "\n"
        "          }\n"
        "        }\n"
        "        LayerElementUV: 0 {\n"
        + _make_layer_uv(mesh.uvs, poly_vertex_count) +
        "        }\n"
        "        LayerElementTexture: 0 {\n"
        "          Version: 101\n"
        "          Name: \"\"\n"
        "          MappingInformationType: \"AllSame\"\n"
        "          ReferenceInformationType: \"IndexToDirect\"\n"
        "          TextureId: 0\n"
        "        }\n"
        "        Layer: 0 {\n"
        "          Version: 100\n"
        "          LayerElement:  {\n"
        "            Type: \"LayerElementNormal\"\n"
        "            TypedIndex: 0\n"
        "          }\n"
        "          LayerElement:  {\n"
        "            Type: \"LayerElementUV\"\n"
        "            TypedIndex: 0\n"
        "          }\n"
        "          LayerElement:  {\n"
        "            Type: \"LayerElementTexture\"\n"
        "            TypedIndex: 0\n"
        "          }\n"
        "        }\n"
        "    }\n"
    )


def write_fbx_ascii(mesh: FishMesh, texture_filename: str = "fish_texture.png") -> bytes:
    """Записать FishMesh в .fbx (ASCII 7.4). Возвращает bytes."""
    # FBX-часовой пояс: пишем локальное время (сдвиг 0), этого хватает
    # Blender / Unity для корректного парсинга.
    now = int(time.time())
    stamp = time.strftime("%Y-%m-%d %H:%M:%S:%M", time.localtime(now))

    GEOM_ID = 1000
    MODEL_ID = 2000
    MAT_ID = 3000
    TEX_ID = 4000
    VID_ID = 5000
    GLOBAL_SETTINGS_ID = 1

    geometry = _make_geometry(mesh, GEOM_ID)

    out = io.StringIO()
    out.write("; FBX 7.4.0 project file\n")
    out.write("; Created by fish_wall unity_bridge.py fallback\n")
    out.write("; ASCII\n")
    out.write("\n")

    # ---------- FBXHeaderExtension ----------
    out.write("FBXHeaderExtension:  {\n")
    out.write("    FBXHeaderVersion: 1003\n")
    out.write("    FBXVersion: 7400\n")
    out.write("    CreationTimeStamp:  {\n")
    out.write("        Version: 1000\n")
    out.write(f"        Year: {time.localtime(now).tm_year}\n")
    out.write(f"        Month: {time.localtime(now).tm_mon}\n")
    out.write(f"        Day: {time.localtime(now).tm_mday}\n")
    out.write(f"        Hour: {time.localtime(now).tm_hour}\n")
    out.write(f"        Minute: {time.localtime(now).tm_min}\n")
    out.write(f"        Second: {time.localtime(now).tm_sec}\n")
    out.write("        Millisecond: 0\n")
    out.write("    }\n")
    out.write(f"    CreationTime: \"{stamp}\"\n")
    out.write("    Creator: \"fish_wall fallback\"\n")
    out.write("    SceneInfo: \"SceneInfo::GlobalInfo\", \"UserData\" {\n")
    out.write("        Type: \"UserData\"\n")
    out.write("        Version: 100\n")
    out.write("        MetaData:  {\n")
    out.write("            Version: 100\n")
    out.write("            Title: \"\"\n")
    out.write("            Subject: \"\"\n")
    out.write("            Author: \"fish_wall\"\n")
    out.write("            Keywords: \"\"\n")
    out.write("            Revision: \"\"\n")
    out.write("            Comment: \"3D fish from child drawing\"\n")
    out.write("        }\n")
    out.write("    }\n")
    out.write("}\n\n")

    # ---------- GlobalSettings ----------
    out.write("GlobalSettings:  {\n")
    out.write("    Version: 1000\n")
    out.write("    Properties70:  {\n")
    out.write("        P: \"UpAxis\", \"int\", \"Integer\", \"\",1\n")
    out.write("        P: \"UpAxisSign\", \"int\", \"Integer\", \"\",1\n")
    out.write("        P: \"FrontAxis\", \"int\", \"Integer\", \"\",2\n")
    out.write("        P: \"FrontAxisSign\", \"int\", \"Integer\", \"\",1\n")
    out.write("        P: \"CoordAxis\", \"int\", \"Integer\", \"\",0\n")
    out.write("        P: \"CoordAxisSign\", \"int\", \"Integer\", \"\",1\n")
    out.write("        P: \"OriginalUpAxis\", \"int\", \"Integer\", \"\",-1\n")
    out.write("        P: \"OriginalUpAxisSign\", \"int\", \"Integer\", \"\",1\n")
    out.write("        P: \"UnitScaleFactor\", \"double\", \"Number\", \"\",1\n")
    out.write("        P: \"OriginalUnitScaleFactor\", \"double\", \"Number\", \"\",1\n")
    out.write("        P: \"AmbientColor\", \"ColorRGB\", \"Color\", \"\",0,0,0\n")
    out.write("        P: \"DefaultCamera\", \"KString\", \"\", \"\", \"Producer Perspective\"\n")
    out.write("        P: \"TimeMode\", \"enum\", \"\", \"\",11\n")
    out.write("        P: \"TimeProtocol\", \"enum\", \"\", \"\",2\n")
    out.write("        P: \"SnapOnFrameMode\", \"enum\", \"\", \"\",0\n")
    out.write("        P: \"TimeSpanStart\", \"KTime\", \"Time\", \"\",0\n")
    out.write("        P: \"TimeSpanStop\", \"KTime\", \"Time\", \"\",46186158000\n")
    out.write("        P: \"CustomFrameRate\", \"double\", \"Number\", \"\",-1\n")
    out.write("    }\n")
    out.write("}\n\n")

    # ---------- Documents ----------
    out.write("Documents:  {\n")
    out.write("    Count: 1\n")
    out.write("    Document: 1234567890, \"Doc\", \"Scene\" {\n")
    out.write("        Properties70:  {\n")
    out.write("            P: \"SourceObject\", \"object\", \"\", \"\"\n")
    out.write("            P: \"ActiveAnimStackName\", \"KString\", \"\", \"\", \"\"\n")
    out.write("        }\n")
    out.write("        RootNode: 0\n")
    out.write("    }\n")
    out.write("}\n\n")

    # ---------- References ----------
    out.write("References:  {\n")
    out.write("}\n\n")

    # ---------- Definitions ----------
    out.write("Definitions:  {\n")
    out.write("    Version: 100\n")
    out.write("    Count: 4\n\n")
    out.write("    ObjectType: \"GlobalSettings\" {\n")
    out.write("        Count: 1\n")
    out.write("    }\n\n")
    out.write("    ObjectType: \"Model\" {\n")
    out.write("        Count: 1\n")
    out.write("        PropertyTemplate: \"FbxNode\" {\n")
    out.write("            Properties70:  {\n")
    out.write("                P: \"Lcl Translation\", \"Lcl Translation\", \"\", \"A\",0,0,0\n")
    out.write("                P: \"Lcl Rotation\", \"Lcl Rotation\", \"\", \"A\",0,0,0\n")
    out.write("                P: \"Lcl Scaling\", \"Lcl Scaling\", \"\", \"A\",1,1,1\n")
    out.write("                P: \"DefaultAttributeIndex\", \"int\", \"Integer\", \"AH\",-1\n")
    out.write("            }\n")
    out.write("        }\n")
    out.write("    }\n\n")
    out.write("    ObjectType: \"Geometry\" {\n")
    out.write("        Count: 1\n")
    out.write("        PropertyTemplate: \"FbxMesh\" {\n")
    out.write("            Properties70:  {\n")
    out.write("                P: \"Color\", \"ColorRGB\", \"Color\", \"\",0.8,0.8,0.8\n")
    out.write("                P: \"Primary Visibility\", \"bool\", \"\", \"\",1\n")
    out.write("            }\n")
    out.write("        }\n")
    out.write("    }\n\n")
    out.write("    ObjectType: \"Material\" {\n")
    out.write("        Count: 1\n")
    out.write("        PropertyTemplate: \"FbxSurfaceLambert\" {\n")
    out.write("            Properties70:  {\n")
    out.write("                P: \"ShadingModel\", \"KString\", \"\", \"\", \"Lambert\"\n")
    out.write("                P: \"DiffuseColor\", \"Color\", \"\", \"A\",0.8,0.8,0.8\n")
    out.write("                P: \"TransparentColor\", \"Color\", \"\", \"A\",0,0,0\n")
    out.write("            }\n")
    out.write("        }\n")
    out.write("    }\n\n")
    out.write("    ObjectType: \"Texture\" {\n")
    out.write("        Count: 1\n")
    out.write("        PropertyTemplate: \"FbxFileTexture\" {\n")
    out.write("            Properties70:  {\n")
    out.write("                P: \"TextureTypeUse\", \"enum\", \"\", \"\",0\n")
    out.write("                P: \"TextureType\", \"enum\", \"\", \"\",0\n")
    out.write("                P: \"UVSwap\", \"bool\", \"\", \"\",0\n")
    out.write("                P: \"UseMaterial\", \"bool\", \"\", \"\",1\n")
    out.write("                P: \"UseMipMap\", \"bool\", \"\", \"\",0\n")
    out.write("            }\n")
    out.write("        }\n")
    out.write("    }\n")
    out.write("}\n\n")

    # ---------- Objects ----------
    out.write("Objects:  {\n")
    out.write(geometry)

    out.write(
        f"    Model: {MODEL_ID}, \"Model::Fish\", \"Mesh\" {{\n"
        "        Version: 232\n"
        "        Properties70:  {\n"
        "            P: \"Lcl Translation\", \"Lcl Translation\", \"\", \"A\",0,0,0\n"
        "            P: \"Lcl Rotation\", \"Lcl Rotation\", \"\", \"A\",0,0,0\n"
        "            P: \"Lcl Scaling\", \"Lcl Scaling\", \"\", \"A\",1,1,1\n"
        "            P: \"DefaultAttributeIndex\", \"int\", \"Integer\", \"AH\",-1\n"
        "        }\n"
        "        Shading: T\n"
        "        Culling: \"CullingOff\"\n"
        f"    }}\n"
    )

    out.write(
        f"    Material: {MAT_ID}, \"Material::Fish\", \"\" {{\n"
        "        Version: 102\n"
        "        ShadingModel: \"lambert\"\n"
        "        MultiLayer: 0\n"
        "        Properties70:  {\n"
        "            P: \"DiffuseColor\", \"Color\", \"\", \"A\",0.85,0.85,0.85\n"
        "            P: \"TransparentColor\", \"Color\", \"\", \"A\",0,0,0\n"
        "            P: \"Emissive\", \"Vector3D\", \"Vector\", \"\",0,0,0\n"
        "            P: \"AmbientFactor\", \"double\", \"Number\", \"\",1\n"
        "            P: \"DiffuseFactor\", \"double\", \"Number\", \"\",1\n"
        "        }\n"
        f"    }}\n"
    )

    out.write(
        f"    Texture: {TEX_ID}, \"Texture::Fish\", \"\" {{\n"
        "        Type: \"TextureVideoClip\"\n"
        "        Version: 202\n"
        "        TextureName: \"Texture::Fish\"\n"
        "        Properties70:  {\n"
        "            P: \"UVSet\", \"KString\", \"\", \"\", \"UVSet0\"\n"
        "            P: \"UseMaterial\", \"bool\", \"\", \"\",1\n"
        "        }\n"
        "        FileName: \"" + texture_filename + "\"\n"
        "        RelativeFilename: \"" + texture_filename + "\"\n"
        f"    }}\n"
    )

    out.write(
        f"    Video: {VID_ID}, \"Video::Fish\", \"Clip\" {{\n"
        "        Type: \"Clip\"\n"
        "        Properties70:  {\n"
        "            P: \"Path\", \"KString\", \"XRefUrlPath\", \"\", \"" + texture_filename + "\"\n"
        "        }\n"
        "        UseMipMap: 0\n"
        "        Filename: \"" + texture_filename + "\"\n"
        "        RelativeFilename: \"" + texture_filename + "\"\n"
        f"    }}\n"
    )

    out.write("}\n\n")

    # ---------- Connections ----------
    out.write("Connections:  {\n")
    out.write("\n")
    out.write(f"    ; Model::Fish, Model::RootNode\n")
    out.write(f"    C: \"OO\", {MODEL_ID}, {0}\n\n")
    out.write(f"    ; Geometry link\n")
    out.write(f"    C: \"OO\", {GEOM_ID}, {MODEL_ID}\n\n")
    out.write(f"    ; Material link\n")
    out.write(f"    C: \"OO\", {MAT_ID}, {MODEL_ID}\n\n")
    out.write(f"    ; Texture on material\n")
    out.write(f"    C: \"OO\", {TEX_ID}, {MAT_ID}\n\n")
    out.write(f"    ; Video clip on texture\n")
    out.write(f"    C: \"OO\", {VID_ID}, {TEX_ID}\n")
    out.write("}\n\n")

    out.write(f"; End of file.\n")

    return out.getvalue().encode("utf-8")
