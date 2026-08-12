"""PyQt5 main window with dark industrial theme for wire clip detection."""

import os
import csv
import glob
import numpy as np

from PyQt5.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QTableWidget, QTableWidgetItem,
    QProgressBar, QStatusBar, QFileDialog, QHeaderView,
    QSplitter, QFrame, QAbstractItemView, QMessageBox,
)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QPixmap, QImage, QColor

from detector import detect_clip, annotate_image, DetectionResult, load_calibration
from ui.calibration_label import CalibrationLabel

# ── Color palette ──
COLOR_BG = "#1a1a2e"
COLOR_PANEL = "#16213e"
COLOR_ACCENT = "#0f3460"
COLOR_ACCENT_HOVER = "#1a4a80"
COLOR_TEXT = "#e0e0e0"
COLOR_TEXT_DIM = "#8899aa"
COLOR_GREEN = "#00ff88"
COLOR_RED = "#e94560"
COLOR_YELLOW = "#ffaa00"

STYLE_SHEET = f"""
QMainWindow {{
    background-color: {COLOR_BG};
}}
QWidget {{
    background-color: {COLOR_BG};
    color: {COLOR_TEXT};
    font-family: "Consolas", "Courier New", monospace;
    font-size: 13px;
}}
QFrame#panel {{
    background-color: {COLOR_PANEL};
    border: 1px solid {COLOR_ACCENT};
    border-radius: 4px;
    padding: 8px;
}}
QGroupBox {{
    background-color: {COLOR_PANEL};
    border: 1px solid {COLOR_ACCENT};
    border-radius: 6px;
    margin-top: 12px;
    padding-top: 16px;
    font-weight: bold;
    color: {COLOR_TEXT};
}}
QGroupBox::title {{
    subcontrol-origin: margin;
    left: 12px;
    padding: 2px 8px;
    background-color: {COLOR_ACCENT};
    border-radius: 3px;
    color: {COLOR_TEXT};
}}
QPushButton {{
    background-color: {COLOR_ACCENT};
    color: {COLOR_TEXT};
    border: 1px solid {COLOR_ACCENT_HOVER};
    border-radius: 4px;
    padding: 8px 16px;
    font-weight: bold;
    min-height: 20px;
}}
QPushButton:hover {{ background-color: {COLOR_ACCENT_HOVER}; }}
QPushButton:pressed {{ background-color: {COLOR_ACCENT}; }}
QPushButton:disabled {{
    background-color: #2a2a3e;
    color: #666677;
    border-color: #2a2a3e;
}}
QPushButton#btn_calib_active {{
    background-color: {COLOR_YELLOW};
    color: #000;
    border: 2px solid {COLOR_RED};
}}
QPushButton#btn_screw_yes {{
    background-color: #005530;
    color: {COLOR_GREEN};
}}
QPushButton#btn_screw_no {{
    background-color: #550000;
    color: {COLOR_RED};
}}
QTableWidget {{
    background-color: {COLOR_BG};
    alternate-background-color: {COLOR_PANEL};
    border: 1px solid {COLOR_ACCENT};
    gridline-color: {COLOR_ACCENT};
    selection-background-color: {COLOR_ACCENT_HOVER};
    selection-color: {COLOR_TEXT};
}}
QTableWidget::item {{ padding: 4px 8px; }}
QHeaderView::section {{
    background-color: {COLOR_ACCENT};
    color: {COLOR_TEXT};
    padding: 6px 8px;
    border: 1px solid {COLOR_ACCENT_HOVER};
    font-weight: bold;
}}
QProgressBar {{
    background-color: {COLOR_BG};
    border: 1px solid {COLOR_ACCENT};
    border-radius: 3px;
    text-align: center;
    color: {COLOR_TEXT};
    font-weight: bold;
}}
QProgressBar::chunk {{
    background-color: {COLOR_GREEN};
    border-radius: 2px;
}}
QStatusBar {{
    background-color: {COLOR_PANEL};
    color: {COLOR_TEXT_DIM};
    border-top: 1px solid {COLOR_ACCENT};
}}
QLabel#title {{
    font-size: 18px;
    font-weight: bold;
    color: {COLOR_TEXT};
    padding: 4px;
}}
QSplitter::handle {{
    background-color: {COLOR_ACCENT};
    width: 2px;
}}
"""


class DetectionWorker(QThread):
    """Background worker for batch processing."""
    progress = pyqtSignal(int, int)
    image_processed = pyqtSignal(int, DetectionResult, np.ndarray)
    finished = pyqtSignal(list)
    error = pyqtSignal(str)

    def __init__(self, image_dir: str, output_dir: str):
        super().__init__()
        self.image_dir = image_dir
        self.output_dir = output_dir

    def run(self):
        try:
            import cv2
            images = sorted(glob.glob(os.path.join(self.image_dir, "*.jpg")))
            results = []
            total = len(images)
            os.makedirs(self.output_dir, exist_ok=True)

            for i, img_path in enumerate(images):
                result = detect_clip(img_path)
                if result.success:
                    annotated = annotate_image(img_path, result)
                    out_path = os.path.join(self.output_dir, os.path.basename(img_path))
                    cv2.imwrite(out_path, annotated)
                else:
                    annotated = np.zeros((100, 100, 3), dtype=np.uint8)
                results.append(result)
                self.progress.emit(i + 1, total)
                self.image_processed.emit(i, result, annotated)
            self.finished.emit(results)
        except Exception as e:
            self.error.emit(str(e))


class MainWindow(QMainWindow):
    """Wire Clip Detection System main window."""

    def __init__(self):
        super().__init__()
        self.setWindowTitle("线卡子检测系统  /  Wire Clip Detection System")
        self.setMinimumSize(1200, 750)
        self.resize(1400, 850)

        base = os.path.dirname(os.path.abspath(__file__))
        self.image_dir = os.path.join(base, "..", "image")
        self.output_dir = os.path.join(base, "..", "output")
        self.calib_file = os.path.join(base, "..", "calibration.json")

        # Auto-load calibration for detection
        load_calibration(self.calib_file)

        self.results: list[DetectionResult] = []
        self.annotated_images: dict = {}
        self.raw_images: dict = {}          # filename → BGR image
        self.image_filenames: list = []
        self.current_image_idx = -1
        self.calibration_mode = False

        self._setup_ui()
        self.setStyleSheet(STYLE_SHEET)

    # ── UI Setup ──────────────────────────────────────────────────────

    def _setup_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        root = QVBoxLayout(central)
        root.setContentsMargins(12, 12, 12, 12)
        root.setSpacing(8)

        # Title
        title = QLabel("线卡子检测系统  /  Wire Clip Detection System")
        title.setObjectName("title")
        title.setAlignment(Qt.AlignCenter)
        root.addWidget(title)

        splitter = QSplitter(Qt.Horizontal)

        # ── Left panel ──
        left = QWidget()
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(0, 0, 4, 0)
        left_layout.setSpacing(6)

        # ── Row 1: Detection toolbar ──
        tb1 = QHBoxLayout()
        self.btn_open = QPushButton("  Open Folder")
        self.btn_detect = QPushButton("  Start Detection")
        self.btn_export = QPushButton("  Export CSV")
        self.btn_export.setEnabled(False)
        tb1.addWidget(self.btn_open)
        tb1.addWidget(self.btn_detect)
        tb1.addWidget(self.btn_export)
        tb1.addStretch()
        left_layout.addLayout(tb1)

        # ── Row 2: Calibration toolbar ──
        tb2 = QHBoxLayout()
        self.btn_calib = QPushButton("  Calibrate Mode")
        self.btn_calib.setCheckable(True)
        self.btn_calib.setStyleSheet(
            f"QPushButton {{ background-color: {COLOR_ACCENT}; }} "
            f"QPushButton:checked {{ background-color: {COLOR_YELLOW}; color: #000; border: 2px solid {COLOR_RED}; }}")
        self.btn_screw_toggle = QPushButton("  Screw: YES / NO")
        self.btn_screw_toggle.setEnabled(False)
        self.btn_calib_clear = QPushButton("  Clear")
        self.btn_calib_clear.setEnabled(False)
        self.btn_save_calib = QPushButton("  Save Calib")
        self.btn_save_calib.setEnabled(False)
        self.lbl_calib_count = QLabel("Calibrated: 0")
        self.lbl_calib_count.setStyleSheet(f"color: {COLOR_TEXT_DIM};")

        tb2.addWidget(self.btn_calib)
        tb2.addWidget(self.btn_screw_toggle)
        tb2.addWidget(self.btn_calib_clear)
        tb2.addWidget(self.btn_save_calib)
        tb2.addWidget(self.lbl_calib_count)
        tb2.addStretch()
        left_layout.addLayout(tb2)

        # ── Image preview (calibration label) ──
        self.image_label = CalibrationLabel()
        self.image_label.setObjectName("imageLabel")
        self.image_label.setAlignment(Qt.AlignCenter)
        self.image_label.setMinimumSize(640, 360)
        left_layout.addWidget(self.image_label, stretch=1)

        # ── Navigation ──
        nav = QHBoxLayout()
        self.btn_prev = QPushButton("  < Prev")
        self.btn_next = QPushButton("  Next >")
        self.lbl_counter = QLabel("0 / 0")
        self.lbl_counter.setAlignment(Qt.AlignCenter)
        self.lbl_counter.setStyleSheet(f"color: {COLOR_TEXT_DIM}; font-size: 14px;")
        self.btn_prev.setEnabled(False)
        self.btn_next.setEnabled(False)
        nav.addStretch()
        nav.addWidget(self.btn_prev)
        nav.addWidget(self.lbl_counter)
        nav.addWidget(self.btn_next)
        nav.addStretch()
        left_layout.addLayout(nav)

        # ── Right panel ──
        right = QFrame()
        right.setObjectName("panel")
        right_layout = QVBoxLayout(right)
        right_layout.setSpacing(8)

        # Progress
        from PyQt5.QtWidgets import QGroupBox
        pg = QGroupBox("Progress")
        pgl = QVBoxLayout(pg)
        self.progress_bar = QProgressBar()
        self.progress_bar.setMaximum(100)
        self.lbl_progress = QLabel("Ready")
        self.lbl_progress.setStyleSheet(f"color: {COLOR_TEXT_DIM};")
        pgl.addWidget(self.progress_bar)
        pgl.addWidget(self.lbl_progress)
        right_layout.addWidget(pg)

        # Table
        tg = QGroupBox("Detection Results")
        tgl = QVBoxLayout(tg)
        self.table = QTableWidget()
        self.table.setColumnCount(10)
        self.table.setHorizontalHeaderLabels([
            "Filename", "Center X", "Center Y",
            "Angle (°)", "Screw", "Tilted",
            "Width", "Height", "Area",
        ])
        self.table.setAlternatingRowColors(True)
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SingleSelection)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        for col in range(1, 10):
            self.table.horizontalHeader().setSectionResizeMode(col, QHeaderView.ResizeToContents)
        self.table.verticalHeader().setVisible(False)
        self.table.itemSelectionChanged.connect(self._on_table_select)
        tgl.addWidget(self.table)
        right_layout.addWidget(tg, stretch=1)

        self.lbl_summary = QLabel("No data")
        self.lbl_summary.setStyleSheet(f"color: {COLOR_TEXT_DIM}; padding: 4px;")
        right_layout.addWidget(self.lbl_summary)

        # Assemble
        splitter.addWidget(left)
        splitter.addWidget(right)
        splitter.setStretchFactor(0, 3)
        splitter.setStretchFactor(1, 2)
        root.addWidget(splitter, stretch=1)

        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        self.status_bar.showMessage("Ready — 先点 Calibrate Mode 进入标定，拖拽画框，点击标螺丝")

        # ── Connections ──
        self.btn_open.clicked.connect(self._on_open)
        self.btn_detect.clicked.connect(self._on_detect)
        self.btn_export.clicked.connect(self._on_export)
        self.btn_prev.clicked.connect(self._on_prev)
        self.btn_next.clicked.connect(self._on_next)
        self.btn_calib.toggled.connect(self._on_calib_toggle)
        self.btn_screw_toggle.clicked.connect(self._on_screw_toggle)
        self.btn_calib_clear.clicked.connect(self._on_calib_clear)
        self.btn_save_calib.clicked.connect(self._on_save_calib)
        self.image_label.calibration_changed.connect(self._on_calib_changed)

    # ── Calibration Mode ─────────────────────────────────────────────

    def _on_calib_toggle(self, checked: bool):
        self.calibration_mode = checked
        if checked:
            self.btn_calib.setText("  [CALIBRATING]")
            self.btn_screw_toggle.setEnabled(True)
            self.btn_calib_clear.setEnabled(True)
            self.btn_save_calib.setEnabled(True)
            self.btn_detect.setEnabled(False)
            self.btn_export.setEnabled(False)

            # Load calibration file
            self.image_label.load_calibrations(self.calib_file)
            self.lbl_calib_count.setText(f"Calibrated: {self.image_label.calibrated_count()}")

            # Load all images for calibration
            if not self.image_filenames:
                self._scan_images()
            if self.image_filenames:
                self.current_image_idx = 0
                self._load_calib_image(0)
                self.btn_prev.setEnabled(True)
                self.btn_next.setEnabled(True)

            self.status_bar.showMessage("CALIBRATION MODE: 拖拽鼠标画框 → 点击标记螺丝中心 → 切换螺丝状态")
        else:
            self.btn_calib.setText("  Calibrate Mode")
            self.btn_screw_toggle.setEnabled(False)
            self.btn_calib_clear.setEnabled(False)
            self.btn_save_calib.setEnabled(False)
            self.btn_detect.setEnabled(True)
            # Save before exiting
            self.image_label.save_calibrations(self.calib_file)
            self.status_bar.showMessage("Calibration saved. Ready.")

    def _on_screw_toggle(self):
        self.image_label.toggle_screw()

    def _on_calib_clear(self):
        self.image_label.clear_current()
        self.lbl_calib_count.setText(f"Calibrated: {self.image_label.calibrated_count()}")

    def _on_save_calib(self):
        self.image_label.save_calibrations(self.calib_file)
        self.status_bar.showMessage(f"Saved to {self.calib_file}  ({self.image_label.calibrated_count()} images)")

    def _on_calib_changed(self):
        self.lbl_calib_count.setText(f"Calibrated: {self.image_label.calibrated_count()}")
        # Update screw button text
        if self.image_label._has_screw:
            self.btn_screw_toggle.setText("  Screw: YES  (click→NO)")
        else:
            self.btn_screw_toggle.setText("  Screw: NO  (click→YES)")

    def _scan_images(self):
        import cv2
        self.image_filenames = sorted(glob.glob(os.path.join(self.image_dir, "*.jpg")))
        self.raw_images = {}
        for fpath in self.image_filenames:
            fname = os.path.basename(fpath)
            img = cv2.imread(fpath)
            if img is not None:
                self.raw_images[fname] = img

    def _load_calib_image(self, idx: int):
        if idx < 0 or idx >= len(self.image_filenames):
            return
        self.current_image_idx = idx
        fname = os.path.basename(self.image_filenames[idx])
        self.lbl_counter.setText(f"{idx + 1} / {len(self.image_filenames)}")

        if fname in self.raw_images:
            self.image_label.set_image(self.raw_images[fname], fname)

        self.status_bar.showMessage(
            f"[{idx + 1}/{len(self.image_filenames)}] {fname}  |  "
            f"Calibrated: {self.image_label.calibrated_count()} images"
        )

    # ── Detection Mode ───────────────────────────────────────────────

    def _on_open(self):
        folder = QFileDialog.getExistingDirectory(self, "Select Image Folder", self.image_dir)
        if folder:
            self.image_dir = folder
            imgs = sorted(glob.glob(os.path.join(folder, "*.jpg")))
            self.lbl_progress.setText(f"Found {len(imgs)} images")
            self.progress_bar.setValue(0)
            self.results = []
            self.annotated_images = {}
            self.table.setRowCount(0)
            self.image_label.setText(f"{len(imgs)} images ready")
            self.lbl_counter.setText(f"0 / {len(imgs)}")
            self.btn_export.setEnabled(False)
            self.status_bar.showMessage(f"Folder: {folder}")

    def _on_detect(self):
        if not os.path.isdir(self.image_dir):
            QMessageBox.warning(self, "Error", "Please select a valid image folder first.")
            return

        # Ensure calibration is loaded
        load_calibration(self.calib_file)

        self.btn_open.setEnabled(False)
        self.btn_detect.setEnabled(False)
        self.btn_export.setEnabled(False)
        self.btn_calib.setEnabled(False)
        self.table.setRowCount(0)
        self.results = []
        self.annotated_images = {}
        self.current_image_idx = -1
        self.progress_bar.setValue(0)
        self.status_bar.showMessage("Detecting...")

        self.worker = DetectionWorker(self.image_dir, self.output_dir)
        self.worker.progress.connect(self._on_progress)
        self.worker.image_processed.connect(self._on_image_done)
        self.worker.finished.connect(self._on_finished)
        self.worker.error.connect(self._on_error)
        self.worker.start()

    def _on_progress(self, current: int, total: int):
        self.progress_bar.setValue(int(current / total * 100))
        self.lbl_progress.setText(f"Processing: {current} / {total}")

    def _on_image_done(self, idx: int, result: DetectionResult, annotated: np.ndarray):
        self.results.append(result)
        self.annotated_images[idx] = annotated

        row = self.table.rowCount()
        self.table.insertRow(row)
        self.table.setItem(row, 0, QTableWidgetItem(result.filename))

        if result.success:
            self._set_cell(row, 1, str(result.center_x), COLOR_TEXT)
            self._set_cell(row, 2, str(result.center_y), COLOR_TEXT)
            ac = COLOR_RED if abs(result.angle_deg) > 5 else (COLOR_YELLOW if result.is_tilted else COLOR_GREEN)
            self._set_cell(row, 3, f"{result.angle_deg:.2f}", ac)
            self._set_cell(row, 4, "OK" if result.has_screw else "MISSING",
                          COLOR_GREEN if result.has_screw else COLOR_RED)
            self._set_cell(row, 5, "YES" if result.is_tilted else "—",
                          COLOR_RED if result.is_tilted else COLOR_TEXT_DIM)
            self._set_cell(row, 6, str(result.width), COLOR_TEXT)
            self._set_cell(row, 7, str(result.height), COLOR_TEXT)
            self._set_cell(row, 8, str(result.area), COLOR_TEXT)
        else:
            for col in range(1, 10):
                self._set_cell(row, col, "—", COLOR_RED)

        self.table.scrollToBottom()
        if self.current_image_idx < 0 and annotated is not None:
            self._show_annotated(0, annotated)

    def _on_finished(self, results: list):
        self.btn_open.setEnabled(True)
        self.btn_detect.setEnabled(True)
        self.btn_export.setEnabled(True)
        self.btn_calib.setEnabled(True)

        ok = sum(1 for r in results if r.success)
        sm = sum(1 for r in results if r.success and not r.has_screw)
        st = sum(1 for r in results if r.success and r.has_screw)
        tilted = sum(1 for r in results if r.success and r.is_tilted)

        if ok > 0:
            angles = [r.angle_deg for r in results if r.success]
            self.lbl_summary.setText(
                f"Total: {len(results)}  |  Screw OK: {st}  |  Missing: {sm}  |  "
                f"Tilted: {tilted}  |  Angle: {min(angles):.2f} ~ {max(angles):.2f} deg"
            )

        self.progress_bar.setValue(100)
        self.lbl_progress.setText("Complete")
        self.lbl_counter.setText(f"1 / {len(results)}" if results else "0 / 0")
        self.status_bar.showMessage(
            f"Done — {ok} ok, {sm} missing screw, {tilted} tilted")
        if results:
            self.btn_prev.setEnabled(True)
            self.btn_next.setEnabled(True)

    def _on_error(self, msg: str):
        QMessageBox.critical(self, "Error", f"Detection failed:\n{msg}")
        self.btn_open.setEnabled(True)
        self.btn_detect.setEnabled(True)
        self.btn_calib.setEnabled(True)
        self.lbl_progress.setText(f"Error: {msg}")

    def _on_export(self):
        if not self.results:
            QMessageBox.warning(self, "No Data", "Run detection first.")
            return
        filepath, _ = QFileDialog.getSaveFileName(
            self, "Export CSV", "detection_results.csv",
            "CSV Files (*.csv);;All Files (*)")
        if not filepath:
            return
        try:
            with open(filepath, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=[
                    "filename", "center_x", "center_y", "angle_deg",
                    "width", "height", "area",
                    "has_screw", "screw_contrast", "is_tilted",
                    "success", "error",
                ])
                writer.writeheader()
                for r in self.results:
                    writer.writerow(r.to_dict())
            self.status_bar.showMessage(f"Exported to {filepath}")
        except Exception as e:
            QMessageBox.critical(self, "Export Error", str(e))

    # ── Navigation ───────────────────────────────────────────────────

    def _on_table_select(self):
        rows = self.table.selectionModel().selectedRows()
        if rows:
            idx = rows[0].row()
            if idx in self.annotated_images:
                self._show_annotated(idx, self.annotated_images[idx])

    def _on_prev(self):
        if self.calibration_mode:
            if self.image_filenames and self.current_image_idx > 0:
                self.current_image_idx -= 1
                self._load_calib_image(self.current_image_idx)
            return

        if not self.annotated_images:
            return
        self.current_image_idx = max(0, self.current_image_idx - 1)
        self._show_annotated(self.current_image_idx, self.annotated_images[self.current_image_idx])
        self.table.selectRow(self.current_image_idx)

    def _on_next(self):
        if self.calibration_mode:
            if self.image_filenames and self.current_image_idx < len(self.image_filenames) - 1:
                self.current_image_idx += 1
                self._load_calib_image(self.current_image_idx)
            return

        if not self.annotated_images:
            return
        self.current_image_idx = min(len(self.annotated_images) - 1, self.current_image_idx + 1)
        self._show_annotated(self.current_image_idx, self.annotated_images[self.current_image_idx])
        self.table.selectRow(self.current_image_idx)

    # ── Helpers ───────────────────────────────────────────────────────

    def _set_cell(self, row: int, col: int, text: str, color: str):
        item = QTableWidgetItem(text)
        item.setTextAlignment(Qt.AlignCenter)
        item.setForeground(QColor(color))
        self.table.setItem(row, col, item)

    def _show_annotated(self, idx: int, annotated: np.ndarray):
        self.current_image_idx = idx
        self.lbl_counter.setText(f"{idx + 1} / {len(self.annotated_images)}")
        h, w = annotated.shape[:2]
        qimg = QImage(annotated.data.tobytes(), w, h, 3 * w, QImage.Format_RGB888)
        pixmap = QPixmap.fromImage(qimg.rgbSwapped())
        scaled = pixmap.scaled(self.image_label.size(), Qt.KeepAspectRatio, Qt.SmoothTransformation)
        self.image_label.setPixmap(scaled)

        result = self.results[idx] if idx < len(self.results) else None
        if result and result.success:
            st = "Screw: OK" if result.has_screw else "Screw: MISSING"
            tt = " | TILTED" if result.is_tilted else ""
            self.status_bar.showMessage(
                f"[{idx + 1}/{len(self.results)}]  {result.filename}  |  "
                f"({result.center_x}, {result.center_y})  |  "
                f"Angle: {result.angle_deg:.2f}°  |  {st}{tt}")
