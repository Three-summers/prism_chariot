#!/usr/bin/env bash
# 一键启动 配线突出识别（双导线凸起检测）
# 使用 reference_program/ 下的共享虚拟环境
set -e
cd "$(dirname "$0")"
exec ../.venv/bin/python main.py "$@"
