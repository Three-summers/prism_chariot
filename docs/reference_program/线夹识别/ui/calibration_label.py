"""Interactive QLabel for manual clip calibration via mouse drag."""

import cv2
import numpy as np
import json
import os
import glob

from PyQt5.QtWidgets import QLabel
from PyQt5.QtCore import Qt, pyqtSignal
from PyQt5.QtGui import QPixmap, QImage, QPainter, QPen, QColor, QFont


# ── Colors ──
CALIB_BOX_COLOR = QColor(0, 255, 255)      # Yellow box
CALIB_SCREW_COLOR = QColor(0, 255, 0)       # Green screw dot
CALIB_SCREW_COLOR_NO = QColor(255, 80, 80)  # Red screw dot (missing)


class CalibrationLabel(QLabel):
    """Image label that supports mouse-drag rectangle + click for screw."""

    calibration_changed = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMouseTracking(True)
        self.setCursor(Qt.CrossCursor)

        # Original image (BGR numpy array, 1280x720)
        self.source_image: np.ndarray = None

        # Current display pixmap
        self._base_pixmap: QPixmap = None
        self._display_pixmap: QPixmap = None

        # Scale factor: label_size / image_size
        self._scale_x = 1.0
        self._scale_y = 1.0
        self._offset_x = 0
        self._offset_y = 0

        # Calibration state
        self.calib_data: dict = {}   # per-image calibration
        self.current_filename: str = ""

        # Drawing state
        self._drawing = False
        self._drag_start = None       # label coords
        self._drag_current = None     # label coords
        self._box_done = False        # box finalized for this image
        self._screw_pos = None        # image coords (x, y)
        self._has_screw = True

        # Load existing calibration file
        self._calib_file: str = ""

    # ── Public API ──────────────────────────────────────────────────

    def set_image(self, bgr_image: np.ndarray, filename: str):
        """Set the source image and display it."""
        self.source_image = bgr_image.copy()
        self.current_filename = filename

        h, w = bgr_image.shape[:2]
        bytes_per_line = 3 * w
        qimg = QImage(bgr_image.data.tobytes(), w, h,
                      bytes_per_line, QImage.Format_RGB888)
        rgb = qimg.rgbSwapped()
        self._base_pixmap = QPixmap.fromImage(rgb)

        # Load saved calibration if any
        if filename in self.calib_data:
            self._box_done = True
            self._screw_pos = tuple(self.calib_data[filename].get("screw_pos", None) or (None, None))
            if self._screw_pos == (None, None):
                self._screw_pos = None
            self._has_screw = self.calib_data[filename].get("has_screw", True)
        else:
            self._box_done = False
            self._screw_pos = None
            self._has_screw = True

        self._redraw()

    def load_calibrations(self, filepath: str):
        """Load calibration JSON file."""
        self._calib_file = filepath
        if os.path.exists(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                self.calib_data = json.load(f)
        else:
            self.calib_data = {}
        # Reload current image with loaded calibration
        if self.source_image is not None and self.current_filename:
            self.set_image(self.source_image, self.current_filename)

    def save_calibrations(self, filepath: str = None):
        """Save calibration data to JSON file."""
        if filepath:
            self._calib_file = filepath
        if not self._calib_file:
            return
        self._commit_current()
        with open(self._calib_file, "w", encoding="utf-8") as f:
            json.dump(self.calib_data, f, indent=2, ensure_ascii=False)

    def toggle_screw(self):
        """Toggle has_screw flag."""
        self._has_screw = not self._has_screw
        self._commit_current()
        self._redraw()
        self.calibration_changed.emit()

    def clear_current(self):
        """Remove calibration for current image."""
        self._drawing = False
        self._drag_start = None
        self._drag_current = None
        self._box_done = False
        self._screw_pos = None
        self._has_screw = True
        if self.current_filename in self.calib_data:
            del self.calib_data[self.current_filename]
        self._redraw()
        self.calibration_changed.emit()

    def has_calibration(self) -> bool:
        return self._box_done

    def calibrated_count(self) -> int:
        return len(self.calib_data)

    def get_calibration_summary(self) -> list:
        """Return list of (filename, box, screw, has_screw) for analysis."""
        return list(self.calib_data.items())

    # ── Internal ────────────────────────────────────────────────────

    def _commit_current(self):
        """Save current drawing state to calib_data."""
        if not self._box_done or not self.current_filename:
            return
        # Box corners in image coords are stored during mouseReleaseEvent
        # screw_pos and has_screw are already stored
        entry = self.calib_data.get(self.current_filename, {})
        entry["has_screw"] = self._has_screw
        if self._screw_pos:
            entry["screw_pos"] = list(self._screw_pos)
        self.calib_data[self.current_filename] = entry

    def _redraw(self):
        """Redraw the pixmap with calibration overlay."""
        if self._base_pixmap is None:
            return

        pixmap = self._base_pixmap.copy()
        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.Antialiasing)

        pen_w = max(1, int(pixmap.width() / 640))  # scale line width

        # Draw finalized box
        if self._box_done and self.current_filename in self.calib_data:
            entry = self.calib_data[self.current_filename]
            corners = entry.get("box_corners")
            if corners and len(corners) == 4:
                from PyQt5.QtCore import QPointF
                pen = QPen(CALIB_BOX_COLOR, pen_w)
                painter.setPen(pen)
                pts = [QPointF(p[0], p[1]) for p in corners]
                for i in range(4):
                    painter.drawLine(pts[i], pts[(i + 1) % 4])

                # Center cross
                cx = sum(p[0] for p in corners) / 4
                cy = sum(p[1] for p in corners) / 4
                painter.setPen(QPen(QColor(255, 255, 0), 1))
                painter.drawLine(int(cx) - 8, int(cy), int(cx) + 8, int(cy))
                painter.drawLine(int(cx), int(cy) - 8, int(cx), int(cy) + 8)

        # Draw screw position
        if self._screw_pos:
            sx, sy = self._screw_pos
            color = CALIB_SCREW_COLOR if self._has_screw else CALIB_SCREW_COLOR_NO
            pen = QPen(color, pen_w + 1)
            painter.setPen(pen)
            painter.drawEllipse(int(sx) - 5, int(sy) - 5, 10, 10)
            painter.drawLine(int(sx) - 8, int(sy), int(sx) + 8, int(sy))
            painter.drawLine(int(sx), int(sy) - 8, int(sx), int(sy) + 8)

        # Draw drag-in-progress rectangle
        if self._drawing and self._drag_start and self._drag_current:
            pen = QPen(QColor(255, 255, 0, 180), pen_w)
            pen.setStyle(Qt.DashLine)
            painter.setPen(pen)
            x1, y1 = self._drag_start
            x2, y2 = self._drag_current
            painter.drawRect(min(x1, x2), min(y1, y2), abs(x2 - x1), abs(y2 - y1))

        painter.end()

        self._display_pixmap = pixmap

        # Scale to label size
        scaled = pixmap.scaled(
            self.size(), Qt.KeepAspectRatio, Qt.SmoothTransformation)
        self.setPixmap(scaled)

        # Recalculate scale
        if pixmap.width() > 0:
            self._scale_x = pixmap.width() / scaled.width()
            self._scale_y = pixmap.height() / scaled.height()
        pw = scaled.width()
        ph = scaled.height()
        lw = self.width()
        lh = self.height()
        self._offset_x = (lw - pw) // 2
        self._offset_y = (lh - ph) // 2

    def _label_to_image(self, lx: int, ly: int) -> tuple:
        """Convert label coordinates to image coordinates."""
        # Adjust for label offset (centered pixmap)
        ix = (lx - self._offset_x) * self._scale_x
        iy = (ly - self._offset_y) * self._scale_y
        # Clamp
        if self.source_image is not None:
            h, w = self.source_image.shape[:2]
            ix = max(0, min(w - 1, ix))
            iy = max(0, min(h - 1, iy))
        return int(ix), int(iy)

    # ── Mouse events ────────────────────────────────────────────────

    def mousePressEvent(self, ev):
        if self.source_image is None or self._base_pixmap is None:
            return

        ix, iy = self._label_to_image(ev.x(), ev.y())

        if ev.button() == Qt.LeftButton:
            if self._box_done:
                # Box already exists — this click sets screw position
                self._screw_pos = (ix, iy)
                self._commit_current()
                self._redraw()
                self.calibration_changed.emit()
            else:
                # Start drawing new box
                self._drawing = True
                self._drag_start = (ix, iy)
                self._drag_current = (ix, iy)

        elif ev.button() == Qt.RightButton:
            # Right-click: clear current calibration
            self.clear_current()

    def mouseMoveEvent(self, ev):
        if self._drawing and self.source_image is not None:
            ix, iy = self._label_to_image(ev.x(), ev.y())
            self._drag_current = (ix, iy)
            self._redraw()

    def mouseReleaseEvent(self, ev):
        if ev.button() == Qt.LeftButton and self._drawing:
            ix, iy = self._label_to_image(ev.x(), ev.y())
            self._drag_current = (ix, iy)
            self._drawing = False

            x1, y1 = self._drag_start
            x2, y2 = self._drag_current

            # Require minimum size
            if abs(x2 - x1) < 10 or abs(y2 - y1) < 10:
                # Too small — treat as screw click
                self._screw_pos = (ix, iy)
                self._commit_current()
                self._redraw()
                self.calibration_changed.emit()
                return

            # Store as 4 corners (axis-aligned rectangle)
            corners = [
                [min(x1, x2), min(y1, y2)],
                [max(x1, x2), min(y1, y2)],
                [max(x1, x2), max(y1, y2)],
                [min(x1, x2), max(y1, y2)],
            ]

            self._box_done = True
            entry = self.calib_data.get(self.current_filename, {})
            entry["box_corners"] = corners
            entry["box_center"] = [(corners[0][0] + corners[2][0]) / 2,
                                   (corners[0][1] + corners[2][1]) / 2]
            entry["box_size"] = [abs(x2 - x1), abs(y2 - y1)]
            self.calib_data[self.current_filename] = entry

            self._redraw()
            self.calibration_changed.emit()

    def resizeEvent(self, ev):
        super().resizeEvent(ev)
        self._redraw()
