// FishModeler.cs
// --------------
// Основной скрипт Unity-бэкенда: берёт PNG с вырезанной рыбкой,
// генерит процедурный меш рыбки (вытянутый эллипсоид + плавники),
// натягивает PNG как текстуру и (опционально) экспортирует .fbx.
//
// Вызывается из FishModelerBatch.Build() в batch-режиме через
// Unity -executeMethod, либо напрямую из Edit-меню.

using System.IO;
using UnityEngine;

namespace FishWall
{
    public class FishModeler
    {
        // Геометрия рыбки. Те же параметры, что в Python-fallback,
        // чтобы визуальный результат был сопоставим.
        public struct FishSpec
        {
            public float length;   // X — нос → хвост
            public float height;   // Y — спина → брюхо
            public float width;    // Z — левый → правый бок
        }

        public static FishSpec SpecForSpecies(string species)
        {
            switch (species)
            {
                case "shark":    return new FishSpec { length = 2.4f, height = 0.9f, width = 0.7f };
                case "tropical": return new FishSpec { length = 1.7f, height = 1.1f, width = 0.5f };
                default:         return new FishSpec { length = 1.8f, height = 1.1f, width = 0.6f };
            }
        }

        public static GameObject BuildFishGameObject(byte[] pngBytes, string species)
        {
            var spec = SpecForSpecies(species);

            var go = new GameObject("Fish");
            var meshFilter = go.AddComponent<MeshFilter>();
            var meshRenderer = go.AddComponent<MeshRenderer>();

            var mesh = FishMeshBuilder.BuildFishMesh(spec);
            meshFilter.sharedMesh = mesh;

            // Материал с натянутой текстурой из присланого PNG
            var tex = new Texture2D(2, 2, TextureFormat.RGBA32, true);
            tex.LoadImage(pngBytes, markNonReadable: false);
            tex.filterMode = FilterMode.Bilinear;
            tex.wrapMode = TextureWrapMode.Clamp;
            tex.anisoLevel = 4;

            var shader = Shader.Find("Universal Render Pipeline/Lit") ??
                         Shader.Find("Standard") ??
                         Shader.Find("Sprites/Default");
            var mat = new Material(shader);
            // Разные пайплайны зовут основной цвет по-разному
            if (mat.HasProperty("_BaseMap"))   mat.SetTexture("_BaseMap", tex);
            if (mat.HasProperty("_MainTex"))   mat.SetTexture("_MainTex", tex);
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", Color.white);
            if (mat.HasProperty("_Color"))     mat.SetColor("_Color", Color.white);
            meshRenderer.sharedMaterial = mat;

            return go;
        }

        public static void ExportAsFbx(GameObject fish, string outputPath)
        {
            // Если в проекте стоит пакет "FBX Exporter" (com.unity.formats.fbx),
            // используем его. Иначе — пишем OBJ как запасной вариант.
#if UNITY_EDITOR && FBX_EXPORTER
            UnityEditor.Formats.Fbx.Exporter.ModelExporter.ExportObject(
                outputPath.Replace(".fbx", ".fbx"), fish);
#else
            // Fallback: пишем рядом .obj, а сервер Unity-bridge проверяет оба
            var objPath = outputPath.Replace(".fbx", ".obj");
            ExportAsObj(fish, objPath);
#endif
        }

        public static void ExportAsObj(GameObject go, string path)
        {
            var mesh = go.GetComponent<MeshFilter>()?.sharedMesh;
            if (mesh == null)
            {
                throw new System.Exception("Fish GameObject has no mesh");
            }
            var sb = new System.Text.StringBuilder();
            sb.AppendLine("# Exported by Fish Wall Unity backend");
            sb.AppendLine($"o {go.name}");
            foreach (var v in mesh.vertices)
                sb.AppendLine($"v {v.x} {v.y} {v.z}");
            foreach (var uv in mesh.uv)
                sb.AppendLine($"vt {uv.x} {uv.y}");
            sb.AppendLine("usemtl FishMat");
            sb.AppendLine("s 1");
            for (int i = 0; i < mesh.triangles.Length; i += 3)
            {
                int a = mesh.triangles[i] + 1;
                int b = mesh.triangles[i + 1] + 1;
                int c = mesh.triangles[i + 2] + 1;
                sb.AppendLine($"f {a}/{a} {b}/{b} {c}/{c}");
            }
            File.WriteAllText(path, sb.ToString());
        }
    }
}
