# Fish Wall — Unity-бэкенд

Подпроект, который FastAPI-сервер (`server/unity_bridge.py`) запускает
в headless-режиме, чтобы превращать 2D-вырезки рыбок в 3D-модели.

## Что внутри

| Путь | Что делает |
|---|---|
| `Assets/Scripts/FishModeler.cs`        | Точка входа: PNG + вид → GameObject с мешем и материалом |
| `Assets/Scripts/FishMeshBuilder.cs`    | Процедурный меш рыбки (эллипсоид + плавники + хвост) |
| `Assets/Editor/FishModelerBatch.cs`    | Batch-mode entry: `Build()` читает аргументы `-inputImage/-outputFbx/-species` |
| `ProjectSettings/ProjectVersion.txt`   | Unity 2022.3 LTS |
| `Packages/manifest.json`               | Минимум модулей, без URP-зависимостей — шейдер ищется через `Shader.Find` |

## Запуск из Python

```python
from pathlib import Path
import subprocess

cmd = [
    "Unity",                      # путь к бинарю (или возьмите из UnityBridge)
    "-batchmode", "-nographics", "-quit",
    "-projectPath", str(Path("unity_backend").resolve()),
    "-executeMethod", "FishWall.FishModelerBatch.Build",
    "-inputImage", "input.png",
    "-outputFbx",  "out.fbx",
    "-species",    "shark",
]
subprocess.run(cmd, check=True)
```

Сервер делает ровно это в `server/unity_bridge.py:UnityBridge._render_with_unity`.

## Зависимости

- **Минимум:** Unity 2022.3.x (LTS) — работает «как есть».
- **Опционально:** пакет `com.unity.formats.fbx` (Unity FBX Exporter)
  для нативного .fbx. Без него скрипт пишет .obj рядом — сервер
  умеет отдавать оба формата.
- **Опционально:** пакет URP/HDRP — `FishModeler` сначала ищет
  `Universal Render Pipeline/Lit`, иначе `Standard`, иначе
  `Sprites/Default`. На качество меша это не влияет, только на шейдер.

## Если Unity не установлен

`server/unity_bridge.py` сначала пробует найти `Unity` в `PATH`,
`/Applications/Unity/Hub/Editor/*` (macOS) и
`~/Unity/Hub/Editor/*/Editor/Unity` (Linux). Если не нашёл —
переключается на Python-fallback (`server/fish_mesh_builder.py` +
`server/fbx_writer.py`), который генерирует меш «вытянутый эллипсоид»
и пишет минимальный ASCII FBX 7.4. Файл открывается в Blender,
Unity и Maya как меш с одной UV-развёрткой и одной текстурой.
