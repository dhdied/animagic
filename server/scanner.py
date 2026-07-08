"""
scanner.py
----------
Computer-vision pipeline for the "Scanner" node.

Input:  a photo of a sheet of A4 paper. The paper has a bold black
        rectangular frame printed on it (see assets/stencil_a4.svg) and
        the fish is drawn inside that frame.
Output: a small PNG, cropped tightly around the drawing, with a
        transparent background (alpha channel), ready to be dropped
        onto the underwater wall as a sprite.

Algorithm
1. Find the big black rectangle (the printed frame) in the photo.
2. Perspective-warp it so the frame becomes a flat, front-on rectangle
   (this is what makes the system tolerant of the phone being held at
   an angle, or the paper not being perfectly flat).
3. Inside the warped rectangle, separate "ink" (the child's drawing)
   from "paper" (white background) using adaptive thresholding, and
   turn the paper into transparent pixels.
4. Crop to the bounding box of the remaining ink so the sprite hugs
   the drawing instead of carrying a big empty square around.
"""

from __future__ import annotations

import cv2
import numpy as np


# The frame is printed with a fixed aspect ratio (see assets/stencil_a4.svg).
# We warp every detected frame to this pixel size regardless of the input
# photo's resolution or angle, so downstream code always works with a
# known canvas size.
WARPED_SIZE = (900, 650)  # width, height


class NoFrameFoundError(Exception):
    """Raised when no printed frame could be located in the photo."""


def _order_points(pts: np.ndarray) -> np.ndarray:
    """Order 4 points as top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def _find_frame_quad(bgr: np.ndarray) -> np.ndarray:
    """Locate the largest quadrilateral contour in the image.

    That quadrilateral is assumed to be the printed frame. Raises
    NoFrameFoundError if nothing plausible is found.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 40, 120)
    edges = cv2.dilate(edges, np.ones((5, 5), np.uint8), iterations=2)
    edges = cv2.erode(edges, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise NoFrameFoundError("No contours detected in photo.")

    img_area = bgr.shape[0] * bgr.shape[1]
    best = None
    best_area = 0.0

    for c in contours:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) != 4:
            continue
        area = cv2.contourArea(approx)
        # The frame should be a large, clearly visible chunk of the photo,
        # but not literally the whole image (that's usually the photo
        # border itself when detection goes wrong).
        if area < 0.15 * img_area or area > 0.97 * img_area:
            continue
        if not cv2.isContourConvex(approx):
            continue
        if area > best_area:
            best_area = area
            best = approx

    if best is None:
        raise NoFrameFoundError("Could not find a rectangular frame in photo.")

    return best.reshape(4, 2).astype("float32")


def _warp_to_frame(bgr: np.ndarray, quad: np.ndarray) -> np.ndarray:
    rect = _order_points(quad)
    w, h = WARPED_SIZE
    dst = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype="float32")
    matrix = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(bgr, matrix, (w, h))


def _cut_out_drawing(warped_bgr: np.ndarray, inset_ratio: float = 0.06) -> np.ndarray:
    """Turn the white paper into transparent pixels and crop to the ink.

    Returns an RGBA image.
    """
    h, w = warped_bgr.shape[:2]

    # Ignore a thin border so the printed frame line itself doesn't get
    # treated as part of the drawing.
    inset_x, inset_y = int(w * inset_ratio), int(h * inset_ratio)
    interior = warped_bgr[inset_y : h - inset_y, inset_x : w - inset_x]

    gray = cv2.cvtColor(interior, cv2.COLOR_BGR2GRAY)
    # Adaptive threshold copes with uneven lighting across the sheet of
    # paper far better than a single global threshold would.
    mask = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 8
    )
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))

    # Also keep any saturated colour (a coloured-in patch on otherwise
    # white paper) even where it isn't dark enough to trip the ink mask.
    hsv = cv2.cvtColor(interior, cv2.COLOR_BGR2HSV)
    colour_mask = cv2.inRange(hsv, (0, 60, 60), (180, 255, 255))
    combined = cv2.bitwise_or(mask, colour_mask)
    combined = cv2.dilate(combined, np.ones((3, 3), np.uint8), iterations=1)

    ys, xs = np.where(combined > 0)
    if len(xs) == 0 or len(ys) == 0:
        raise NoFrameFoundError("Frame found, but no drawing detected inside it.")

    pad = 10
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, interior.shape[1])
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, interior.shape[0])

    cropped_bgr = interior[y0:y1, x0:x1]
    cropped_mask = combined[y0:y1, x0:x1]

    b, g, r = cv2.split(cropped_bgr)
    rgba = cv2.merge([r, g, b, cropped_mask])
    return rgba


def photo_to_fish_sprite(image_bytes: bytes) -> bytes:
    """Full pipeline: raw photo bytes in, transparent-PNG sprite bytes out."""
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise NoFrameFoundError("Uploaded file is not a readable image.")

    # Downscale very large photos before edge-detection; it's faster and
    # the frame is still easy to find at a modest resolution.
    max_dim = 1600
    h, w = bgr.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        bgr = cv2.resize(bgr, (int(w * scale), int(h * scale)))

    quad = _find_frame_quad(bgr)
    warped = _warp_to_frame(bgr, quad)
    rgba = _cut_out_drawing(warped)

    ok, png = cv2.imencode(".png", cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
    if not ok:
        raise RuntimeError("Failed to encode result as PNG.")
    return png.tobytes()
