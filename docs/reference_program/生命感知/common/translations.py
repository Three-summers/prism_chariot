"""中英双语翻译表与查询。

用法（UI 文本一律用裸 tr() 包裹，禁用 self.tr() —— QObject 自带 tr 不查本表）：
    from translations import tr
    self.comBox = QGroupBox(tr("Connect to COM Ports"))
    self.frameNumDisplay.setText(tr("Frame: {}").format(n))

约束：本模块为纯标准库，不得 import Qt 或任何项目模块，
保证 gui_main 在创建 QApplication 前可调用 set_language。
"""

import logging

log = logging.getLogger(__name__)

# 语言: 'en' | 'zh'
_LANG = "en"

# 查表未命中的词条（用于漏翻校验）
_MISSING = set()

# 翻译表：key = 英文原文（含 format 占位符的整串），value = 中文
_STRINGS = {
    # --- gui_core ---
    "Connect to COM Ports": "连接串口",
    "Configuration": "配置",
    "Replay": "回放",
    "Pause": "暂停",
    "ERROR": "错误",
    "Tabs": "标签页",
    "Device:": "设备:",
    "CLI COM:": "CLI 串口:",
    "DATA COM:": "数据串口:",
    "Demo:": "Demo:",
    "Connect": "连接",
    "Reset Connection": "重置连接",
    "Not Connected": "未连接",
    "Connected": "已连接",
    "Unable to Connect": "无法连接",
    "Save Data to File": "保存数据到文件",
    "Select Configuration": "选择配置",
    "Start and Send Configuration": "启动并发送配置",
    "Start without Send Configuration": "启动（不发送配置）",
    "Send sensorStop Command": "发送 sensorStop 命令",
    "Stop sensor (only works if lowPowerCfg is 0)": "停止传感器（仅在 lowPowerCfg 为 0 时有效）",
    "&File": "文件(&F)",
    "&Playback": "回放(&P)",
    "&Help": "帮助(&H)",
    "Log Terminal Output to File": "将终端输出保存到文件",
    "Load and Replay": "加载并回放",
    "Visualizer User Guide": "可视化器用户指南",
    "Open Replay JSON File": "打开回放 JSON 文件",
    "Open .cfg File": "打开 .cfg 文件",
    "Unable to open the Visualizer User Guide": "无法打开可视化器用户指南",
    "Ensure that the device is in the proper SOP mode after flashing the correct binary, and that the cfg you are sending is valid": "请确保烧录正确的固件后设备处于正确的 SOP 模式，且发送的配置有效",
    "Language:": "语言:",
    "English": "English",
    "中文": "中文",
    "Industrial Visualizer": "工业毫米波雷达可视化器",
    "Applications Visualizer": "应用可视化器",
    "Replay Mode": "回放模式",

    # --- demo 名称（demo_defines DEMO_*） ---
    "x843 Out of Box Demo": "x843 开箱演示",
    "x432 Out of Box Demo": "x432 开箱演示",
    "x844 Out of Box Demo": "x844 开箱演示",
    "3D People Tracking": "3D 人员追踪",
    "Vital Signs with People Tracking": "生命体征与人员追踪",
    "Long Range People Detection": "远距离人员检测",
    "Mobile Tracker": "移动目标追踪",
    "Small Obstacle Detection": "小障碍物检测",
    "Gesture Recognition": "手势识别",
    "Surface Classification": "地表分类",
    "Level Sensing": "液位感知",
    "True Ground Speed": "真实地速",
    "Kick to Open": "踢开检测",
    "Calibration": "校准",
    "Exterior Intrusion Monitoring": "外部入侵监控",
    "Bike Radar": "自行车雷达",
    "Video Doorbell": "视频门铃",
    "Intruder Detection": "入侵检测",

    # --- gesture_recognition ---
    "Power Plot": "功耗图",
    "Power Usage (mW)": "功耗 (mW)",
    "Status": "状态",
    "Gesture Mode": "手势模式",
    "Send Configuration File": "发送配置文件",
    "Data Plot": "数据图",
    "Presence Magnitude": "存在幅度",
    "Doppler Average": "多普勒平均",
    "Undefined": "未定义",
    "Info": "信息",
    "Statistics": "统计",
    "Frame: {}": "帧: {}",
    "Plot Time: {} ms": "绘图时间: {} ms",
    "Average Power: {} mW": "平均功耗: {} mW",
    "Searching for Presence": "正在搜索存在",
    "Low Power Mode": "低功耗模式",
    "Presence Threshold Value": "存在阈值",
    "Near Range (0.05-0.3m)": "近距离 (0.05-0.3m)",
    "Fixed Distance (2m)": "固定距离 (2m)",
    "Perform gestures at a range of 0.05-0.3m directly in front of the radar.": "请在雷达正前方 0.05-0.3m 范围内做手势。",
    "Stand 2m away, directly in front of the radar.": "请站在雷达正前方 2m 处。",
    "No Gesture": "无手势",
    "Left-to-Right": "从左到右",
    "Right-to-Left": "从右到左",
    "Up-to-Down": "从上到下",
    "Down-to-Up": "从下到上",
    "Push": "推",
    "Pull": "拉",
    "CW Twirl": "顺时针旋转",
    "CCW Twirl": "逆时针旋转",
    "Shine": "闪光",

    # --- kick_to_open ---
    "Average Power Usage:": "平均功耗:",
    "--.-- mW": "--.-- mW",
    "Please allow 15 seconds after mode switch for power to settle": "模式切换后请等待 15 秒让功耗稳定",
    "Presence Plot": "存在图",
    "Presence Threshold": "存在阈值",
    "Searching for presence between 0.25 and 2.25 m": "正在搜索 0.25 至 2.25 m 范围内的存在",
    "{} mW": "{} mW",
    "Gesture Detected": "检测到手势",
    "Waiting for Kick": "等待踢动",
    "Kick inside ROI": "ROI 内踢动",
    "Kick outside ROI": "ROI 外踢动",
    "Kick": "踢动",

    # --- people_tracking / video_doorbell / ebikes ---
    "Points: {}": "点数: {}",
    "Targets: {}": "目标数: {}",
    "Average Power: N/A": "平均功耗: 无",
    "Measured Power: Calculating...": "测量功耗: 计算中...",
    "Plot Controls": "绘图控制",
    "SNR": "信噪比",
    "Height": "高度",
    "Doppler": "多普勒",
    "Associated Track": "关联目标",
    "Color Points By:": "点着色方式:",
    "Enable Fall Detection": "启用跌倒检测",
    "# of Persistent Frames": "持续帧数",
    "Detect Falls": "检测跌倒",
    "Snap to 2D": "吸附到 2D",
    "Fall Detection Sensitivity": "跌倒检测灵敏度",
    "Less Sensitive": "较不灵敏",
    "More Sensitive": "较灵敏",
    "tid : {}, height : {} m": "tid : {}，高度 : {} m",
    " FALL DETECTED": " 检测到跌倒",
    "Speed: {}": "速度: {}",
    "Detected Speed: {} m/s": "检测速度: {} m/s",
    "2D Plot": "2D 图",
    "Mode Switch Status": "模式切换状态",
    "Two Pass Mode Disabled": "双通模式已禁用",
    "Clear Detection Table": "清空检测表",
    "Detection Stats": "检测统计",
    "Detection Range": "检测距离",
    "Power Consumption Report": "功耗报告",
    "False Alarm Report": "误报报告",
    "Mode 1 Detection Range :": "模式 1 检测距离 :",
    "Mode 2 Detection Range :": "模式 2 检测距离 :",
    "Mode 3 Detection Range :": "模式 3 检测距离 :",
    "Range (m)": "距离 (m)",
    "Angle (degrees)": "角度（度）",
    "X Position (m)": "X 位置 (m)",
    "Y Position (m)": "Y 位置 (m)",
    "Frame Num": "帧号",
    "Camera On": "相机开启",
    "Camera ON": "相机开启",
    "First Pass Mode": "第一通模式",
    "Second Pass Mode": "第二通模式",
    "Third Pass Mode": "第三通模式",

    # --- vital_signs ---
    "Vital Signs": "生命体征",
    "Patient Status:": "患者状态:",
    "Breath Rate:": "呼吸频率:",
    "Heart Rate:": "心率:",
    "Range Bin:": "距离单元:",
    "N/A": "无",
    "Updating": "更新中",
    "No Patient Detected": "未检测到患者",
    "Presence": "存在",
    "Holding Breath": "屏气中",

    # --- surface_classification ---
    "<b>Grass Classification</b><br>": "<b>地表分类</b><br>",
    "<b>Grass Probability</b><br>": "<b>草地概率</b><br>",
    "<b>Grass Classification Value</b><br>": "<b>地表分类值</b><br>",
    "Not Grass": "非草地",
    "Grass": "草地",
    "Physical Setup": "物理设置",
    "<p style=\"font-size: 20px;color: white\">Relative Frame # (0 is most recent)</p>": "<p style=\"font-size: 20px;color: white\">相对帧号（0 为最近）</p>",
    "<p style=\"font-size: 20px;color: white\">Grass Probability Value</p>": "<p style=\"font-size: 20px;color: white\">草地概率值</p>",
    "<p style=\"font-size: 30px;color: white\">Probability Value over Time</p>": "<p style=\"font-size: 30px;color: white\">概率随时间变化</p>",
    """
        <p style="font-size: 30px"><b>Sensor Setup:</b></p><p style="font-size: 20px">18cm off the ground with 27 degree tilt off the vertical</p>
        <p style="font-size: 30px"><b>Model:       </b></p><p style="font-size: 20px">Sequential model trained on grass and large stone pavers</p>
        <p style="font-size: 30px"><b>More info:   </b></p><p style="font-size: 20px">See User Guide in the Radar Toolbox on dev.ti.com       </p>
        """: """
        <p style="font-size: 30px"><b>传感器设置:</b></p><p style="font-size: 20px">距地面 18cm，偏离垂直方向 27 度倾斜</p>
        <p style="font-size: 30px"><b>模型:</b></p><p style="font-size: 20px">基于草地和大型石板训练的时序模型</p>
        <p style="font-size: 30px"><b>更多信息:</b></p><p style="font-size: 20px">参见 dev.ti.com 的 Radar Toolbox 用户指南</p>
        """,

    # --- true_ground_speed ---
    "True Ground Speed": "真实地速",
    "{0:.2f} m/s": "{0:.2f} m/s",
    "{0:.2f} mph": "{0:.2f} mph",

    # --- dashcam ---
    "3D Plot": "3D 图",
    "Video Camera Status": "视频相机状态",
    "camera off": "相机关闭",
    "Camera Timeout (seconds)": "相机超时（秒）",
    "Track {}: Distance: {}": "目标 {}: 距离: {}",
    "Track {}: buf {}: yval {}": "目标 {}: buf {}: yval {}",

    # --- out_of_box_x432 ---
    "Unknown Label": "未知标签",
    "Non-Human": "非人类",
    "Human": "人类",

    # --- calibration ---
    "Range Plot": "距离图",
    "Place Peak in Calibration Zone": "请将峰值放置在校准区域",

    # --- intruder_detection ---
    "Intruder Detection": "入侵检测",
    "Processing Time: {} ms": "处理时间: {} ms",

    # --- plot_1d ---
    "Frames": "帧",
    "Occupancy Signals": "占用信号",
    "Major Range Profile": "主距离剖面",
    "Minor Range Profile": "次距离剖面",
    "Range Profile DISABLED": "距离剖面已禁用",

    # --- power_consumption_report ---
    "Power Consumption Over Time": "功耗随时间变化",
    "Measured Power Consumption (mW)": "实测功耗 (mW)",
    "Time (seconds) ": "时间（秒） ",
    "Power Consumption Stats": "功耗统计",
    "Average Power :": "平均功耗 :",
    "Max Power :": "最大功耗 :",
    "Min Power :": "最小功耗 :",

    # --- false_alarm_test ---
    "False Alarm Stats": "误报统计",
    "False Alarm Locations": "误报位置",
    "Mode 1": "模式 1",
    "Mode 2": "模式 2",
    "Mode 3": "模式 3",
    "% of time in mode": "在该模式的时间百分比",
    "# of times mode entered": "进入该模式的次数",

    # --- level_sensing ---
    "Object 1 in meters : ": "物体 1 距离（米）: ",
    "Object 2 in meters : ": "物体 2 距离（米）: ",
    "Object 3 in meters : ": "物体 3 距离（米）: ",
    "Object 1 power in dB : ": "物体 1 功率（dB）: ",
    "Object 2 power in dB : ": "物体 2 功率（dB）: ",
    "Object 3 power in dB : ": "物体 3 功率（dB）: ",
    "Power in mW: ": "功率（mW）: ",
    "Peak No": "峰值序号",
    "Distance in meters": "距离（米）",
    "Distance in Meters": "距离（米）",
    "Frame Number": "帧号",
    "Peak Movement over time": "峰值随时间移动",
    "Level Sensing": "液位感知",
    "Note : Peaks are ordered based on their relative power. Peak with the highest relative power is designated as Peak 1": "注：峰值按相对功率排序，相对功率最高的峰记为峰值 1",
}


def set_language(lang):
    """切换界面语言：'en' 或 'zh'。未知值忽略并告警。"""
    global _LANG
    if lang not in ("en", "zh"):
        log.warning("tr(): unknown language %r, keeping %r", lang, _LANG)
        return
    _LANG = lang


def get_language():
    return _LANG


def tr(s):
    """翻译英文 UI 字符串。缺词条回退原文并记入 _MISSING（便于校验）。"""
    if _LANG == "en":
        return s
    zh = _STRINGS.get(s)
    if zh is None:
        _MISSING.add(s)
        return s
    return zh
