// FishMeshBuilder.cs
// -----------------
// Процедурная 3D-рыбка: вытянутый эллипсоид + плавники + хвост.
// UV-развёртка прижимает PNG-текстуру на бока корпуса, чтобы на
// готовом .fbx ребёнок увидел свой рисунок как раскраску рыбки.
//
// Возвращает Mesh с уже посчитанными нормалями.

using System.Collections.Generic;
using UnityEngine;

namespace FishWall
{
    public static class FishMeshBuilder
    {
        public static Mesh BuildFishMesh(FishModeler.FishSpec spec)
        {
            const int segLong = 32;
            const int segLat = 16;

            var verts = new List<Vector3>();
            var uvs = new List<Vector2>();
            var latStart = new int[segLat + 1];
            var latEnd = new int[segLat + 1];
            var tris = new List<int>();

            // ---- корпус-эллипсоид
            for (int r = 0; r <= segLat; r++)
            {
                float v = (float)r / segLat;
                float phi = (v - 0.5f) * Mathf.PI;
                latStart[r] = verts.Count;
                for (int s = 0; s <= segLong; s++)
                {
                    float u = (float)s / segLong;
                    float theta = u * Mathf.PI * 2f;

                    float x = Mathf.Cos(theta) * Mathf.Cos(phi) * spec.length * 0.5f;
                    float y = Mathf.Sin(phi) * spec.height * 0.5f;
                    float z = Mathf.Sin(theta) * Mathf.Cos(phi) * spec.width * 0.5f;
                    verts.Add(new Vector3(x, y, z));
                    uvs.Add(new Vector2(u, v));
                }
                latEnd[r] = verts.Count;
            }

            for (int r = 0; r < segLat; r++)
            {
                for (int s = 0; s < segLong; s++)
                {
                    int i00 = latStart[r] + s;
                    int i01 = latStart[r] + s + 1;
                    int i10 = latStart[r + 1] + s;
                    int i11 = latStart[r + 1] + s + 1;
                    tris.Add(i00); tris.Add(i10); tris.Add(i11);
                    tris.Add(i00); tris.Add(i11); tris.Add(i01);
                }
            }

            // ---- хвост
            AppendFin(verts, uvs, tris,
                root: new Vector3(-spec.length * 0.45f, 0f, 0f),
                tip:  new Vector3(-spec.length * 0.55f, 0f, 0f),
                spread: 0.55f, spine: 8, width: 2);
            AppendFin(verts, uvs, tris,
                root: new Vector3(-spec.length * 0.45f, 0f, 0f),
                tip:  new Vector3(-spec.length * 0.55f, 0.4f, 0f),
                spread: 0.2f, spine: 4, width: 2);
            AppendFin(verts, uvs, tris,
                root: new Vector3(-spec.length * 0.45f, 0f, 0f),
                tip:  new Vector3(-spec.length * 0.55f, -0.4f, 0f),
                spread: 0.2f, spine: 4, width: 2);

            // ---- спинной плавник
            AppendFin(verts, uvs, tris,
                root: new Vector3(-0.2f, spec.height * 0.5f, 0f),
                tip:  new Vector3(-0.5f, spec.height * 0.5f + 0.55f, 0f),
                spread: 0.25f, spine: 8, width: 2);

            // ---- брюшной плавник
            AppendFin(verts, uvs, tris,
                root: new Vector3(0.05f, -spec.height * 0.5f, 0f),
                tip:  new Vector3(-0.05f, -spec.height * 0.5f - 0.35f, 0f),
                spread: 0.18f, spine: 6, width: 2);

            // ---- грудные плавники (по бокам)
            AppendFin(verts, uvs, tris,
                root: new Vector3(spec.length * 0.15f, 0f, spec.width * 0.5f),
                tip:  new Vector3(spec.length * 0f, 0f, spec.width * 0.5f + 0.45f),
                spread: 0.15f, spine: 6, width: 2);
            AppendFin(verts, uvs, tris,
                root: new Vector3(spec.length * 0.15f, 0f, -spec.width * 0.5f),
                tip:  new Vector3(spec.length * 0f, 0f, -spec.width * 0.5f - 0.45f),
                spread: 0.15f, spine: 6, width: 2);

            var mesh = new Mesh
            {
                name = "FishMesh",
                indexFormat = verts.Count > 65535
                    ? UnityEngine.Rendering.IndexFormat.UInt32
                    : UnityEngine.Rendering.IndexFormat.UInt16,
            };
            mesh.SetVertices(verts);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateNormals();
            return mesh;
        }

        private static void AppendFin(List<Vector3> verts, List<Vector2> uvs, List<int> tris,
            Vector3 root, Vector3 tip, float spread, int spine, int width)
        {
            Vector3 dir = tip - root;
            float length = dir.magnitude;
            if (length < 1e-5f) length = 1e-5f;
            Vector3 axis = dir / length;
            // боковая ось (перпендикулярно направлению и глобальной Y)
            Vector3 side = new Vector3(-axis.z, 0f, axis.x).normalized;

            int baseIdx = verts.Count;
            for (int s = 0; s <= spine; s++)
            {
                float t = (float)s / spine;
                float scale = 1f - 0.4f * t;
                for (int w = 0; w <= width; w++)
                {
                    float u = (float)w / width - 0.5f;
                    Vector3 offset = side * (u * spread * scale);
                    Vector3 p = root + dir * t + offset;
                    verts.Add(p);
                    uvs.Add(new Vector2(t, u + 0.5f));
                }
            }
            for (int s = 0; s < spine; s++)
            {
                for (int w = 0; w < width; w++)
                {
                    int i00 = baseIdx + s * (width + 1) + w;
                    int i01 = baseIdx + s * (width + 1) + w + 1;
                    int i10 = baseIdx + (s + 1) * (width + 1) + w;
                    int i11 = baseIdx + (s + 1) * (width + 1) + w + 1;
                    tris.Add(i00); tris.Add(i10); tris.Add(i11);
                    tris.Add(i00); tris.Add(i11); tris.Add(i01);
                }
            }
        }
    }
}
