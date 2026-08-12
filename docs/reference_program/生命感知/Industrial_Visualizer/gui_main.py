import sys
import os

# add common folder to path
# sys.path.insert(1, os.path.abspath(os.getcwd()) + "\\tools\\visualizers\\Applications_Visualizer\\common") # Uncomment for debug in VSCode or running from Applications_Visualizer dir
# PyInstaller 冻结时 common 模块已打入可执行文件，跳过相对路径（避免命中磁盘上的源码树）
if not getattr(sys, 'frozen', False):
    sys.path.insert(1, '../common')

# PySide6 Imports
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QApplication
from PySide6.QtGui import QPalette, QColor

# Window Class
from gui_core import Window

# Demo List
from demo_defines import *

# Logging (possible levels: DEBUG, INFO, WARNING, ERROR, CRITICAL)
import logging

# Uncomment this line for logging with timestamps
# logging.basicConfig(format='%(asctime)s,%(msecs)03d %(levelname)-8s [%(filename)s:%(lineno)d] %(message)s', datefmt='%Y-%m-%d:%H:%M:%S', level=logging.INFO)

logging.basicConfig(format='%(levelname)-8s [%(filename)s:%(lineno)d] %(message)s', level=logging.INFO)
log = logging.getLogger(__name__)

if __name__ == '__main__':
        for key in DEVICE_DEMO_DICT.keys():
                DEVICE_DEMO_DICT[key]["demos"] = [x for x in DEVICE_DEMO_DICT[key]["demos"] if x in BUSINESS_DEMOS["Industrial"]]

        # Qt6: HighDPI scaling is enabled by default (AA_EnableHighDpiScaling no longer exists)
        app = QApplication(sys.argv)

        if (len(sys.argv) >= 2 and sys.argv[1] == "dark"):
                # Force the style to be the same on all OSs:
                app.setStyle("Fusion")

                # Now use a palette to switch to dark colors:
                palette = QPalette()
                palette.setColor(QPalette.ColorRole.Window, QColor(53, 53, 53))
                palette.setColor(QPalette.ColorRole.WindowText, Qt.GlobalColor.white)
                palette.setColor(QPalette.ColorRole.Base, QColor(25, 25, 25))
                palette.setColor(QPalette.ColorRole.AlternateBase, QColor(53, 53, 53))
                palette.setColor(QPalette.ColorRole.ToolTipBase, Qt.GlobalColor.black)
                palette.setColor(QPalette.ColorRole.ToolTipText, Qt.GlobalColor.white)
                palette.setColor(QPalette.ColorRole.Text, Qt.GlobalColor.white)
                palette.setColor(QPalette.ColorRole.Button, QColor(53, 53, 53))
                palette.setColor(QPalette.ColorRole.ButtonText, Qt.GlobalColor.white)
                palette.setColor(QPalette.ColorRole.BrightText, Qt.GlobalColor.red)
                palette.setColor(QPalette.ColorRole.Link, QColor(42, 130, 218))
                palette.setColor(QPalette.ColorRole.Highlight, QColor(42, 130, 218))
                palette.setColor(QPalette.ColorRole.HighlightedText, Qt.GlobalColor.black)
                app.setPalette(palette)

        screen = app.primaryScreen()
        size = screen.size()
        main = Window(size=size, title="Industrial Visualizer")
        main.show()
        sys.exit(app.exec())