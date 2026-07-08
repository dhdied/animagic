// FishModelerBatch.cs
// -------------------
// Editor-only entry point. Запускается через:
//   Unity -batchmode -nographics -quit
//         -projectPath <this project>
//         -executeMethod FishWall.FishModelerBatch.Build
//         -inputImage <png> -outputFbx <fbx> -species shark
//
// ВАЖНО: пути аргументов читаются через System.Environment.GetCommandLineArgs(),
//        а не через статические поля — Unity НЕ передаёт аргументы как
//        обычные параметры метода.

using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace FishWall
{
    public static class FishModelerBatch
    {
        public static void Build()
        {
            string inputImage = null;
            string outputFbx = null;
            string species = "shark";

            var args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
            {
                switch (args[i])
                {
                    case "-inputImage":  inputImage = args[i + 1]; break;
                    case "-outputFbx":   outputFbx  = args[i + 1]; break;
                    case "-species":     species    = args[i + 1]; break;
                }
            }

            if (string.IsNullOrEmpty(inputImage) || !File.Exists(inputImage))
            {
                Die($"-inputImage not found: {inputImage}");
                return;
            }
            if (string.IsNullOrEmpty(outputFbx))
            {
                Die("-outputFbx missing");
                return;
            }

            try
            {
                var pngBytes = File.ReadAllBytes(inputImage);
                var go = FishModeler.BuildFishGameObject(pngBytes, species);
                Directory.CreateDirectory(Path.GetDirectoryName(outputFbx));
                FishModeler.ExportAsFbx(go, outputFbx);
                UnityEngine.Object.DestroyImmediate(go);

                Debug.Log($"[FishModelerBatch] OK: {outputFbx}");
                EditorApplication.Exit(0);
            }
            catch (Exception exc)
            {
                Die(exc.ToString());
            }
        }

        private static void Die(string message)
        {
            Debug.LogError("[FishModelerBatch] " + message);
            EditorApplication.Exit(1);
        }
    }
}
