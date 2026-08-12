#!/usr/bin/env python3
"""Dual Wire Bulge Detection — single-file PyQt5 application.

Full feature parity with original HTML.
All detection + UI in one file.

Run: python main.py
"""

import sys, os, csv, time
import numpy as np
import cv2

from PyQt5.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QFileDialog, QMessageBox, QFrame, QSlider, QApplication,
)
from PyQt5.QtCore import Qt, QTimer
from PyQt5.QtGui import QPixmap, QImage, QPainter, QPen, QColor, QFont

C_ = {
    'body':'#0a0a0f','text':'#d4d4d8','td':'#52525b','tm':'#71717a','tl':'#a1a1aa',
    'border':'#1f1f2c','pnl':'#0f0f16','hd_bg':'#0d0d12','hd_bd':'#15151f',
    'main':'#050508','btn_bg':'#18181e','btn_bd':'#27272a',
    'btn_hov':'#22222e','btn_hov_bd':'#3f3f46','fbar':'#0d0d12',
}

STYLE = f"""
QMainWindow,QWidget{{background:{C_['body']};color:{C_['text']};
 font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;font-size:13px;}}
QPushButton{{padding:5px 11px;border:1px solid {C_['btn_bd']};background:{C_['btn_bg']};
 color:{C_['tl']};font-size:11px;border-radius:5px;white-space:nowrap;}}
QPushButton:hover{{background:{C_['btn_hov']};border-color:{C_['btn_hov_bd']};color:#e4e4e7;}}
QPushButton#start{{background:#1e3a8a;color:#bfdbfe;border-color:#2563eb;font-weight:bold;}}
QPushButton#start_on{{background:#065f46;color:#6ee7b7;border-color:#059669;font-weight:bold;}}
QPushButton#stop{{background:#7f1d1d;color:#fca5a5;border-color:#dc2626;}}
QPushButton#calib{{background:#3b0764;color:#d8b4fe;border-color:#7c3aed;}}
QPushButton#w1{{background:#064e3b;color:#6ee7b7;border-color:#059669;}}
QPushButton#w2{{background:#4a1d6e;color:#c4b5fd;border-color:#7c3aed;}}
QPushButton#w1_on{{background:#1e3a5f;border:2px solid #3b82f6;color:#6ee7b7;}}
QPushButton#w2_on{{background:#1e3a5f;border:2px solid #3b82f6;color:#c4b5fd;}}
QPushButton#video{{background:#0c4a6e;color:#7dd3fc;border-color:#0284c7;}}
QPushButton#video_on{{background:#1e3a5f;border:2px solid #3b82f6;}}
QPushButton#export{{background:#3b0764;color:#d8b4fe;border-color:#7c3aed;}}
QSlider::groove:horizontal{{background:#1a1a24;height:5px;border-radius:2px;}}
QSlider::handle:horizontal{{background:#22c55e;width:12px;height:12px;margin:-4px 0;border-radius:6px;}}
QLabel#stag{{font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;}}
"""

class TrendChart(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent); self.setMinimumHeight(140)
        self.d1=[]; self.d2=[]; self.lbls=[]
    def push(self, l, v1, v2):
        self.d1.append(v1); self.d2.append(v2); self.lbls.append(l)
        if len(self.d1)>300: self.d1.pop(0); self.d2.pop(0); self.lbls.pop(0)
        self.update()
    def clear(self):
        self.d1.clear(); self.d2.clear(); self.lbls.clear(); self.update()
    def paintEvent(self, ev):
        p=QPainter(self); p.setRenderHint(QPainter.Antialiasing)
        w,h=self.width(),self.height()
        if w<40: return
        pl,pr,pt,pb=32,14,8,20; pw,ph=w-pl-pr,h-pt-pb
        if pw<=0: return
        def y2p(v): return pt+ph-(max(-80,min(80,v))+80)/160.0*ph
        p.setPen(QPen(QColor("#1a1a24"),0.5))
        for yv in(-80,-40,0,40,80): p.drawLine(pl,int(y2p(yv)),pl+pw,int(y2p(yv)))
        p.setPen(QPen(QColor("#2a2a3a"),1)); p.drawLine(pl,int(y2p(0)),pl+pw,int(y2p(0)))
        p.setFont(QFont("Consolas",7)); p.setPen(QColor("#52525b"))
        for yv in(-80,-40,0,40,80): p.drawText(2,int(y2p(yv))+3,f"{yv}deg")
        n=len(self.lbls)
        if n>1:
            step=max(1,n//5)
            for i in range(0,n,step):
                lx=int(pl+(i/(n-1))*pw)
                lbl=self.lbls[i]; p.drawText(lx-18,h-2,lbl[:8]if len(lbl)>8 else lbl)
        def line(data,color):
            if len(data)<2: return
            p.setPen(QPen(color,2))
            for i in range(1,len(data)):
                x0=int(pl+((i-1)/(len(data)-1))*pw)
                x1=int(pl+(i/(len(data)-1))*pw)
                p.drawLine(x0,int(y2p(data[i-1])),x1,int(y2p(data[i])))
        line(self.d1,QColor("#ef4444")); line(self.d2,QColor("#fbbf24"))
        p.setFont(QFont("Consolas",8)); p.setPen(Qt.NoPen)
        p.setBrush(QColor("#ef4444")); p.drawEllipse(pl,h-10,6,6)
        p.setPen(QColor("#a1a1aa")); p.drawText(pl+10,h-3,"导线1")
        p.setPen(Qt.NoPen); p.setBrush(QColor("#fbbf24")); p.drawEllipse(pl+50,h-10,6,6)
        p.drawText(pl+60,h-3,"导线2")

def _find_spots(gray, yF, xF1, xF2):
    """Exact port of original JS findSpotsOnLine. No dedup (matches original)."""
    if xF2 < xF1: xF1, xF2 = xF2, xF1
    xLen = xF2 - xF1 + 1
    if xLen < 10: return [None, None, None]
    bandH = 12
    H, W = gray.shape
    y0 = max(0, int(yF) - bandH); y1_ = min(H, int(yF) + bandH + 1)
    roi = gray[y0:y1_, xF1:xF2 + 1]
    prof = np.sum(roi.astype(np.float64), axis=0)
    if np.max(prof) <= 0: return [None, None, None]
    third = xLen // 3
    if third < 1: return [None, None, None]
    segs = [(0, third), (third, 2*third), (2*third, xLen)]
    res = []
    for a, b in segs:
        if a >= b: res.append(None); continue
        seg = prof[a:b]
        if len(seg) == 0 or np.max(seg) <= 0: res.append(None); continue
        pi = int(np.argmax(seg)); pi_abs = a + pi
        if prof[pi_abs] <= 0: res.append(None); continue
        ws = max(0, pi_abs - 4); we = min(len(prof), pi_abs + 5)
        wnd = prof[ws:we]; idx = np.arange(ws, we); sw = np.sum(wnd)
        cx = xF1 + (np.sum(idx * wnd) / sw if sw > 0 else float(pi_abs))
        res.append((cx, float(yF)))
    return res

class CanvasWidget(QWidget):
    def __init__(self, win):
        super().__init__(win); self.w = win; self.setMouseTracking(True)
    def paintEvent(self, ev):
        w = self.w; p = QPainter(self); p.setRenderHint(QPainter.Antialiasing)
        pw, ph = self.width(), self.height()
        p.fillRect(0, 0, pw, ph, QColor(C_['main']))
        bgr = w._raw
        if bgr is None: return
        sw, sh = bgr.shape[1], bgr.shape[0]
        s = min(pw / sw, ph / sh, 1.5)
        w.iw = sw * s; w.ih = sh * s
        w.ix = (pw - w.iw) / 2; w.iy = (ph - w.ih) / 2
        scaled = cv2.resize(bgr, (int(w.iw), int(w.ih)))
        rgb = cv2.cvtColor(scaled, cv2.COLOR_BGR2RGB)
        qimg = QImage(rgb.data.tobytes(), int(w.iw), int(w.ih), 3 * int(w.iw), QImage.Format_RGB888)
        p.drawImage(int(w.ix), int(w.iy), qimg)
        p.save(); pen = QPen(QColor(24, 24, 36), 1); pen.setStyle(Qt.DashLine)
        pen.setDashPattern([4, 12]); p.setPen(pen)
        if w.iw > 0:
            for f in [0.33, 0.66]:
                zx = int(w.ix + w.iw * f); p.drawLine(zx, int(w.iy), zx, int(w.iy + w.ih))
        p.restore()
        for wi in range(2):
            bl = w.baseline[wi]
            if len(bl) != 3: continue
            bc = QColor("#ef4444") if wi == 0 else QColor("#fbbf24")
            sc = QColor("#60a5fa") if wi == 0 else QColor("#a78bfa")
            for i in range(3):
                b = bl[i]; cx = w.ix + b['rx'] * w.iw; cy = w.iy + b['ry'] * w.ih
                clr = bc if b.get('wire') == 'B' else sc
                p.save(); p.setOpacity(0.4); p.setPen(QPen(clr, 2)); p.setBrush(Qt.NoBrush)
                p.drawEllipse(int(cx) - 8, int(cy) - 8, 16, 16); p.restore()
                p.setPen(Qt.NoPen); p.setBrush(clr); p.drawEllipse(int(cx) - 3, int(cy) - 3, 6, 6)
                p.setPen(QPen(clr, 1))
                p.drawLine(int(cx) - 8, int(cy), int(cx) + 8, int(cy))
                p.drawLine(int(cx), int(cy) - 8, int(cx), int(cy) + 8)
                p.setPen(QColor("#fff")); p.setFont(QFont("sans-serif", 9, QFont.Bold))
                lbl = f"L{wi+1}" if b.get('wire')=='L' else (f"R{wi+1}" if b.get('wire')=='R' else f"B{wi+1}")
                p.drawText(int(cx) - 12, int(cy) - 18, 24, 14, Qt.AlignCenter, lbl)
                p.save(); p.setOpacity(0.2); p.setPen(QPen(QColor("#fff"), 1)); p.setBrush(Qt.NoBrush)
                p.drawEllipse(int(cx) - 8, int(cy) - 8, 16, 16); p.restore()
        for wi in range(2):
            if wi >= len(w.current): continue
            sp = w.current[wi]
            if not sp or len(sp) != 3: continue
            bc = QColor("#ef4444") if wi == 0 else QColor("#fbbf24")
            sc = QColor("#60a5fa") if wi == 0 else QColor("#a78bfa")
            if sp[0] and sp[2]:
                p.save(); p.setOpacity(0.5)
                pd = QPen(bc, 1.5); pd.setStyle(Qt.DashLine); pd.setDashPattern([4, 4]); p.setPen(pd)
                p.drawLine(int(sp[0]['x']), int(sp[0]['y']), int(sp[2]['x']), int(sp[2]['y'])); p.restore()
            for i in range(3):
                s = sp[i]; clr = bc if i == 1 else sc; sx, sy = int(s['x']), int(s['y'])
                p.setPen(Qt.NoPen); p.setBrush(clr); p.drawEllipse(sx - 6, sy - 6, 12, 12)
                p.setPen(QPen(QColor("#fff"), 1.5)); p.setBrush(Qt.NoBrush); p.drawEllipse(sx - 6, sy - 6, 12, 12)
                p.setPen(QColor("#fff")); p.setFont(QFont("sans-serif", 8, QFont.Bold))
                p.drawText(sx - 18, sy - 13, 36, 12, Qt.AlignCenter, f"{wi + 1}.{i + 1}")
                if i == 1:
                    p.setPen(clr); p.setFont(QFont("monospace", 9, QFont.Bold))
                    p.drawText(sx + 10, sy + 18, f"{s.get('deviation', 0):.1f}deg")
        if w._calib_mode and w._calib_drag:
            pen = QPen(QColor("#22c55e"), 2); pen.setStyle(Qt.DashLine)
            pen.setDashPattern([6, 3]); p.setPen(pen)
            p.drawLine(int(w._drag_x1), int(w._drag_y), int(w._drag_x2), int(w._drag_y))
        if w.running:
            items = [f"W1 {w.allDev[0]:.1f}deg", f"W2 {w.allDev[1]:.1f}deg", f"{w._last_fps:.0f}fps"]
            p.setFont(QFont("sans-serif", 10)); fm = p.fontMetrics()
            ws = [fm.horizontalAdvance(it) + 28 for it in items]
            tw = sum(ws) + 12; x0 = (pw - tw) // 2
            for i, it in enumerate(items):
                x = int(x0 + sum(ws[:i]) + (6 if i > 0 else 0)); y = ph - 36
                p.setPen(QPen(QColor("#1f1f2c"), 1)); p.setBrush(QColor(0, 0, 0, 210))
                p.drawRoundedRect(x, y, ws[i], 22, 10, 10)
                p.setPen(QColor("#a1a1aa")); p.drawText(x + 14, y + 16, it)
        if w.use_video and not w.running and not w.use_camera:
            dur = w.vfc / max(w.vfps, 1) if w.vfc else 0
            cur = w.vpos / max(w.vfps, 1) if w.vfps else 0
            ts = f"{w._fmt(cur)} / {w._fmt(dur)}"
            pct = w.vpos / max(1, w.vfc) if w.vfc else 0
            vw2, vh = 320, 36; vx = (pw - vw2) // 2; vy = ph - 80
            p.setPen(QPen(QColor("#2a2a3a"), 1)); p.setBrush(QColor(0, 0, 0, 179))
            p.drawRoundedRect(vx, vy, vw2, vh, 18, 18)
            pp = "||" if w._vid_playing else ">"
            p.setPen(QColor("#d4d4d8")); p.setFont(QFont("sans-serif", 14))
            p.drawText(vx + 10, vy + 8, 26, 22, Qt.AlignCenter, pp)
            bx, bw_ = vx + 38, vw2 - 110
            p.setPen(Qt.NoPen); p.setBrush(QColor("#3f3f46"))
            p.drawRoundedRect(bx, vy + 15, bw_, 4, 2, 2)
            fw = int(bw_ * pct)
            if fw > 0: p.setBrush(QColor("#22c55e")); p.drawRoundedRect(bx, vy + 15, fw, 4, 2, 2)
            p.setPen(QColor("#a1a1aa")); p.setFont(QFont("monospace", 10))
            p.drawText(bx + bw_ + 4, vy + 8, 68, 22, Qt.AlignCenter, ts)
    def mousePressEvent(self, ev):
        w = self.w
        if ev.button() == Qt.LeftButton:
            if w._calib_mode:
                w._calib_drag = True
                w._drag_x1 = w._drag_x2 = ev.x(); w._drag_y = ev.y()
                self.update()
            elif w.use_video and not w.running and not w.use_camera:
                pw2 = self.width(); ph2 = self.height()
                vw2, vh = 320, 36; vx = (pw2 - vw2) // 2; vy = ph2 - 80
                if vx <= ev.x() <= vx + vw2 and vy <= ev.y() <= vy + vh:
                    bx = vx + 38; bw_ = vw2 - 110
                    if ev.x() <= vx + 36: w._toggle_vid()
                    elif bx <= ev.x() <= bx + bw_: w._seek_video((ev.x() - bx) / bw_)
                self.update()
        elif ev.button() == Qt.RightButton and w._calib_mode:
            w._calib_mode = False; w._calib_drag = False
            self.setCursor(Qt.ArrowCursor); self.update()
    def mouseMoveEvent(self, ev):
        w = self.w
        if w._calib_mode and w._calib_drag: w._drag_x2 = ev.x(); self.update()
    def mouseReleaseEvent(self, ev):
        w = self.w
        if ev.button() == Qt.LeftButton and w._calib_mode and w._calib_drag:
            w._drag_x2 = ev.x(); w._calib_drag = False
            w._calib_finish(); self.update()

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("双导线凸起检测系统")
        self.resize(1480, 860); self.setMinimumSize(1100, 650)
        self.baseline = [[], []]; self.current = []
        self.allDev = [0.0, 0.0]; self.wireActive = 0
        self.running = False; self.frameN = 0
        self.firstFrameAfterCalib = False; self.lastState = 'ok'
        self.history = []
        self.ix = 0; self.iy = 0; self.iw = 0; self.ih = 0
        self._raw = None; self._static = None
        self.use_video = False; self.use_camera = False
        self.vcap = None; self.vfps = 30.0; self.vfc = 0; self.vpos = 0
        self._vid_playing = False
        self._calib_mode = False; self._calib_drag = False
        self._drag_x1 = 0; self._drag_y = 0; self._drag_x2 = 0; self._calib_wire = 0
        self._fps = 0.0; self._last_fps = 0; self._fps_ts = 0.0
        self._setup_ui(); self.setStyleSheet(STYLE)
        self._init_placeholder()
        self._vtimer = QTimer(self); self._vtimer.timeout.connect(self._vtick)
        self._mtimer = QTimer(self); self._mtimer.timeout.connect(self._mtick)

    @property
    def _warn(self): return self.warn_sl.value() / 2.0
    @property
    def _alarm(self): return self.alarm_sl.value() / 2.0
    @property
    def _sens(self): return float(self.sens_sl.value())
    @staticmethod
    def _fmt(sec): m, s = int(sec // 60), int(sec % 60); return f"{m}:{s:02d}"

    def _setup_ui(self):
        cw = QWidget(); self.setCentralWidget(cw)
        root = QVBoxLayout(cw); root.setContentsMargins(0,0,0,0); root.setSpacing(0)
        bar = QWidget(); bar.setStyleSheet(f"background:{C_['pnl']}; border-bottom:1px solid {C_['border']};")
        tb = QHBoxLayout(bar); tb.setContentsMargins(6,4,6,4); tb.setSpacing(4)
        self.stag = QLabel("待机"); self.stag.setObjectName("stag")
        self.stag.setStyleSheet("background:#27272a; color:#71717a;"); tb.addWidget(self.stag)
        tb.addWidget(QLabel("双导线凸起检测")); tb.addStretch()
        self.wtag = QLabel("导线1"); self.wtag.setStyleSheet(
            "background:#064e3b; color:#6ee7b7; padding:2px 6px; border-radius:8px; font-size:9px; font-weight:600;"); tb.addWidget(self.wtag)
        self.bw1 = QPushButton("导线1"); self.bw1.setObjectName("w1_on")
        self.bw2 = QPushButton("导线2"); self.bw2.setObjectName("w2")
        self.bw1.clicked.connect(lambda: self._sw_wire(0))
        self.bw2.clicked.connect(lambda: self._sw_wire(1))
        tb.addWidget(self.bw1); tb.addWidget(self.bw2); tb.addWidget(self._sep())
        self.bcal = QPushButton("📏 画线选点"); self.bcal.setObjectName("calib")
        self.bcal.clicked.connect(self._on_calib)
        self.bgo = QPushButton("▶ 开始监测"); self.bgo.setObjectName("start")
        self.bgo.clicked.connect(self._toggle)
        self.bstop = QPushButton("⏹ 停止"); self.bstop.setObjectName("stop")
        self.bstop.clicked.connect(self._stop)
        tb.addWidget(self.bcal); tb.addWidget(self.bgo); tb.addWidget(self.bstop); tb.addWidget(self._sep())
        self.bimg = QPushButton("📁 图片"); self.bimg.clicked.connect(self._on_img)
        self.bvid = QPushButton("🎬 视频"); self.bvid.setObjectName("video")
        self.bvid.clicked.connect(self._on_video)
        self.bcam = QPushButton("📷 摄像头"); self.bcam.clicked.connect(self._on_cam)
        tb.addWidget(self.bimg); tb.addWidget(self.bvid); tb.addWidget(self.bcam); tb.addWidget(self._sep())
        bexp = QPushButton("⬇ 导出CSV"); bexp.setObjectName("export"); bexp.clicked.connect(self._export)
        brst = QPushButton("✕ 重置"); brst.clicked.connect(self._reset)
        tb.addWidget(bexp); tb.addWidget(brst)
        root.addWidget(bar)
        main = QHBoxLayout(); main.setContentsMargins(0,0,0,0); main.setSpacing(0)
        left = QFrame(); left.setStyleSheet(f"background:{C_['main']}; border-right:1px solid #1a1a24;")
        self._canvas = CanvasWidget(self)
        ll = QVBoxLayout(left); ll.setContentsMargins(0,0,0,0); ll.addWidget(self._canvas)
        main.addWidget(left, stretch=3)
        rw = QWidget(); rw.setStyleSheet(f"background:{C_['pnl']};"); rw.setFixedWidth(420)
        rl = QVBoxLayout(rw); rl.setContentsMargins(0,0,0,0); rl.setSpacing(0)
        def hdr(t):
            l = QLabel(t)
            l.setStyleSheet(f"padding:7px 12px; font-size:9px; font-weight:700; color:{C_['td']}; "
                            f"text-transform:uppercase; letter-spacing:.07em; background:{C_['hd_bg']}; "
                            f"border-bottom:1px solid {C_['hd_bd']};")
            l.setFixedHeight(24); return l
        self.w1card = QLabel(); self.w1card.setWordWrap(True)
        rl.addWidget(hdr("🔬 导线1 状态")); rl.addWidget(self.w1card)
        self.w2card = QLabel(); self.w2card.setWordWrap(True)
        rl.addWidget(hdr("🔬 导线2 状态")); rl.addWidget(self.w2card)
        rl.addWidget(hdr("📈 偏移趋势"))
        self.chart = TrendChart(); rl.addWidget(self.chart, stretch=1)
        sr = QHBoxLayout(); sr.setContentsMargins(4,4,4,4); sr.setSpacing(4)
        def mk(lb, lo, hi, v, fmt):
            w = QWidget(); l2 = QHBoxLayout(w); l2.setContentsMargins(0,0,0,0); l2.setSpacing(1)
            lab = QLabel(lb); lab.setStyleSheet(f"color:{C_['tm']}; font-size:10px; background:transparent;")
            s = QSlider(Qt.Horizontal); s.setRange(lo, hi); s.setValue(v); s.setFixedWidth(55)
            vl = QLabel(); vl.setFixedWidth(28)
            vl.setStyleSheet(f"color:{C_['tl']}; font-weight:600; font-size:10px; background:transparent;"); vl.setAlignment(Qt.AlignCenter)
            def _cb(): vl.setText(fmt(s.value()))
            s.valueChanged.connect(_cb); _cb()
            l2.addWidget(lab); l2.addWidget(s); l2.addWidget(vl); return w, s
        ww, self.warn_sl = mk("预警", 1, 40, 4,  lambda v: f"{v/2}deg")
        wa, self.alarm_sl = mk("报警", 2, 100, 10, lambda v: f"{v/2}deg")
        ws, self.sens_sl = mk("灵敏度", 1, 30, 1, lambda v: f"{v}x")
        sr.addWidget(ww); sr.addWidget(wa); sr.addWidget(ws); rl.addLayout(sr)
        main.addWidget(rw)
        root.addLayout(main, stretch=1)
        fbar = QHBoxLayout(); fbar.setContentsMargins(8,3,8,3)
        fb = QWidget(); fb.setStyleSheet(f"background:{C_['fbar']}; border-top:1px solid #1a1a24; font-size:10px; color:{C_['td']};"); fb.setLayout(fbar)
        self.lbl_mode = QLabel("就绪"); self.lbl_mode.setStyleSheet(f"color:{C_['td']}; font-size:10px; background:transparent;")
        self.lbl_fn = QLabel("帧: 0"); self.lbl_fn.setStyleSheet(f"color:{C_['td']}; font-size:10px; background:transparent;")
        fbar.addWidget(self.lbl_mode); fbar.addStretch(); fbar.addWidget(self.lbl_fn)
        fbar.addWidget(QLabel("空格启停 | 画线选点 | 停止时暂停视频"))
        root.addWidget(fb)

    def _sep(self):
        v = QFrame(); v.setFrameShape(QFrame.VLine); v.setStyleSheet(f"color:{C_['border']};"); v.setFixedWidth(1); return v

    def _sw_wire(self, w):
        self.wireActive = w
        if w == 0:
            self.wtag.setText("导线1"); self.wtag.setStyleSheet(
                "background:#064e3b; color:#6ee7b7; padding:2px 6px; border-radius:8px; font-size:9px; font-weight:600;")
            self.bw1.setObjectName("w1_on"); self.bw2.setObjectName("w2")
        else:
            self.wtag.setText("导线2"); self.wtag.setStyleSheet(
                "background:#4a1d6e; color:#c4b5fd; padding:2px 6px; border-radius:8px; font-size:9px; font-weight:600;")
            self.bw1.setObjectName("w1"); self.bw2.setObjectName("w2_on")
        for b in [self.bw1, self.bw2]: b.style().unpolish(b); b.style().polish(b)
        self._canvas.update()

    def _set_status(self, text, bg, fg):
        self.stag.setText(text)
        self.stag.setStyleSheet(f"background:{bg}; color:{fg}; padding:2px 8px; border-radius:10px; font-weight:600; font-size:10px;")

    def _init_placeholder(self):
        ph = np.zeros((480, 854, 3), dtype=np.uint8); ph[:] = (18, 13, 13)
        cv2.rectangle(ph, (40, 237), (814, 240), (28, 28, 28), -1)
        for f in [0.33, 0.66]: cv2.line(ph, (int(854 * f), 0), (int(854 * f), 480), (24, 24, 24), 1)
        self._raw = ph; self._static = ph

    def _stop_src(self):
        if self.running: self._stop()
        self._vid_playing = False; self._vtimer.stop()
        if self.vcap: self.vcap.release(); self.vcap = None
        self.use_video = False; self.use_camera = False
        self.bvid.setObjectName("video"); self.bvid.style().unpolish(self.bvid); self.bvid.style().polish(self.bvid)
        self.bcam.setText("📷 摄像头"); self._raw = self._static

    def _on_img(self):
        p, _ = QFileDialog.getOpenFileName(self, "图片", "", "Images (*.jpg *.jpeg *.png *.bmp)")
        if not p: return
        img = cv2.imread(p)
        if img is None: return
        self._stop_src(); self._raw = img; self._static = img.copy()
        self.lbl_mode.setText(f"图片: {os.path.basename(p)}")

    def _on_video(self):
        p, _ = QFileDialog.getOpenFileName(self, "视频", "", "Videos (*.mp4 *.avi *.mov *.mkv *.webm)")
        if not p: return
        self._stop_src()
        cap = cv2.VideoCapture(p)
        if not cap.isOpened(): return
        self.vcap = cap; self.vfps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        self.vfc = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); self.vpos = 0; self.use_video = True
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0); ret, f = cap.read()
        if ret: self._raw = f; self._static = f.copy()
        self.lbl_mode.setText(f"视频: {os.path.basename(p)}")
        self._start_vid()

    def _on_cam(self):
        if self.use_camera: self._stop_src(); self._init_placeholder(); return
        self._stop_src()
        cap = cv2.VideoCapture(0)
        if not cap.isOpened(): QMessageBox.warning(self, "摄像头", "无法打开摄像头"); return
        self.vcap = cap; self.vfps = 30.0; self.use_camera = True
        self.bcam.setText("📷 摄像头 ✓"); self.lbl_mode.setText("摄像头已连接")
        ret, f = cap.read()
        if ret: self._raw = f; self._static = f.copy()
        self._start_vid()

    def _start_vid(self):
        if self.running: return
        if not self.use_video and not self.use_camera: return
        self._vid_playing = True; self.bvid.setObjectName("video_on" if self.use_video else "video")
        self.bvid.style().unpolish(self.bvid); self.bvid.style().polish(self.bvid)
        self._vtimer.start(max(5, int(1000 / max(self.vfps, 1))))

    def _stop_vid(self): self._vid_playing = False; self._vtimer.stop()

    def _toggle_vid(self):
        if self._vid_playing: self._stop_vid()
        else: self._start_vid()

    def _vtick(self):
        if not self._vid_playing or not self.vcap or not self.vcap.isOpened(): return
        ret, f = self.vcap.read()
        if ret:
            self._raw = f
            if self.use_video: self.vpos = int(self.vcap.get(cv2.CAP_PROP_POS_FRAMES))
        elif self.use_video:
            self.vcap.set(cv2.CAP_PROP_POS_FRAMES, 0); self.vpos = 0
            ret, f = self.vcap.read()
            if ret: self._raw = f

    def _seek_video(self, pct):
        if not self.vcap or not self.use_video: return
        self.vpos = int(pct * self.vfc); self.vcap.set(cv2.CAP_PROP_POS_FRAMES, self.vpos)
        ret, f = self.vcap.read()
        if ret: self._raw = f; self._static = f.copy()

    def _toggle(self):
        if self.running: self._stop()
        else: self._start()

    def _start(self):
        if len(self.baseline[0]) != 3 and len(self.baseline[1]) != 3:
            QMessageBox.warning(self, "需要标定", "请先画线选点"); return
        self._stop_vid()
        self.running = True; self.firstFrameAfterCalib = True; self.lastState = 'ok'
        self.allDev = [0.0, 0.0]; self.current = []; self.frameN = 0
        self._fps = 0.0; self._last_fps = 0; self._fps_ts = time.perf_counter()
        self.history.clear(); self.chart.clear()
        self.bgo.setObjectName("start_on"); self.bgo.setText("▶ 监测中...")
        self.bgo.style().unpolish(self.bgo); self.bgo.style().polish(self.bgo)
        self._set_status("● 监测中", "#065f46", "#4ade80"); self.lbl_mode.setText("监测中")
        self._mtimer.start(33)

    def _stop(self):
        self.running = False; self._mtimer.stop()
        self.allDev = [0.0, 0.0]; self.current = []
        self.bgo.setObjectName("start"); self.bgo.setText("▶ 开始监测")
        self.bgo.style().unpolish(self.bgo); self.bgo.style().polish(self.bgo)
        self._set_status("暂停", "#27272a", "#71717a"); self.lbl_mode.setText("就绪")
        self.update_cards(); self._canvas.update()
        if (self.use_video or self.use_camera) and self.vcap: self._start_vid()

    def _mtick(self):
        if not self.running: return
        self._run_frame()

    def _run_frame(self):
        if (self.use_video or self.use_camera) and self.vcap and self.vcap.isOpened():
            ret, f = self.vcap.read()
            if ret: self._raw = f
            elif self.use_video:
                self.vcap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, f = self.vcap.read()
                if ret: self._raw = f
            if self.use_video: self.vpos = int(self.vcap.get(cv2.CAP_PROP_POS_FRAMES))
        bgr = self._raw
        if bgr is None: return
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        sw, sh = bgr.shape[1], bgr.shape[0]
        cw, ch = self._canvas.width(), self._canvas.height()
        if cw < 10 or ch < 10: return
        s = min(cw / sw, ch / sh, 1.5)
        self.iw = sw * s; self.ih = sh * s
        self.ix = (cw - self.iw) / 2; self.iy = (ch - self.ih) / 2
        nw = min(600, sw); nh = max(1, int(round(nw * sh / sw)))
        if nw < sw: small = cv2.resize(gray, (nw, nh))
        else: small = gray.copy()
        sx = self.iw / nw; sy = self.ih / nh
        self.current = []; self.allDev = [0.0, 0.0]
        for wi in range(2):
            bl = self.baseline[wi]
            if len(bl) != 3: self.current.append([]); continue
            blY = [self.iy + bl[i]['ry'] * self.ih for i in range(3)]
            blX = [self.ix + bl[i]['rx'] * self.iw for i in range(3)]
            ref_sy = [(y - self.iy) / sy for y in blY]
            ref_sx = [(x - self.ix) / sx for x in blX]
            spots_out = []
            for bi in range(3):
                rx_img = int(round(ref_sx[bi])); ry_img = int(round(ref_sy[bi]))
                sr = 50
                x0 = max(0, rx_img - sr); y0_ = max(0, ry_img - sr)
                x1 = min(nw - 1, rx_img + sr); y1 = min(nh - 1, ry_img + sr)
                ww2, hh2 = x1 - x0 + 1, y1 - y0_ + 1
                if ww2 < 3 or hh2 < 3:
                    spots_out.append({'id': bi + 1, 'x': blX[bi], 'y': blY[bi],
                                      'wire': bl[bi].get('wire', ''), 'deviation': 0}); continue
                roi = small[y0_:y1 + 1, x0:x1 + 1].astype(np.float64)
                mx = np.max(roi)
                if mx <= 0:
                    spots_out.append({'id': bi + 1, 'x': blX[bi], 'y': blY[bi],
                                      'wire': bl[bi].get('wire', ''), 'deviation': 0}); continue
                thr = mx * 0.5
                yy2, xx2 = np.mgrid[0:roi.shape[0], 0:roi.shape[1]]
                mask = roi >= thr
                if not np.any(mask):
                    spots_out.append({'id': bi + 1, 'x': blX[bi], 'y': blY[bi],
                                      'wire': bl[bi].get('wire', ''), 'deviation': 0}); continue
                wgt = (roi[mask] - thr + 1).astype(np.float64); sw3 = np.sum(wgt)
                if sw3 <= 0:
                    spots_out.append({'id': bi + 1, 'x': blX[bi], 'y': blY[bi],
                                      'wire': bl[bi].get('wire', ''), 'deviation': 0}); continue
                cx_img = float(x0) + np.sum(xx2[mask] * wgt) / sw3
                cy_img = float(y0_) + np.sum(yy2[mask] * wgt) / sw3
                cx_canvas = self.ix + cx_img * sx
                cy_canvas = self.iy + cy_img * sy
                if bl[bi].get('wire') in ('L', 'R'): cy_canvas = blY[bi]
                spots_out.append({'id': bi + 1, 'x': cx_canvas, 'y': cy_canvas,
                                  'wire': bl[bi].get('wire', ''), 'deviation': 0})
            spots_out.sort(key=lambda s: s['id'])
            devPx = (spots_out[1]['y'] - (spots_out[0]['y'] + spots_out[2]['y']) / 2.0) - \
                    (blY[1] - (blY[0] + blY[2]) / 2.0)
            devDeg = devPx * self._sens
            spots_out[0]['deviation'] = 0; spots_out[1]['deviation'] = devDeg; spots_out[2]['deviation'] = 0
            self.current.append(spots_out); self.allDev[wi] = devDeg
            if self.firstFrameAfterCalib and self.ih > 0:
                bl[1]['ry'] = (spots_out[1]['y'] - self.iy) / self.ih
        self.firstFrameAfterCalib = False; self.frameN += 1
        if self.frameN % 15 == 0:
            e = time.perf_counter() - self._fps_ts
            if e > 0: self._fps = 15 / e; self._last_fps = self._fps
            self._fps_ts = time.perf_counter()
        t = time.strftime("%H:%M:%S")
        self.history.append((t, self.allDev[0], self.allDev[1]))
        if len(self.history) > 300: self.history.pop(0)
        self.chart.push(t[-8:], self.allDev[0], self.allDev[1])
        a1 = abs(self.allDev[0]) >= self._alarm; a2 = abs(self.allDev[1]) >= self._alarm
        w1 = abs(self.allDev[0]) >= self._warn; w2 = abs(self.allDev[1]) >= self._warn
        if a1 or a2: self._set_status("⚠ 凸起报警", "#7f1d1d", "#fca5a5"); self.lastState = 'alarm'
        elif w1 or w2: self._set_status("◉ 注意", "#78350f", "#fcd34d"); self.lastState = 'warn'
        else: self._set_status("● 监测中", "#065f46", "#4ade80"); self.lastState = 'ok'
        self.lbl_fn.setText(f"帧: {self.frameN}")
        self.update_cards(); self._canvas.update()

    def _on_calib(self):
        if self.running: self._stop()
        self._calib_mode = True; self._calib_drag = False
        self.baseline[self.wireActive] = []; self._calib_wire = self.wireActive
        n = self.wireActive + 1
        self._set_status(f"导线{n} 水平拖动画线穿过光斑", "#3b0764", "#d8b4fe")
        self.lbl_mode.setText(f"画线选点 — 导线{n}")
        self._canvas.setCursor(Qt.CrossCursor)

    def _calib_finish(self):
        if abs(self._drag_x2 - self._drag_x1) < 20: return
        gray = cv2.cvtColor(self._raw, cv2.COLOR_BGR2GRAY)
        sw, sh = self._raw.shape[1], self._raw.shape[0]
        nw = min(600, sw); nh = max(1, int(round(nw * sh / sw)))
        if nw < sw: proc = cv2.resize(gray, (nw, nh))
        else: proc = gray.copy()
        cw, ch = self._canvas.width(), self._canvas.height()
        s = min(cw / sw, ch / sh, 1.5)
        iw = sw * s; ih = sh * s
        ix = (cw - iw) / 2; iy = (ch - ih) / 2
        scx = iw / nw; scy = ih / nh
        yF = int(round((self._drag_y - iy) / scy))
        xF1 = int(round((min(self._drag_x1, self._drag_x2) - ix) / scx))
        xF2 = int(round((max(self._drag_x1, self._drag_x2) - ix) / scx))
        yF = max(0, min(nh - 1, yF))
        xF1 = max(0, min(nw - 1, xF1)); xF2 = max(0, min(nw - 1, xF2))
        found = _find_spots(proc, yF, xF1, xF2)
        if found and found[0] and found[1] and found[2]:
            for fi in range(3):
                found[fi] = (ix + found[fi][0] * scx, iy + found[fi][1] * scy)
            self.baseline[self._calib_wire] = [
                {'rx': (found[0][0] - ix) / iw if iw > 0 else 0,
                 'ry': (found[0][1] - iy) / ih if ih > 0 else 0, 'wire': 'L'},
                {'rx': (found[1][0] - ix) / iw if iw > 0 else 0,
                 'ry': (found[1][1] - iy) / ih if ih > 0 else 0, 'wire': 'B'},
                {'rx': (found[2][0] - ix) / iw if iw > 0 else 0,
                 'ry': (found[2][1] - iy) / ih if ih > 0 else 0, 'wire': 'R'},
            ]
            self.ix = ix; self.iy = iy; self.iw = iw; self.ih = ih
            self._calib_mode = False; self._canvas.setCursor(Qt.ArrowCursor)
            self.history.clear(); self.chart.clear()
            n = self._calib_wire + 1
            self._set_status(f"导线{n} 基准已锁定", "#1e3a8a", "#bfdbfe")
            self.lbl_mode.setText(f"导线{n} 基准已锁定"); self.update_cards()
        else:
            QMessageBox.warning(self, "标定失败", "未找到三个光斑，请重新画线")

    def update_cards(self):
        for wi in range(2):
            dev = abs(self.allDev[wi]) if self.running else 0.0
            if len(self.baseline[wi]) != 3:
                html = ("<div style='margin:4px 8px;padding:10px 12px;background:#111118;"
                        "border:1px solid #1a1a24;border-radius:6px;'>"
                        "<span style='color:#52525b;font-size:11px;'>画线选点后开始监测</span></div>")
            else:
                at, wt = self._alarm, self._warn
                if dev >= at: cb, cbd, ibg, ifc, sym, vc, bc, vd = \
                    "#1c1015", "#ef4444", "#450a0a", "#fca5a5", "⚠", "#f87171", "#f87171", f"凸起! {dev:.1f}deg"
                elif dev >= wt: cb, cbd, ibg, ifc, sym, vc, bc, vd = \
                    "#1a1410", "#d97706", "#431407", "#fcd34d", "◉", "#fbbf24", "#fbbf24", f"注意 {dev:.1f}deg"
                else: cb, cbd, ibg, ifc, sym, vc, bc, vd = \
                    "#111118", "#1a1a24", "#052e16", "#4ade80", "✓", "#4ade80", "#4ade80", "正常"
                tbg = "#064e3b" if wi == 0 else "#4a1d6e"
                tfc = "#6ee7b7" if wi == 0 else "#c4b5fd"
                html = (
                    f"<div style='margin:4px 8px;padding:10px 12px;background:{cb};border:1px solid {cbd};"
                    f"border-radius:6px;display:flex;align-items:center;gap:10px;'>"
                    f"<div style='width:40px;height:40px;border-radius:50%;background:{ibg};color:{ifc};"
                    f"display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;'>{sym}</div>"
                    f"<div style='flex:1;'>"
                    f"<div style='font-weight:700;font-size:13px;color:#d4d4d8;'>"
                    f"<span style='background:{tbg};color:{tfc};padding:2px 6px;border-radius:8px;"
                    f"font-size:9px;font-weight:600;'>导线{wi+1}</span></div>"
                    f"<div style='font-size:11px;font-weight:600;color:{vc};margin-top:3px;'>{vd}</div></div>"
                    f"<div style='text-align:right;'>"
                    f"<div style='font-size:22px;font-weight:700;color:{bc};"
                    f"font-family:\"SF Mono\",Consolas,monospace;'>{dev:.1f}deg</div>"
                    f"<div style='font-size:10px;color:#52525b;'>偏移</div></div></div>")
            (self.w1card if wi == 0 else self.w2card).setText(html)

    def _export(self):
        if not self.history: QMessageBox.warning(self, "无数据", "请先运行监测"); return
        fp, _ = QFileDialog.getSaveFileName(self, "导出CSV", "monitoring_data.csv", "CSV (*.csv)")
        if not fp: return
        with open(fp, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f); w.writerow(["时间", "导线1(°)", "导线2(°)"])
            for h in self.history: w.writerow([h[0], f"{h[1]:.2f}", f"{h[2]:.2f}"])
        self.lbl_mode.setText("已导出")

    def _reset(self):
        self._stop(); self._stop_src()
        self.baseline = [[], []]; self.current = []; self.history.clear()
        self.frameN = 0; self.allDev = [0.0, 0.0]; self.chart.clear()
        self._init_placeholder()
        self._set_status("待机", "#27272a", "#71717a")
        self.lbl_fn.setText("帧: 0"); self.lbl_mode.setText("就绪")
        self.update_cards()

    def keyPressEvent(self, ev):
        if ev.key() == Qt.Key_Space: self._toggle()
        elif ev.key() == Qt.Key_1: self._sw_wire(0)
        elif ev.key() == Qt.Key_2: self._sw_wire(1)
        elif ev.key() == Qt.Key_Escape: self._stop()
        else: super().keyPressEvent(ev)

    def closeEvent(self, ev):
        self._stop(); self._stop_src(); super().closeEvent(ev)

def main():
    QApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    QApplication.setAttribute(Qt.AA_UseHighDpiPixmaps, True)
    app = QApplication(sys.argv); app.setApplicationName("双导线凸起检测系统")
    win = MainWindow(); win.show()
    sys.exit(app.exec_())

if __name__ == "__main__":
    main()
