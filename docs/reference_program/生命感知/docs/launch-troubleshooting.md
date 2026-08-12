# 启动故障排查记录：PySide2 在 WSL2 上的 malloc 堆损坏崩溃

> 日期：2026-08-03
> 结论：`malloc(): unsorted double linked list corrupted` 由 PySide2 5.15.2.1 + Mesa GLX/swrast 混合路径在 WSL2 上引起，`LIBGL_ALWAYS_SOFTWARE=1` 强制纯 llvmpipe 软件渲染可绕过。

---

## 1. 环境

| 项 | 值 |
|---|---|
| 系统 | WSL2（Ubuntu 22.04.5 LTS，内核 6.6.87.2-microsoft-standard-WSL2） |
| glibc | 2.35（0ubuntu3.14） |
| Python | 3.9.23（uv 独立构建，位于 `.venv/`） |
| uv | 0.8.22 |
| 关键依赖 | PySide2==5.15.2.1、pyqtgraph==0.11.0、numpy==1.19.4 |
| 显示 | DISPLAY=:0（WSLg 可用，但 `/usr/lib/wsl/lib/` 无 GL 库，仅 NVIDIA CUDA 库） |

## 2. 问题现象

```bash
uv run Industrial_Visualizer/gui_main.py
```

从项目根目录运行报 `ModuleNotFoundError: No module named 'gui_core'`；
`cd Industrial_Visualizer` 后运行则崩溃：

```
malloc(): unsorted double linked list corrupted
```

退出码 134（SIGABRT），无 Python traceback。

## 3. 排查时间线

### 3.1 确认 uv run 使用的解释器

```bash
uv run python -c "import sys; print(sys.executable)"
# → /home/say/code/project/Applications_Visualizer/.venv/bin/python3（3.9.23）✓
```

命令形式正确，问题不在环境选择。

### 3.2 第一个错误：工作目录假设

`gui_main.py:7` 硬编码相对路径：

```python
sys.path.insert(1, '../common')
```

该路径相对**当前工作目录**解析。从项目根运行 → `../common` 指向项目根的上层 → `from gui_core import Window` 找不到模块。
**推论：必须 `cd Industrial_Visualizer` 后运行**（与脚本注释一致）。

### 3.3 第二个错误：GL 相关崩溃（无 traceback）

`cd Industrial_Visualizer` 后运行：`malloc(): unsorted double linked list corrupted`，exit 134。

初步判断：
- 检查 `DISPLAY=:0` 存在（WSLg），用 `QT_QPA_PLATFORM=offscreen` 重跑**仍崩溃** → 与显示环境无关；
- 该报错是 glibc 检测到**堆已被破坏**（`_int_malloc` 校验失败），真正的破坏者另有其人；
- 常见嫌疑：glibc 2.34+ 与 Qt 5.15.2 的兼容性。**但先排除此假设**（见 3.4）。

### 3.4 最小重现：PySide2 本身正常

```bash
uv run python -c "
from PySide2.QtWidgets import QApplication
import sys
app = QApplication(sys.argv)
print('OK')"
# → OK
```

PySide2 导入与 QApplication 构造均正常 → 崩溃发生在更深的初始化链。

### 3.5 二分定位（导入链 → 构造链）

按 `gui_main.py` 的依赖逐层测试（每步独立进程）：

1. `from gui_core import Window`（import 链）→ **通过**
2. `import plot_1d/plot_2d/plot_3d` → 通过
3. `QApplication + Window(...)` 构造 → **崩溃**（确认在构造阶段）
4. `Core()` 构造（18 个 demo 类 + QSlider 等）→ **崩溃**
5. `CachedDataType`、`UARTParser` 单独构造 → 通过
6. 18 个 demo 类**全量在同一进程构造**（不 import plot 模块）→ **通过**
7. `import plot_1d` 之后再 `Core()` → **必崩**（plot 模块导入后的累积堆损坏）

**推论：崩溃 = plot 模块（pyqtgraph 体系）导入后 + demo 类构造 GL 对象时的组合效应。**

### 3.6 教训：stdout 缓冲会掩盖崩溃前的输出

初期观察不到崩溃步骤，怀疑崩溃发生在 import 阶段。实测 `from gui_core import Core` 单独导入成功。

原因：Python 在管道模式下 stdout 是**块缓冲**，SIGABRT 时未刷新的缓冲丢失。用 `uv run python -u`（无缓冲）重测，确认崩溃点打印为 `constructing Core...` 之后 → **崩溃在 `Core()` 构造**。

### 3.7 gdb backtrace 定位崩溃栈

```bash
gdb -batch -ex run -ex bt --args .venv/bin/python /tmp/repro_core.py
```

关键帧（C 层）：

```
#8  __libc_calloc ... 
#9  ?? () from /usr/lib/x86_64-linux-gnu/dri/swrast_dri.so     ← Mesa 软件光栅化器
#21 ffi_call_unix64 ()
#24 _ctypes_callproc ()                                          ← Python ctypes 调用
```

- 崩溃发生在 Mesa **swrast_dri.so** 的 calloc → 有 GL 上下文被创建并走软件渲染；
- Python 侧是 ctypes 调用（pyqtgraph.opengl / OpenGL 的调用路径）。

补充证据：
- `ldconfig -p | grep libGL` → `libGL.so.1` 来自系统 Mesa（`/lib/x86_64-linux-gnu/`）；
- `/usr/lib/wsl/lib/` 只有 CUDA 库，**没有** WSLg 的 `libGL.so.1`/`libEGL.so.1` → GL 只能走 Mesa 软件渲染；
- 项目代码大量 `import pyqtgraph.opengl`（`GLViewWidget`，见 `Demo_Classes/`、`Common_Tabs/plot_2d/3d.py`、`gl_text.py`）。

### 3.8 workaround 矩阵

以「import plot_1d + Core()」稳定复现脚本测试各环境变量：

| 环境变量 | 结果 |
|---|---|
| `QT_OPENGL=software` | 崩溃 |
| `LIBGL_ALWAYS_SOFTWARE=1` | **通过** |
| `MESA_GL_VERSION_OVERRIDE=3.3` | 崩溃 |
| `GALLIUM_DRIVER=llvmpipe` | **通过** |
| `QT_XCB_GL_INTEGRATION=none` | 通过（但 Qt 禁用了 GL 上下文，打印警告，3D 视图无内容） |

**有效 workaround：`LIBGL_ALWAYS_SOFTWARE=1`**（强制 GL 完全走 llvmpipe 软件路径，避免 GLX+swrast 混合路径的堆损坏）。

### 3.9 完整启动验证

```bash
cd Industrial_Visualizer && timeout 12 env LIBGL_ALWAYS_SOFTWARE=1 uv run gui_main.py
```

无崩溃、无报错，GUI 进入事件循环直到 timeout 被杀 → 启动成功。

## 4. 根因分析

- 项目大量使用 `pyqtgraph.opengl`（GLViewWidget 基于 QtOpenGL/QGLWidget）；
- WSL2 无 GPU GL 直通，Qt 通过 Mesa 的 **GLX 初始化 + swrast（软光栅）** 混合路径创建 GL 上下文；
- 该混合路径在 PySide2 5.15.2.1（Qt 5.15.2）下产生堆破坏（越界写），直到后续某次 malloc 才暴露；
- `LIBGL_ALWAYS_SOFTWARE=1` 让 libGL 全程使用 llvmpipe 单一路径，规避混合路径的破坏。

## 5. 解决方案（已落地）

| 文件 | 作用 |
|---|---|
| `pyproject.toml` | 新建；固化 6 个依赖（`requires-python = ">=3.9,<3.10"`），给 uv 定义项目根 |
| `.env` | `LIBGL_ALWAYS_SOFTWARE=1`（附原因注释） |
| `run.sh` | 一键启动：自动 `cd Industrial_Visualizer` + `uv run --env-file ../.env gui_main.py`，已验证 |

正确运行方式：

```bash
./run.sh                                    # 一键（推荐）
# 或手动：
cd Industrial_Visualizer
LIBGL_ALWAYS_SOFTWARE=1 uv run gui_main.py
```

注意：uv 0.8.22 **不会自动加载 `.env`**（实测 `TEST_VAR` 读不到），必须显式 `--env-file`。

## 6. 经验教训

1. **无 traceback 的崩溃先用最小重现二分**：从可工作的最小片段逐步放大，或用 gdb 拿 C 栈；
2. **stdout 块缓冲会吞掉崩溃前的打印**：诊断崩溃点用 `python -u` 或 `flush=True`；
3. **glibc 的 malloc 报错是"结果"不是"原因"**：堆破坏者先发生，malloc 只是碰巧在下一处分配时校验失败——backtrace 里 `_int_malloc` 之上的帧才是线索；
4. **WSL2 上 GUI/OpenGL 类问题先检查 `ldconfig -p | grep libGL` 与 `/usr/lib/wsl/lib/`**：确认是否有 GPU 直通，缺 GL 库时大概率走 Mesa 软渲染，优先试 `LIBGL_ALWAYS_SOFTWARE=1`；
5. **环境变量 workaround 逐个低成本尝试**（矩阵测试），比继续深挖 C 层更快见效。

## 7. 快速复现命令

```bash
# 最小崩溃复现（需先创建好 .venv 并安装依赖）
uv run python -u -c "
import sys
sys.path.insert(1, 'common')
from PySide2.QtWidgets import QApplication
app = QApplication(sys.argv)
from Common_Tabs.plot_1d import Plot1D
from gui_core import Core
c = Core()          # 无 LIBGL_ALWAYS_SOFTWARE 时在此崩溃
"

# workaround 验证
LIBGL_ALWAYS_SOFTWARE=1 uv run python -u -c "..."   # 通过

# gdb 拿 C 层 backtrace
gdb -batch -ex run -ex bt --args .venv/bin/python <repro_script.py>
```
