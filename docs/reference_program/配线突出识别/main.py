#!/usr/bin/env python3
"""双导线凸起检测系统  — 启动入口"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ui.main_window import main

if __name__ == "__main__":
    main()
