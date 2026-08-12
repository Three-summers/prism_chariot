# -*- mode: python ; coding: utf-8 -*-
# IndustrialVisualizer.spec — 构建: cd 项目根 && uv run pyinstaller --noconfirm --clean IndustrialVisualizer.spec
# 模式: PYI_MODE=onedir(调试) | onefile(正式产物, 默认)

import os

from PyInstaller.utils.hooks import collect_all

ROOT = os.getcwd()  # 构建命令须从项目根运行
IV = os.path.join(ROOT, 'Industrial_Visualizer')   # 入口脚本与 images/
COMMON = os.path.join(ROOT, 'common')              # 所有业务模块

# PyOpenGL 的延迟导入机制在 frozen importer 下会失效（error.py 中
# `from OpenGL import platform` 得到 None），必须完整收集所有子模块/数据
_openGL_datas, _openGL_binaries, _openGL_hidden = collect_all('OpenGL')

# 全部本地模块显式列出（namespace package 兜底; 对照真实 import 图）
LOCAL_MODULES = [
    'gui_core', 'gui_threads', 'gui_parser', 'parseFrame', 'parseTLVs',
    'demo_defines', 'tlv_defines', 'graph_utilities', 'cached_data', 'gui_common', 'gl_text',
    'translations',
    'Common_Tabs.plot_1d', 'Common_Tabs.plot_2d', 'Common_Tabs.plot_3d',
    'Common_Tabs.false_alarm_test', 'Common_Tabs.power_consumption_report',
    'Demo_Classes.surface_classification', 'Demo_Classes.people_tracking',
    'Demo_Classes.gesture_recognition', 'Demo_Classes.level_sensing',
    'Demo_Classes.small_obstacle', 'Demo_Classes.out_of_box_x843',
    'Demo_Classes.out_of_box_x432', 'Demo_Classes.out_of_box_x844',
    'Demo_Classes.true_ground_speed', 'Demo_Classes.long_range_pd',
    'Demo_Classes.mobile_tracker', 'Demo_Classes.kick_to_open',
    'Demo_Classes.calibration', 'Demo_Classes.vital_signs',
    'Demo_Classes.dashcam', 'Demo_Classes.ebikes_x432',
    'Demo_Classes.video_doorbell', 'Demo_Classes.intruder_detection',
    'Demo_Classes.Helper_Classes.fall_detection',
]

a = Analysis(
    [os.path.join(IV, 'gui_main.py')],
    pathex=[IV, COMMON],          # 关键: common/ 必须显式加入, 否则 gui_core 等全部丢失
    binaries=_openGL_binaries,
    datas=[
        # 资源目录, 目标结构以 _MEIPASS 为基准 (resource_path 已适配):
        (os.path.join(IV, 'images'), 'images'),
        (os.path.join(COMMON, 'External_Resources', 'path.json'), 'common/External_Resources'),
    ] + _openGL_datas,
    hiddenimports=LOCAL_MODULES + [
        # pyqtgraph.opengl 兜底 (hook 只收 Template 模块, 其余靠静态分析; 显式列一份最稳)
        'pyqtgraph.opengl',
        'pyqtgraph.opengl.items.GLScatterPlotItem',
        'pyqtgraph.opengl.items.GLTextItem',
        'pyqtgraph.opengl.shaders',
        # PyOpenGL —— pyqtgraph.opengl.shaders 的硬依赖, collect_all 兜底
        'OpenGL.GL.shaders',
        'OpenGL.arrays',
    ] + _openGL_hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

if os.environ.get('PYI_MODE', 'onefile') == 'onedir':
    exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='IndustrialVisualizer',
              debug=False, bootloader_ignore_signals=False, strip=False, upx=False, console=True)
    coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='IndustrialVisualizer')
else:
    exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name='IndustrialVisualizer',
              debug=False, bootloader_ignore_signals=False, strip=False, upx=False, console=True,
              icon=os.path.join(IV, 'images', 'logo.ico'))
