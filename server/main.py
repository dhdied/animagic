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
import random
import uuid
from pathlib import Path
from typing import List

from fastapi import FastAPI, UploadFile, File, Form, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .scanner import photo_to_fish_sprite, NoFrameFoundError

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
ASSETS_DIR = BASE_DIR / "assets"

app = FastAPI(title="Fish Wall")

# Species -> swim behaviour. Kept on the server so scanner and wall always
# agree, and so adding a new species later is a one-line change.
SPECIES = {
    "goldfish": {"label": "Золотая рыбка", "pattern": "sine", "speed": 1.0, "scale": 1.0},
    "tropical": {"label": "Тропическая рыбка", "pattern": "circle", "speed": 1.3, "scale": 0.85},
    "shark": {"label": "Акулёнок", "pattern": "wander", "speed": 0.8, "scale": 1.4},
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


@app.get("/scanner")
async def scanner_page():
    return FileResponse(STATIC_DIR / "scanner.html")


@app.get("/wall")
async def wall_page():
    return FileResponse(STATIC_DIR / "wall.html")


@app.get("/api/species")
async def list_species():
    return {key: {"label": v["label"]} for key, v in SPECIES.items()}


@app.get("/assets/{filename}")
async def assets(filename: str):
    path = ASSETS_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Not found")
    return FileResponse(path)


@app.post("/api/scan")
async def scan(photo: UploadFile = File(...), species: str = Form("goldfish")):
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

    await manager.broadcast_json(
        {
            "type": "new_fish",
            "id": fish_id,
            "species": species,
            "label": meta["label"],
            "pattern": meta["pattern"],
            "speed": meta["speed"] * random.uniform(0.85, 1.15),
            "scale": meta["scale"] * random.uniform(0.9, 1.1),
            "image": "data:image/png;base64," + base64.b64encode(sprite_png).decode("ascii"),
        }
    )

    return JSONResponse({"ok": True, "id": fish_id, "walls_notified": len(manager.active)})


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
