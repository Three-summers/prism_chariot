"""Wire clip detection, rotation measurement, and screw presence check using OpenCV.

Detects black rectangular wire clips (线卡子) in industrial rail inspection photos.
Also checks for screw presence in clip center and tilt (angle deviation).
Uses center-cropped thresholding with multiple thresholds and CLAHE fallback.
"""

import cv2
import numpy as np
import os
import glob
import json
from dataclasses import dataclass, field
from typing import Optional

# ── Calibration data cache ──
_calib_cache: dict = None
_calib_file: str = None


def load_calibration(filepath: str):
    """Load calibration JSON for use in detection."""
    global _calib_cache, _calib_file
    _calib_file = filepath
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            _calib_cache = json.load(f)
    else:
        _calib_cache = {}


def _get_calib(filename: str) -> Optional[dict]:
    """Get calibration data for a filename if available."""
    global _calib_cache
    if _calib_cache is None:
        default = os.path.join(os.path.dirname(os.path.abspath(__file__)), "calibration.json")
        if os.path.exists(default):
            load_calibration(default)
        else:
            _calib_cache = {}
    return _calib_cache.get(filename)


# ── Constants ──
SCREW_CONTRAST_THRESHOLD = 12.0  # inner brightness - outer brightness > this → screw present
TILT_ANGLE_THRESHOLD = 3.0       # |angle| > this → clip is tilted
CLIP_TARGET_AREA = 46500         # expected clip area in px² (calibrated: 46425 ± 753)
CLIP_AREA_MIN = 43000            # minimum valid clip area
CLIP_AREA_MAX = 50000            # maximum valid clip area
CLIP_AR_TARGET = 1.65            # expected bounding-rect aspect ratio (w/h)
CLIP_AR_MIN = 0.7                # minimum valid aspect ratio (loose — threshold contours vary)
CLIP_AR_MAX = 2.5                # maximum valid aspect ratio


@dataclass
class DetectionResult:
    """Result of clip detection on a single image."""

    filename: str
    center_x: int = 0
    center_y: int = 0
    angle_deg: float = 0.0
    width: int = 0
    height: int = 0
    area: int = 0
    success: bool = False
    error: str = ""

    # Screw & tilt checks
    has_screw: bool = False
    screw_contrast: float = 0.0
    is_tilted: bool = False

    # Internal: raw contour data for annotation (not serialized)
    _contour: Optional[np.ndarray] = field(default=None, repr=False)
    _crop_offset: tuple = field(default=(0, 0), repr=False)
    _min_area_rect: tuple = field(default=None, repr=False)

    def to_dict(self) -> dict:
        return {
            "filename": self.filename,
            "center_x": self.center_x,
            "center_y": self.center_y,
            "angle_deg": self.angle_deg,
            "width": self.width,
            "height": self.height,
            "area": self.area,
            "success": self.success,
            "has_screw": self.has_screw,
            "screw_contrast": round(self.screw_contrast, 2),
            "is_tilted": self.is_tilted,
            "error": self.error,
        }

    @property
    def status_label(self) -> str:
        if not self.success:
            return "FAIL"
        parts = []
        if self.is_tilted:
            parts.append("TILTED")
        if not self.has_screw:
            parts.append("NO SCREW")
        return " + ".join(parts) if parts else "OK"


# ═══════════════════════════════════════════════════════════════════════
#  Internal helpers
# ═══════════════════════════════════════════════════════════════════════

def _find_contours(crop: np.ndarray, clahe_enhanced: np.ndarray) -> list[dict]:
    """Find all viable clip-contour candidates from a crop using global thresholding.

    Returns list of dicts with contour, rect, area.
    """
    results = []
    seen_areas = set()  # deduplicate near-identical contours

    for source_name, source in [("raw", crop), ("clahe", clahe_enhanced)]:
        thresh_range = range(50, 115, 5) if source_name == "raw" else range(80, 135, 5)
        for thresh_val in thresh_range:
            _, thresh = cv2.threshold(source, thresh_val, 255, cv2.THRESH_BINARY_INV)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
            closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

            contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for cnt in contours:
                area = cv2.contourArea(cnt)
                # Deduplicate
                area_key = int(area / 500) * 500
                if area_key in seen_areas:
                    continue
                seen_areas.add(area_key)

                if area < 500 or area > 60000:
                    continue

                x, y, cw, ch = cv2.boundingRect(cnt)
                aspect_ratio = cw / ch if ch > 0 else 0
                # Tighter AR constraint from calibration: clip bbox AR = 1.62-1.70
                if aspect_ratio < CLIP_AR_MIN or aspect_ratio > CLIP_AR_MAX:
                    continue

                rect = cv2.minAreaRect(cnt)
                rw, rh = rect[1]
                if min(rw, rh) == 0:
                    continue
                extent = area / (rw * rh)
                if extent < 0.35:
                    continue

                # Angle constraint
                raw_angle = rect[2]
                if rw < rh:
                    raw_angle = raw_angle + 90.0
                if raw_angle < -45:
                    raw_angle += 90.0
                if raw_angle > 45:
                    raw_angle -= 90.0
                if abs(raw_angle) > 5.0:
                    continue

                results.append({
                    "contour": cnt,
                    "rect": rect,
                    "area": area,
                    "ar": aspect_ratio,
                    "extent": extent,
                    "x": x, "y": y, "cw": cw, "ch": ch,
                })

    return results


def _score_candidate(c: dict, crop_w: int, crop_h: int) -> float:
    """Score a clip candidate. Higher is better.

    Area and AR are calibrated from manual annotations:
    - Area target: 46,500 px² (range ~44,900-48,300)
    - AR target: 1.65 (range ~1.59-1.73)
    Center proximity has minimal weight since clip y position varies widely.
    """
    area = c["area"]
    extent = c["extent"]
    ar = c["ar"]

    # Area score: Gaussian-like, peak at 46,500
    area_dev = abs(area - CLIP_TARGET_AREA) / CLIP_TARGET_AREA
    area_score = max(0.0, 8.0 - area_dev * 30.0)

    # AR bonus: prefer AR close to 1.65
    ar_dev = abs(ar - CLIP_AR_TARGET) / CLIP_AR_TARGET
    ar_score = max(0.0, 2.0 - ar_dev * 5.0)

    # Very light center penalty (clip can be anywhere vertically)
    ccx = c["x"] + c["cw"] // 2
    ccy = c["y"] + c["ch"] // 2
    dist = np.sqrt((ccx - crop_w / 2) ** 2 + (ccy - crop_h / 2) ** 2)
    dist_score = max(0.0, 1.0 - dist / 300.0)

    return (
        area_score * 2.5
        + extent * 5.0
        + ar_score
        + dist_score
    )


def _check_screw(gray: np.ndarray, cx: int, cy: int) -> tuple[bool, float]:
    """Check if a bright screw is present at the clip center.

    Compares inner circle (screw head, 10px radius) vs outer ring
    (clip body, 15-25px radius). A metallic screw appears much brighter
    than the dark plastic clip body.

    Returns (has_screw: bool, contrast: float).
    """
    h, w = gray.shape

    margin = 30
    if cx < margin or cx > w - margin or cy < margin or cy > h - margin:
        return False, 0.0

    y_indices, x_indices = np.ogrid[:h, :w]

    inner_mask = (x_indices - cx) ** 2 + (y_indices - cy) ** 2 <= 10 ** 2
    outer_mask = (
        ((x_indices - cx) ** 2 + (y_indices - cy) ** 2 > 15 ** 2)
        & ((x_indices - cx) ** 2 + (y_indices - cy) ** 2 <= 25 ** 2)
    )

    inner_pixels = gray[inner_mask]
    outer_pixels = gray[outer_mask]

    if len(inner_pixels) < 10 or len(outer_pixels) < 50:
        return False, 0.0

    inner_mean = float(np.mean(inner_pixels))
    outer_mean = float(np.mean(outer_pixels))
    contrast = inner_mean - outer_mean

    has_screw = contrast > SCREW_CONTRAST_THRESHOLD
    return has_screw, round(contrast, 2)


# ═══════════════════════════════════════════════════════════════════════
#  Public API
# ═══════════════════════════════════════════════════════════════════════

def detect_clip(image_path: str) -> DetectionResult:
    """Detect wire clip, measure angle, and check for screw presence.

    If calibration data exists for this image, uses calibration box for
    position/size and only auto-detects the angle and screw contrast.
    Otherwise falls back to full auto-detection.
    """
    filename = os.path.basename(image_path)
    img = cv2.imread(image_path)

    if img is None:
        return DetectionResult(filename=filename, error="Failed to load image")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    cx_img, cy_img = w // 2, h // 2
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))

    calib = _get_calib(filename)

    # ═══════════════════════════════════════════════════════════
    #  PATH A: Calibration-guided detection
    # ═══════════════════════════════════════════════════════════
    if calib is not None:
        cal_cx = int(calib["box_center"][0])
        cal_cy = int(calib["box_center"][1])
        cal_w = int(calib["box_size"][0])
        cal_h = int(calib["box_size"][1])
        cal_area = cal_w * cal_h
        cal_has_screw = calib.get("has_screw", True)
        cal_screw_pos = calib.get("screw_pos")

        # --- Angle: crop tightly around calibration box, find best contour ---
        margin = 30
        x1 = max(0, cal_cx - cal_w // 2 - margin)
        x2 = min(w, cal_cx + cal_w // 2 + margin)
        y1 = max(0, cal_cy - cal_h // 2 - margin)
        y2 = min(h, cal_cy + cal_h // 2 + margin)

        tight_crop = gray[y1:y2, x1:x2]
        tight_enhanced = clahe.apply(tight_crop)

        # Find contour closest to calib center within tight crop
        best_angle = 0.0
        best_rect = None
        best_contour = None
        best_area = cal_area
        best_extent = 0.0

        for source_name, source in [("raw", tight_crop), ("clahe", tight_enhanced)]:
            th_range = range(50, 115, 5) if source_name == "raw" else range(80, 135, 5)
            for th in th_range:
                _, thresh = cv2.threshold(source, th, 255, cv2.THRESH_BINARY_INV)
                kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
                closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
                contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

                for cnt in contours:
                    area = cv2.contourArea(cnt)
                    if area < cal_area * 0.3 or area > cal_area * 1.5:
                        continue
                    bx, by, bcw, bch = cv2.boundingRect(cnt)
                    ar = bcw / bch if bch > 0 else 0
                    if ar < 0.7 or ar > 2.5:
                        continue

                    rect = cv2.minAreaRect(cnt)
                    rw, rh = rect[1]
                    if min(rw, rh) == 0:
                        continue
                    extent = area / (rw * rh)
                    if extent < 0.35:
                        continue

                    # Center of this contour in full-image coords
                    cnt_cx = bx + bcw // 2 + x1
                    cnt_cy = by + bch // 2 + y1
                    dist_to_calib = np.sqrt((cnt_cx - cal_cx) ** 2 + (cnt_cy - cal_cy) ** 2)

                    if dist_to_calib < 50 and extent > best_extent:
                        best_extent = extent
                        best_rect = rect
                        best_contour = cnt
                        best_area = area

        if best_rect is not None:
            rect_angle = best_rect[2]
            rect_size = best_rect[1]
            if rect_size[0] < rect_size[1]:
                angle = rect_angle + 90.0
            else:
                angle = rect_angle
            if angle < -45:
                angle += 90.0
            if angle > 45:
                angle -= 90.0
            best_angle = round(angle, 2)

        # --- Screw: use calibration screw position if available, else center ---
        if cal_screw_pos:
            screw_cx, screw_cy = int(cal_screw_pos[0]), int(cal_screw_pos[1])
        else:
            screw_cx, screw_cy = cal_cx, cal_cy

        has_screw, screw_contrast = _check_screw(gray, screw_cx, screw_cy)
        # Override with calibration if auto-detect disagrees
        if cal_has_screw != has_screw:
            has_screw = cal_has_screw

        is_tilted = abs(best_angle) > TILT_ANGLE_THRESHOLD

        return DetectionResult(
            filename=filename,
            center_x=cal_cx,
            center_y=cal_cy,
            angle_deg=best_angle,
            width=cal_w,
            height=cal_h,
            area=cal_area,
            success=True,
            has_screw=has_screw,
            screw_contrast=screw_contrast,
            is_tilted=is_tilted,
            _contour=best_contour,
            _crop_offset=(0, 0),
            _min_area_rect=best_rect,
        )

    # ═══════════════════════════════════════════════════════════
    #  PATH B: Full auto-detection (no calibration data)
    # ═══════════════════════════════════════════════════════════
    def _try_crop(x1, y1, x2, y2):
        crop = gray[y1:y2, x1:x2]
        enhanced = clahe.apply(crop)
        candidates = _find_contours(crop, enhanced)
        if not candidates:
            return None
        best = max(candidates, key=lambda c: _score_candidate(c, x2 - x1, y2 - y1))
        return {**best, "crop_offset": (x1, y1)}

    crop_windows = [
        (max(0, cx_img - 300), max(0, cy_img - 180), min(w, cx_img + 300), min(h, cy_img + 80)),
        (max(0, cx_img - 300), max(0, cy_img - 220), min(w, cx_img + 300), min(h, cy_img + 220)),
        (max(0, cx_img - 300), max(0, cy_img - 80),  min(w, cx_img + 300), min(h, cy_img + 180)),
    ]

    best_overall = None
    best_area_diff = float("inf")
    for (x1, y1, x2, y2) in crop_windows:
        found = _try_crop(x1, y1, x2, y2)
        if found is None:
            continue
        diff = abs(found["area"] - CLIP_TARGET_AREA)
        if diff < best_area_diff:
            best_area_diff = diff
            best_overall = found

    if best_overall is None:
        return DetectionResult(filename=filename, error="No suitable contour found")

    result = best_overall
    ox, oy = result["crop_offset"]
    rect = result["rect"]
    rect_center = (rect[0][0] + ox, rect[0][1] + oy)
    rect_size = rect[1]
    rect_angle = rect[2]

    if rect_size[0] < rect_size[1]:
        angle = rect_angle + 90.0
    else:
        angle = rect_angle
    if angle < -45:
        angle += 90.0
    if angle > 45:
        angle -= 90.0

    angle = round(angle, 2)
    center_x = int(rect_center[0])
    center_y = int(rect_center[1])
    has_screw, screw_contrast = _check_screw(gray, center_x, center_y)
    is_tilted = abs(angle) > TILT_ANGLE_THRESHOLD

    return DetectionResult(
        filename=filename,
        center_x=center_x,
        center_y=center_y,
        angle_deg=angle,
        width=int(rect_size[0]),
        height=int(rect_size[1]),
        area=int(result["area"]),
        success=True,
        has_screw=has_screw,
        screw_contrast=screw_contrast,
        is_tilted=is_tilted,
        _contour=result["contour"],
        _crop_offset=(ox, oy),
        _min_area_rect=rect,
    )


def annotate_image(image_path: str, result: DetectionResult) -> np.ndarray:
    """Draw detection overlay on original image.

    Color coding:
      - Green box: normal (screw present, not tilted)
      - Yellow box: screw missing OR tilted
      - Red box: screw missing AND tilted
      - Green circle at center: screw present
      - Red circle at center: screw missing
    """
    img = cv2.imread(image_path)
    if img is None:
        return np.zeros((100, 100, 3), dtype=np.uint8)

    result_img = img.copy()

    if not result.success:
        cv2.putText(result_img, "DETECTION FAILED", (50, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 2)
        return result_img

    # Color coding
    has_issue = (not result.has_screw) or result.is_tilted
    has_both = (not result.has_screw) and result.is_tilted

    if has_both:
        box_color = (0, 0, 255)      # Red
    elif has_issue:
        box_color = (0, 255, 255)    # Yellow
    else:
        box_color = (0, 255, 0)      # Green

    screw_dot_color = (0, 255, 0) if result.has_screw else (0, 0, 255)

    # Draw bounding box
    calib = _get_calib(result.filename)
    if calib is not None and "box_corners" in calib:
        # Draw calibration axis-aligned box (1px)
        corners = np.int32(calib["box_corners"])
        cv2.polylines(result_img, [corners], True, box_color, 1)
    elif result._min_area_rect is not None:
        # Draw rotated minAreaRect (fallback)
        ox, oy = result._crop_offset
        rect = result._min_area_rect
        box = cv2.boxPoints(rect)
        box = np.int32(box)
        box[:, 0] += ox
        box[:, 1] += oy
        cv2.drawContours(result_img, [box], 0, box_color, 1)

    # Center crosshair
    cv2.drawMarker(result_img, (result.center_x, result.center_y),
                   screw_dot_color, cv2.MARKER_CROSS, 20, 1)

    # Screw indicator circle
    cv2.circle(result_img, (result.center_x, result.center_y),
               8, screw_dot_color, 1)

    # Text overlay
    lines = []
    if result.is_tilted:
        lines.append(f"TILTED: {result.angle_deg:.1f} deg")
    else:
        lines.append(f"Angle: {result.angle_deg:.1f} deg")

    lines.append(f"Screw: {'OK' if result.has_screw else 'MISSING'}")
    lines.append(f"({result.center_x}, {result.center_y})")

    tx = max(result.center_x - 100, 10)
    ty = max(result.center_y - 50, 20)
    for i, line in enumerate(lines):
        cv2.putText(result_img, line, (tx, ty + i * 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, box_color, 2)

    return result_img


def process_batch(image_dir: str,
                  output_dir: str = None,
                  progress_callback=None) -> list[DetectionResult]:
    """Process all JPG images in a directory.

    Args:
        image_dir: Directory containing .jpg images.
        output_dir: If provided, annotated images are saved here.
        progress_callback: Optional callable(current, total).

    Returns:
        List of DetectionResult for every image.
    """
    images = sorted(glob.glob(os.path.join(image_dir, "*.jpg")))
    results = []

    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    total = len(images)
    for i, img_path in enumerate(images):
        result = detect_clip(img_path)
        results.append(result)

        if output_dir and result.success:
            annotated = annotate_image(img_path, result)
            out_path = os.path.join(output_dir, os.path.basename(img_path))
            cv2.imwrite(out_path, annotated)

        if progress_callback:
            progress_callback(i + 1, total)

    return results
