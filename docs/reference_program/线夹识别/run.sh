#!/usr/bin/env bash
# 一键启动 线夹识别（Wire Clip Detection）
# 使用 reference_program/ 下的共享虚拟环境
set -e
cd "$(dirname "$0")"
exec ../.venv/bin/python main.py "$@"
