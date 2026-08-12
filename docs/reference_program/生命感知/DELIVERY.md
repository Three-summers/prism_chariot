# Industrial Visualizer — 目标机部署说明

打包产物：`dist/IndustrialVisualizer`（单文件，~96 MB，自包含 Python 3.11 / PySide6 6.11 / pyqtgraph 0.14 / numpy 2.4 等全部依赖）。

## 目标机要求

- **系统**：Ubuntu 24.04 LTS（x86_64），glibc ≥ 2.35
- **GPU**：任意支持 OpenGL 2.1+ 的环境（本目标机 RTX 5090 + NVIDIA 驱动 595.71 已满足，硬件 GL 直用）

## 部署步骤

```bash
# 1. 拷贝产物到可写目录（建议家目录；程序会在启动目录写入 cache/、binData/、logfile）
cp dist/IndustrialVisualizer ~/ && chmod +x ~/IndustrialVisualizer

# 2. 如目标机缺 Qt 6 的 X11 依赖（首次启动报 "no Qt platform plugin" 时安装）
sudo apt install libxcb-cursor0 libxkbcommon-x11-0

# 3. 启动（GNOME Xorg 桌面会话内）
~/IndustrialVisualizer
```

## 串口自动嗅探（Windows / WSL2 / Linux）

CLI/DATA 串口自动识别逻辑（`gui_core.py` 的 `sniffCliDataPorts`）：

1. **描述匹配（大小写不敏感）**：XDS110（Application/User UART → CLI，Auxiliary Data Port → DATA）、SiLabs CP210x（Enhanced → CLI，Standard → DATA）。Linux 驱动返回的描述（如 "Enhanced Com Port"）与 Windows（"Enhanced COM Port"）大小写不同，旧版精确匹配在 Linux 下会失效——新版已修复
2. **VID/PID + 适配器分组兜底**：Linux 下 cdc_acm 设备（如 XDS110）描述常为空，按 USB 适配器（VID+PID+序列号）分组、组内按设备节点排序，第一个 = CLI、第二个 = DATA

识别结果自动填入串口下拉框；下拉框列出系统全部串口（含描述），也可手动输入。usbipd 映射的 Windows 串口在 WSL2 中呈现为 `/dev/ttyUSB*`（CP210x）或 `/dev/ttyACM*`（XDS110/cdc_acm），直接选择即可。

## 语言切换（中/英）

连接面板底部新增"语言"下拉框（English / 中文），切换立即生效并自动保存，下次启动沿用。

- 界面所有静态文本、菜单、对话框、demo 动态文本（点数/目标数/帧号/状态提示等）均已双语
- 切换会重建当前 demo 界面（滑块/勾选框等控件状态复位，与切换 demo 行为一致）
- 语言偏好持久化于 `cache/cachedData.txt` 第 5 行
- 开发提醒：UI 文本一律用 `tr()`（来自 `common/translations.py`），**禁用 `self.tr()`**（QObject 自带 tr 不查翻译表）；新词条加到 `_STRINGS`，用 `uv run python tools/check_i18n.py` 静态校验漏翻

## 注意事项

| 项 | 说明 |
|---|---|
| **勿设** `LIBGL_ALWAYS_SOFTWARE=1` | 该变量是 WSL2 下 Mesa 软件渲染的专属 workaround；RTX 5090 用硬件 GL，设置了反而强制软件渲染 |
| 从可写目录启动 | "Log Terminal Output to File" 会在 CWD 写 logfile；只读目录（如 /opt）会导致该功能崩溃 |
| 首次启动约 2–5 秒 | onefile 模式启动时解压到 /tmp（约 240 MB 空间），之后无影响 |
| 连接雷达 | 与源码版流程一致：选择 .cfg 文件 → 选/填串口 → Connect。串口输入框是**下拉框**（列出全部串口并自动嗅探 CLI/DATA），也可手动输入 |
| sensorStop / boardReset | `xds110reset` 是 TI CCS 的 Windows 工具，Linux 目标机上 boardReset 不可用（仅日志 warning，不影响其他功能） |
| Dark 模式 | `./IndustrialVisualizer dark` |

## 排障

```bash
# Qt 平台插件加载诊断
QT_DEBUG_PLUGINS=1 ./IndustrialVisualizer

# 无图形界面环境（ssh 会话等）不适用——需要 X/Wayland 桌面会话
```

## 重新打包（在构建机执行）

```bash
# 构建机：WSL2 Ubuntu 22.04，项目根目录
uv add --dev "pyinstaller>=6.21,<7"          # 一次性
uv run pyinstaller --noconfirm --clean IndustrialVisualizer.spec            # onefile 正式版
PYI_MODE=onedir uv run pyinstaller --noconfirm --clean IndustrialVisualizer.spec   # onedir 调试版
```

产物位于 `dist/`。构建机 glibc 2.35 的产物可运行于 glibc ≥ 2.35 的系统（含 24.04）；反向（高版本构建低版本跑）不行。
