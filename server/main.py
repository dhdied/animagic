"""
main.py
-------
The "server" in the client-server-on-local-network architecture.

Two browser-facing pages are served as static files:
  /scanner  -> Device 1. Take/upload a photo of the drawing, pick a fish
              species, hit the button. Runs on a phone.
  /wall     -> Device 2. The big screen. Shows the underwater scene and
              receives new fish in real time over a WebSocket.

One HTTP endpoint does the actual work:
  POST /api/scan  -> runs scanner.photo_to_fish_sprite() on the uploaded
                     photo and broadcasts the result to every /wall client.

Run with:
  uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload

Then, on the phone and on the wall's browser (same Wi-Fi network), open
http://<this-computer's-LAN-IP>:8000/scanner and .../wall
"""

from __future__ import annotations

import base64
import logging
import random
import shutil
import uuid
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import FastAPI, UploadFile, File, Form, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .scanner import photo_to_fish_sprite, NoFrameFoundError
from .unity_bridge import UnityBridge, UnityUnavailableError, UnityRenderError

from fastapi import Depends
from sqlalchemy.orm import Session
from .database import engine, SessionLocal, FishRecord, Base

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

logger = logging.getLogger("fish_wall")

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
ASSETS_DIR = BASE_DIR / "assets"
MODEL_DIR = BASE_DIR / "model"
GENERATED_DIR = BASE_DIR / "generated" / "fbx"

app = FastAPI(title="Fish Wall")

# Species -> swim behaviour. Kept on the server so scanner and wall always
# agree, and so adding a new species later is a one-line change.
# "pattern" picks a steering strategy in wall.js:
#   sine    — плавает туда-обратно с волной по Y
#   circle  — кружится вокруг дрейфующего центра
#   wander  — случайное блуждание с резкими поворотами
#   free    — плавное движение в любом направлении (выбирает курс каждые
#             1.5–4.5 с и плавно подруливает к нему через steering)
SPECIES = {
    "goldfish": {"label": "Золотая рыбка", "pattern": "free", "speed": 1.0, "scale": 1.0, "three_d": False},
    "tropical": {"label": "Тропическая рыбка", "pattern": "circle", "speed": 1.3, "scale": 0.85, "three_d": False},
    "shark":    {"label": "Акулёнок", "pattern": "wander", "speed": 0.9, "scale": 1.4, "three_d": True},
}


class ConnectionManager:
    """Tracks every connected Wall so a new fish can be pushed to all of them."""

    def __init__(self) -> None:
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast_json(self, payload: dict) -> None:
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()
unity_bridge = UnityBridge()


@app.get("/api/health")
async def health() -> dict:
    """Lightweight liveness probe + diagnostics for the 3D backend."""
    return {
        "ok": True,
        "walls_connected": len(manager.active),
        "unity_available": unity_bridge.is_available(),
        "unity_path": unity_bridge.unity_path,
    }


@app.get("/scanner")
async def scanner_page():
    return FileResponse(STATIC_DIR / "scanner.html")


@app.get("/wall")
async def wall_page():
    return FileResponse(STATIC_DIR / "wall.html")


@app.get("/api/species")
async def list_species():
    return {key: {"label": v["label"]} for key, v in SPECIES.items()}

@app.get("/api/history")
async def get_history(db: Session = Depends(get_db)):
    """Отдает клиенту 40 последних созданных рыб для инициализации океана."""
    fishes = (
        db.query(FishRecord)
        .filter(FishRecord.is_active == True)
        .order_by(FishRecord.created_at.desc())
        .limit(40)
        .all()
    )
    return [fish.payload for fish in fishes]

@app.get("/assets/{filename}")
async def assets(filename: str):
    path = ASSETS_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Not found")
    return FileResponse(path)


@app.post("/api/scan")
async def scan(photo: UploadFile = File(...), species: str = Form("goldfish"), db: Session = Depends(get_db)):
    if species not in SPECIES:
        species = "goldfish"

    image_bytes = await photo.read()

    try:
        sprite_png = photo_to_fish_sprite(image_bytes)
    except NoFrameFoundError as exc:
        # 422 = "I understood the request, but couldn't find a usable
        # drawing in it" -- the scanner page shows this as a friendly
        # "try again, make sure the frame is fully visible" message.
        raise HTTPException(status_code=422, detail=str(exc))

    fish_id = uuid.uuid4().hex[:10]
    meta = SPECIES[species]

    payload = {
        "type": "new_fish",
        "id": fish_id,
        "species": species,
        "label": meta["label"],
        "pattern": meta["pattern"],
        "speed": meta["speed"] * random.uniform(0.85, 1.15),
        "scale": meta["scale"] * random.uniform(0.9, 1.1),
        "image": "data:image/png;base64," + base64.b64encode(sprite_png).decode("ascii"),
    }

    db_record = FishRecord(id=fish_id, payload=payload)
    db.add(db_record)
    db.commit()

    await manager.broadcast_json(payload)

    return JSONResponse({"ok": True, "id": fish_id, "walls_notified": len(manager.active)})


@app.post("/api/scan3d_animated")
async def scan3d_animated(photo: UploadFile = File(...), species: str = Form("shark"), db: Session = Depends(get_db)):
    """Принять 2D-рисунок, натянуть его как текстуру на готовую
    анимированную модель Fish_Animated.fbx и разослать на стены.
    """
    if species not in SPECIES:
        species = "shark"

    base_model = MODEL_DIR / "Fish_Animated.fbx"
    if not base_model.exists():
        raise HTTPException(
            status_code=503,
            detail="Базовая 3D-модель не найдена (model/Fish_Animated.fbx)",
        )

    image_bytes = await photo.read()
    try:
        sprite_png = photo_to_fish_sprite(image_bytes)
    except NoFrameFoundError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    fish_id = uuid.uuid4().hex[:10]
    fish_dir = GENERATED_DIR / fish_id
    fish_dir.mkdir(parents=True, exist_ok=True)

    shutil.copy(base_model, fish_dir / "fish.fbx")
    (fish_dir / "fish_texture.png").write_bytes(sprite_png)

    meta = SPECIES[species]

    payload = {
        "type": "new_fish_3d_animated",
        "id": fish_id,
        "species": species,
        "label": meta["label"],
        "pattern": meta["pattern"],
        "speed": meta["speed"] * random.uniform(0.85, 1.15),
        "scale": meta["scale"] * random.uniform(0.9, 1.1),
        "image": "data:image/png;base64," + base64.b64encode(sprite_png).decode("ascii"),
        "fbx_url": f"/api/fbx/{fish_id}",
        "texture_url": f"/api/texture/{fish_id}",
    }

    db_record = FishRecord(id=fish_id, payload=payload)
    db.add(db_record)
    db.commit()

    await manager.broadcast_json(payload)

    return JSONResponse(
        {
            "ok": True,
            "id": fish_id,
            "walls_notified": len(manager.active),
            "fbx_url": payload["fbx_url"],
            "texture_url": payload["texture_url"],
            "fbx_size": base_model.stat().st_size,
            "rendered_with": "animated-model",
        }
    )


@app.post("/api/scan3d")
async def scan3d(photo: UploadFile = File(...), species: str = Form("shark"), db: Session = Depends(get_db)):
    """Принять 2D-рисунок, отдать 3D-модель (.fbx) и разослать её стенам."""
    if species not in SPECIES:
        species = "shark"

    image_bytes = await photo.read()
    try:
        sprite_png = photo_to_fish_sprite(image_bytes)
    except NoFrameFoundError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    try:
        fbx_bytes, texture_png = unity_bridge.render_to_fbx(sprite_png, species=species)
    except UnityUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"Unity недоступен: {exc}")
    except UnityRenderError as exc:
        raise HTTPException(status_code=500, detail=f"Ошибка Unity: {exc}")

    fish_id = uuid.uuid4().hex[:10]
    fish_dir = GENERATED_DIR / fish_id
    fish_dir.mkdir(parents=True, exist_ok=True)
    fbx_path = fish_dir / "fish.fbx"
    fbx_path.write_bytes(fbx_bytes)
    (fish_dir / "fish_texture.png").write_bytes(texture_png)

    meta = SPECIES[species]
    
    payload = {
        "type": "new_fish_3d",
        "id": fish_id,
        "species": species,
        "label": meta["label"],
        "pattern": meta["pattern"],
        "speed": meta["speed"] * random.uniform(0.85, 1.15),
        "scale": meta["scale"] * random.uniform(0.9, 1.1),
        "image": "data:image/png;base64," + base64.b64encode(sprite_png).decode("ascii"),
        "fbx_url": f"/api/fbx/{fish_id}",
    }

    db_record = FishRecord(id=fish_id, payload=payload)
    db.add(db_record)
    db.commit()

    await manager.broadcast_json(payload)

    return JSONResponse(
        {
            "ok": True,
            "id": fish_id,
            "walls_notified": len(manager.active),
            "fbx_url": payload["fbx_url"],
            "fbx_size": len(fbx_bytes),
            "rendered_with": "unity" if unity_bridge.is_available() else "python-fallback",
        }
    )


@app.get("/api/fbx/{fish_id}")
async def get_fbx(fish_id: str):
    """Скачать сгенерированный .fbx по id рыбки."""
    fish_dir = (GENERATED_DIR / fish_id).resolve()
    base = GENERATED_DIR.resolve()
    if not str(fish_dir).startswith(str(base)):
        raise HTTPException(400, "bad id")
    fbx_path = fish_dir / "fish.fbx"
    if not fbx_path.exists():
        raise HTTPException(404, "model not found")
    return FileResponse(fbx_path, media_type="application/octet-stream",
                        filename=f"fish_{fish_id}.fbx")


@app.get("/api/texture/{fish_id}")
async def get_texture(fish_id: str):
    """Скачать текстуру рыбки (PNG)."""
    fish_dir = (GENERATED_DIR / fish_id).resolve()
    base = GENERATED_DIR.resolve()
    if not str(fish_dir).startswith(str(base)):
        raise HTTPException(400, "bad id")
    tex_path = fish_dir / "fish_texture.png"
    if not tex_path.exists():
        raise HTTPException(404, "texture not found")
    return FileResponse(tex_path, media_type="image/png")


@app.websocket("/ws/wall")
async def ws_wall(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # The wall doesn't need to send anything, but we keep reading
            # so we notice a closed connection promptly.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# Serve scanner.js / wall.js / style.css etc.
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def root():
    return JSONResponse(
        {
            "project": "Fish Wall",
            "scanner": "/scanner",
            "wall": "/wall",
        }
    )
