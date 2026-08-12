#!/usr/bin/env python3
"""i18n 静态校验：提取代码中 tr('...') 字面量与 translations._STRINGS 键比对。

用法: uv run python tools/check_i18n.py
输出: 缺词条（tr 引用但字典没有）/ 多余词条（字典有但无引用）列表，退出码非 0 表示有问题。
"""
import ast
import os
import sys
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "common"))

import translations  # noqa: E402

# 排除: 非 tr 调用的误匹配（str( 等）
TR_CALL_RE = re.compile(r"(?<![\w.])tr\(")


def extract_tr_literals(path):
    """用 AST 提取 tr('literal') / tr("literal") 的字符串字面量（非 f-string）。"""
    found = set()
    with open(path, encoding="utf-8") as f:
        tree = ast.parse(f.read(), path)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "tr":
            if node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
                found.add(node.args[0].value)
    return found


def main():
    py_files = []
    for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, "common")):
        dirnames[:] = [d for d in dirnames if d not in ("__pycache__",)]
        for fn in filenames:
            if fn.endswith(".py"):
                py_files.append(os.path.join(dirpath, fn))
    py_files.append(os.path.join(ROOT, "Industrial_Visualizer", "gui_main.py"))

    used = set()
    for path in py_files:
        used |= extract_tr_literals(path)

    keys = set(translations._STRINGS.keys())
    missing = used - keys
    unused = keys - used

    problems = 0
    if missing:
        problems += 1
        print(f"[FAIL] {len(missing)} 词条被 tr() 引用但字典缺失:")
        for k in sorted(missing):
            print(f"    {k!r}")
    if unused:
        print(f"[INFO] {len(unused)} 词条在字典中但代码未引用（可能被变量间接引用）:")
        for k in sorted(unused)[:20]:
            print(f"    {k!r}")

    if problems == 0:
        print(f"[OK] 静态校验通过: {len(used)} 个 tr() 引用全部有词条")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
