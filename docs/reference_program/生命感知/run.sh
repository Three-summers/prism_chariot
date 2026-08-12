#!/usr/bin/env bash
# 一键启动 Industrial Visualizer
# 必须在 Industrial_Visualizer/ 目录下运行（gui_main.py 硬编码 '../common' 相对路径），
# 并通过 .env 强制软件渲染，绕过 WSL2 下 PySide2 5.15 + Mesa 的堆损坏崩溃。
set -e
cd "$(dirname "$0")/Industrial_Visualizer"
# 加载 ../.env（LIBGL_ALWAYS_SOFTWARE=1）并导出
set -a
. ../.env
set +a
# 使用 reference_program/ 下的共享虚拟环境，不再由 uv run 自建 .venv
exec ../../.venv/bin/python gui_main.py "$@"
