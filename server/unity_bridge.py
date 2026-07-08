"""
unity_bridge.py
---------------
Связь FastAPI-сервера с Unity-бэкендом, который превращает 2D-рисунок
рыбки в 3D-модель (.fbx).

Архитектура:
    FastAPI  →  UnityBridge.render_to_fbx(png_bytes, species)
                    │
                    ├── 1. пытается найти Unity (CLI `Unity` / `unity`)
                    │      и вызвать его в batch-режиме:
                    │        Unity -batchmode -nographics -quit
                    │              -projectPath <unity_backend>
                    │              -executeMethod FishModelerBatch.Build
                    │              -inputImage <png> -outputFbx <fbx> -species shark
                    │      (FishModeler.Build читает PNG, генерит меш,
                    │       натягивает текстуру и пишет .fbx)
                    │
                    └── 2. если Unity не найден или вернул код != 0,
                           отрабатывает Python-fallback:
                              • numpy-only процедурный меш «вытянутый
                                эллипсоид + плавники»,
                              • текстура — тот же PNG, что прислал
                                сканер (натягивается через UV),
                              • экспорт в минимальный ASCII FBX
                                (формат задокументирован Autodesk,
                                парсится Blender / Unity / Maya).
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parent.parent
UNITY_PROJECT_DIR = BACKEND_DIR / "unity_backend"
DEFAULT_TIMEOUT = 60  # секунд на один прогон Unity


class UnityUnavailableError(RuntimeError):
    """Unity не нашли в системе вообще."""


class UnityRenderError(RuntimeError):
    """Unity нашли, но он упал или вернул мусор."""


class UnityBridge:
    """Ищет Unity, дёргает его в batch-режиме, иначе — fallback."""

    def __init__(self, unity_path: Optional[str] = None,
                 project_dir: Optional[Path] = None,
                 timeout: int = DEFAULT_TIMEOUT) -> None:
        self.unity_path = unity_path or self._discover_unity()
        self.project_dir = project_dir or UNITY_PROJECT_DIR
        self.timeout = timeout

    # ---------- публичный API ----------

    def is_available(self) -> bool:
        """Доступен ли настоящий Unity (а не fallback)."""
        return self.unity_path is not None and self.project_dir.exists()

    def render_to_fbx(self, png_bytes: bytes, species: str = "shark") -> Tuple[bytes, bytes]:
        """PNG → (.fbx bytes, .png texture bytes). Пробует Unity, иначе — Python-fallback."""
        if self.is_available():
            try:
                fbx = self._render_with_unity(png_bytes, species)
                # Unity сохраняет текстуру внутри .fbx; отдельный PNG не возвращается —
                # в качестве текстуры отдаём исходный PNG (Fallback: при Unity-пути
                # текстура уже встроена, так что это запасной вариант).
                return fbx, png_bytes
            except (UnityUnavailableError, UnityRenderError) as exc:
                logger.warning("Unity недоступен/упал (%s) — fallback", exc)

        # Fallback — гарантированно что-то отдаём
        return self._render_with_python_fallback(png_bytes, species)

    # ---------- поиск Unity ----------

    @staticmethod
    def _discover_unity() -> Optional[str]:
        """Пытаемся найти бинарь Unity в типичных местах."""
        for name in ("Unity", "unity", "Unity.exe"):
            path = shutil.which(name)
            if path:
                return path
        # macOS: /Applications/Unity/Hub/Editor/<ver>/Unity.app/Contents/MacOS/Unity
        mac = Path("/Applications/Unity/Hub/Editor")
        if mac.exists():
            editors = sorted(mac.glob("*/Unity.app/Contents/MacOS/Unity"))
            if editors:
                return str(editors[-1])
        # Linux: ~/Unity/Hub/Editor/<ver>/Editor/Unity
        hub = Path.home() / "Unity" / "Hub" / "Editor"
        if hub.exists():
            editors = sorted(hub.glob("*/Editor/Unity"))
            if editors:
                return str(editors[-1])
        return None

    # ---------- вызов Unity ----------

    def _render_with_unity(self, png_bytes: bytes, species: str) -> bytes:
        if not self.unity_path:
            raise UnityUnavailableError("Unity binary not found")

        with tempfile.TemporaryDirectory(prefix="fish_wall_") as tmp:
            tmp_dir = Path(tmp)
            input_png = tmp_dir / "input.png"
            output_fbx = tmp_dir / "fish.fbx"
            input_png.write_bytes(png_bytes)

            cmd = [
                self.unity_path,
                "-batchmode",
                "-nographics",
                "-quit",
                "-projectPath", str(self.project_dir),
                "-executeMethod", "FishModelerBatch.Build",
                "-inputImage", str(input_png),
                "-outputFbx", str(output_fbx),
                "-species", species,
                "-logFile", str(tmp_dir / "unity.log"),
            ]
            logger.info("Запускаю Unity: %s", " ".join(cmd))
            try:
                proc = subprocess.run(
                    cmd,
                    check=False,
                    capture_output=True,
                    timeout=self.timeout,
                )
            except subprocess.TimeoutExpired as exc:
                raise UnityRenderError(f"Unity timeout after {self.timeout}s") from exc

            if proc.returncode != 0 or not output_fbx.exists():
                log_tail = (tmp_dir / "unity.log").read_text(errors="ignore")[-2000:]
                raise UnityRenderError(
                    f"Unity exit {proc.returncode}; log tail:\n{log_tail}"
                )
            return output_fbx.read_bytes()

    # ---------- Python-fallback (numpy-only) ----------

    def _render_with_python_fallback(self, png_bytes: bytes, species: str) -> Tuple[bytes, bytes]:
        """Генерирует упрощённую 3D-рыбку и пишет минимальный ASCII FBX.

        Возвращает (fbx_bytes, texture_png_bytes).
        """
        from . import fish_mesh_builder  # local, чтобы не падать в import-time
        from .fbx_writer import write_fbx_ascii

        mesh = fish_mesh_builder.build_fish_mesh(png_bytes, species=species)
        # FBX ссылается на текстуру по относительному пути — возвращаем оба
        return write_fbx_ascii(mesh), mesh.texture_png
