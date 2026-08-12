# General Library Imports
import json
import time
from serial.tools import list_ports
import os
import subprocess
import sys
from contextlib import suppress

# PyQt Imports
from PySide6 import QtGui
from PySide6.QtCore import QTimer, Qt, QUrl
from PySide6.QtGui import QKeySequence, QAction, QShortcut
from PySide6.QtWidgets import (
    QTabWidget,
    QGridLayout,
    QMenu,
    QGroupBox,
    QLineEdit,
    QLabel,
    QPushButton,
    QComboBox,
    QFileDialog,
    QMainWindow,
    QWidget,
    QSlider,
    QCheckBox,
    QMessageBox
)

# Local Imports
from cached_data import CachedDataType
from demo_defines import *
from gui_common import resource_path
from gui_threads import *
from parseFrame import parseStandardFrame
from translations import tr, set_language, get_language

from Common_Tabs.plot_1d import Plot1D
from Common_Tabs.plot_2d import Plot2D
from Common_Tabs.plot_3d import Plot3D

from Demo_Classes.surface_classification import SurfaceClassification
from Demo_Classes.people_tracking import PeopleTracking
from Demo_Classes.gesture_recognition import GestureRecognition
from Demo_Classes.level_sensing import LevelSensing
from Demo_Classes.small_obstacle import SmallObstacle
from Demo_Classes.out_of_box_x843 import OOBx843
from Demo_Classes.out_of_box_x432 import OOBx432
from Demo_Classes.out_of_box_x844 import OOBx844
from Demo_Classes.true_ground_speed import TrueGroundSpeed
from Demo_Classes.long_range_pd import LongRangePD
from Demo_Classes.mobile_tracker import MobileTracker
from Demo_Classes.kick_to_open import KickToOpen
from Demo_Classes.calibration import Calibration
from Demo_Classes.vital_signs import VitalSigns
from Demo_Classes.dashcam import Dashcam
from Demo_Classes.ebikes_x432 import EBikes
from Demo_Classes.video_doorbell import VideoDoorbell
from Demo_Classes.intruder_detection import IntruderDetection

# Logger
import logging
log = logging.getLogger(__name__)


def sniffCliDataPorts(serialPorts):
    """嗅探 CLI 与 DATA 串口（Windows/Linux 兼容）。

    返回 (cliDevice, dataDevice)；未识别到的为 None。
    匹配优先级：
      1. 描述匹配（大小写不敏感）——覆盖 Windows "COM" 全大写描述与
         Linux 下 cp210x 驱动的 "Com Port" 描述，以及 XDS110 的 UART 描述
      2. 兜底（Linux 下 cdc_acm 描述常为空）——按 USB 适配器（vid+pid+序列号）
         分组，组内按设备名排序：第一个 = CLI，第二个 = DATA
         （XDS110 枚举顺序: ttyACM0 = Application/User UART, ttyACM1 = Auxiliary Data Port）
    """
    xds_cli = CLI_XDS_SERIAL_PORT_NAME.lower()  # 'xds110 class application/user uart'
    xds_data = DATA_XDS_SERIAL_PORT_NAME.lower()
    sil_cli = CLI_SIL_SERIAL_PORT_NAME.lower()  # 'enhanced com port'
    sil_data = DATA_SIL_SERIAL_PORT_NAME.lower()

    cli = data = None
    for p in serialPorts:
        desc = (p.description or "").lower()
        if xds_cli in desc or sil_cli in desc:
            cli = p.device
        elif xds_data in desc or sil_data in desc:
            data = p.device

    # 兜底：按 USB 适配器分组（Linux 下 cdc_acm/无描述设备）
    if cli is None or data is None:
        groups = {}
        for p in serialPorts:
            if p.vid is None or p.pid is None:
                continue
            loc = ""
            if "LOCATION=" in (p.hwid or ""):
                loc = p.hwid.split("LOCATION=")[-1]
            key = (p.vid, p.pid, p.serial_number or loc)
            groups.setdefault(key, []).append(p)
        for ports in groups.values():
            if len(ports) < 2:
                continue
            ordered = sorted(ports, key=lambda p: p.device)
            if cli is None:
                cli = ordered[0].device
            if data is None:
                data = ordered[1].device

    return cli, data


def comboDevice(combo):
    """取端口下拉框的 device 值：当前文本匹配列表项时返回其 itemData（原始设备名），
    否则返回编辑文本（用户手动输入；可编辑模式下 currentData 不会随新文本更新）。"""
    text = combo.currentText().strip()
    idx = combo.findText(text)
    if idx >= 0:
        dev = combo.itemData(idx)
        if dev:
            return dev
    return text


class Window(QMainWindow):
    def __init__(self, parent=None, size=[], title="Applications Visualizer"):
        super(Window, self).__init__(parent)

        self.core = Core()
        self.connected = False  # 连接状态标志（retranslateMainUI 依据它重设状态文本）
        self._title = title
        self.setWindowIcon(QtGui.QIcon(resource_path("images/logo.png")))

        self.shortcut = QShortcut(QKeySequence("Ctrl+W"), self)
        self.shortcut.activated.connect(self.close)

        # Set the layout
        # Create tab for different graphing options
        self.demoTabs = QTabWidget()

        self.gridLayout = QGridLayout()

        # Add connect options
        self.initConfigPane()
        self.initConnectionPane()

        self.gridLayout.addWidget(self.comBox, 0, 0, 1, 1)
        self.gridLayout.addWidget(self.configBox, 1, 0, 1, 1)
        self.gridLayout.addWidget(self.demoTabs, 0, 1, 8, 1)

        self.core.sl.setMinimum(0)
        self.core.sl.setMaximum(30)
        self.core.sl.setValue(20)
        self.core.sl.setTickPosition(QSlider.TickPosition.TicksBelow)
        self.core.sl.setTickInterval(5)

        self.replayBox = QGroupBox(tr("Replay"))
        self.replayLayout = QGridLayout()
        self.replayLayout.addWidget(self.core.sl, 0, 0, 1, 1)
        self.replayBox.setLayout(self.replayLayout)
        self.replayBox.setVisible(False)
        self.gridLayout.addWidget(self.replayBox, 8, 0, 1, 2)

        self.gridLayout.setColumnStretch(0, 1)
        self.gridLayout.setColumnStretch(1, 5)

        self.central = QWidget()
        self.central.setLayout(self.gridLayout)

        self.setWindowTitle(tr(title))
        self.initMenuBar()
        self.core.replay = False

        self.setCentralWidget(self.central)

        self.showMaximized()

    def initMenuBar(self):
        menuBar = self.menuBar()
        # Creating menus using a QMenu object
        # 注意：菜单必须存为 self.*，retranslateMainUI 需要重设标题
        self.fileMenu = QMenu(tr("&File"), self)
        self.playbackMenu = QMenu(tr("&Playback"), self)
        self.helpMenu = QMenu(tr("&Help"), self)

        self.logOutputAction = QAction(tr("Log Terminal Output to File"), self)
        self.playbackAction = QAction(tr("Load and Replay"), self)
        self.helpAction = QAction(tr("Visualizer User Guide"), self)

        self.playbackAction.triggered.connect(self.loadForReplay)
        self.playbackAction.setCheckable(True)
        self.logOutputAction.triggered.connect(self.toggleLogOutput)
        self.logOutputAction.setCheckable(True)
        self.helpAction.triggered.connect(self.openUserGuide)

        self.playbackMenu.addAction(self.playbackAction)
        self.fileMenu.addAction(self.logOutputAction)
        self.helpMenu.addAction(self.helpAction)
        menuBar.addMenu(self.fileMenu)
        menuBar.addMenu(self.playbackMenu)
        menuBar.addMenu(self.helpMenu)

    def loadForReplay(self, state):
        if (state):
            self.recordAction.setChecked(False)
            self.core.replayFile = QFileDialog.getOpenFileName(self, tr('Open Replay JSON File'), '.',"JSON Files (*.json)")
            self.core.replay = True
            self.core.loadForReplay(True)

            # Disable COM Ports/Device/Demo/Config/Language
            self.demoList.setEnabled(False)
            self.deviceList.setEnabled(False)
            self.cliCom.setEnabled(False)
            self.dataCom.setEnabled(False)
            self.connectButton.setEnabled(False)
            self.filename_edit.setEnabled(False)
            self.selectConfig.setEnabled(False)
            self.sendConfig.setEnabled(False)
            self.languageCombo.setEnabled(False)
            self.start.setEnabled(True)
            self.start.setText(tr("Replay"))

            self.replayBox.setVisible(True)
        else:
            self.core.replay = False

            # Disable COM Ports/Device/Demo/Config
            self.demoList.setEnabled(True)
            self.deviceList.setEnabled(True)
            self.cliCom.setEnabled(True)
            self.dataCom.setEnabled(True)
            self.connectButton.setEnabled(True)
            self.filename_edit.setEnabled(True)
            self.selectConfig.setEnabled(True)
            self.sendConfig.setEnabled(True)
            self.languageCombo.setEnabled(True)
            self.start.setText(tr("Start without Send Configuration"))

            self.replayBox.setVisible(False)

    def toggleSaveData(self):
        if self.recordAction.isChecked():
            self.core.parser.setSaveBinary(True)
            self.core.cachedData.setCachedRecord("True")
        else:
            self.core.parser.setSaveBinary(False)
            self.core.cachedData.setCachedRecord("False")
        
        self.core.replay = False
        
        # Enable COM Ports/Device/Demo/Config
        self.demoList.setEnabled(True)
        self.deviceList.setEnabled(True)
        self.cliCom.setEnabled(True)
        self.dataCom.setEnabled(True)
        self.connectButton.setEnabled(True)
        self.filename_edit.setEnabled(True)
        self.selectConfig.setEnabled(True)
        self.start.setText(tr("Start without Send Configuration"))

    def toggleLogOutput(self):
        if (
            self.recordAction.isChecked()
        ):  # Save terminal output to logFile, set 0 to show terminal output
            ts = time.localtime()
            terminalFileName = str(
                "logfile_"
                + str(ts[2])
                + str(ts[1])
                + str(ts[0])
                + "_"
                + str(ts[3])
                + str(ts[4])
                + ".txt"
            )
            sys.stdout = open(terminalFileName, "w")
        else:
            sys.stdout = sys.__stdout__
    
    def openUserGuide(self):
        userGuideURL = QUrl('https://dev.ti.com/tirex/local?id=mmwave_applications_visualizer_user_guide&packageId=radar_toolbox')
        openUserGuide = QtGui.QDesktopServices.openUrl(userGuideURL)

        if not openUserGuide:
            QMessageBox.warning(self, tr('ERROR'), tr('Unable to open the Visualizer User Guide'))
            log.error("Unable to open the Visualizer User Guide")
    
    def initConnectionPane(self):
        self.comBox = QGroupBox(tr("Connect to COM Ports"))
        # 可编辑下拉框：列出全部串口供选择（防手填错误），也允许手动输入
        self.cliCom = QComboBox()
        self.dataCom = QComboBox()
        self.cliCom.setEditable(True)
        self.dataCom.setEditable(True)
        self.connectStatus = QLabel(tr("Not Connected"))
        self.connectButton = QPushButton(tr("Connect"))
        self.connectButton.clicked.connect(self.onConnect)
        self.demoList = QComboBox()
        self.deviceList = QComboBox()
        self.recordAction = QCheckBox(tr("Save Data to File"), self)

        # TODO Add replay support
        # demoList 存英文逻辑 key 于 itemData，显示翻译名（changeDemo 用 currentData() 取 key）
        for demoName in self.core.getDemoList():
            self.demoList.addItem(tr(demoName), demoName)
        self.demoList.currentIndexChanged.connect(self.onChangeDemo)
        self.deviceList.addItems(self.core.getDeviceList())
        self.deviceList.currentIndexChanged.connect(self.onChangeDevice)
        self.comLayout = QGridLayout()
        # 标签存 self.* 以便 retranslateMainUI 更新
        self.deviceLabel = QLabel(tr("Device:"))
        self.cliLabel = QLabel(tr("CLI COM:"))
        self.dataLabel = QLabel(tr("DATA COM:"))
        self.demoLabel = QLabel(tr("Demo:"))
        self.languageLabel = QLabel(tr("Language:"))
        self.languageCombo = QComboBox()
        # 语言名保持原样显示（English / 中文），不随语言变化
        self.languageCombo.addItems([tr("English"), tr("中文")])
        self.languageCombo.setCurrentIndex(0 if get_language() == "en" else 1)
        self.languageCombo.currentIndexChanged.connect(self.onLanguageChanged)
        self.comLayout.addWidget(self.deviceLabel, 0, 0)
        self.comLayout.addWidget(self.deviceList, 0, 1)
        self.comLayout.addWidget(self.cliLabel, 1, 0)
        self.comLayout.addWidget(self.cliCom, 1, 1)
        self.comLayout.addWidget(self.dataLabel, 2, 0)
        self.comLayout.addWidget(self.dataCom, 2, 1)
        self.comLayout.addWidget(self.demoLabel, 3, 0)
        self.comLayout.addWidget(self.demoList, 3, 1)
        self.comLayout.addWidget(self.connectButton, 4, 0)
        self.recordAction.stateChanged.connect(self.toggleSaveData)
        self.comLayout.addWidget(self.recordAction, 5, 0)
        self.comLayout.addWidget(self.connectStatus, 4, 1)
        self.comLayout.addWidget(self.languageLabel, 6, 0)
        self.comLayout.addWidget(self.languageCombo, 6, 1)

        self.comBox.setLayout(self.comLayout)
        self.demoList.setCurrentIndex(1)  # initialize this to a stable value
        self.demoList.setCurrentIndex(0)  # initialize this to a stable value

        # Find all Com Ports（Windows/Linux 兼容嗅探）
        serialPorts = list(list_ports.comports())

        # 下拉框填充全部串口（显示 "device (描述)"，itemData 存 device 供程序使用）
        for port in serialPorts:
            label = port.device if not port.description else f"{port.device} ({port.description})"
            self.cliCom.addItem(label, port.device)
            self.dataCom.addItem(label, port.device)

        # 自动嗅探 CLI/DATA 端口
        cliDev, dataDev = sniffCliDataPorts(serialPorts)
        if cliDev:
            log.info(f"CLI COM Port found: {cliDev}")
            idx = self.cliCom.findData(cliDev)
            if idx >= 0:
                self.cliCom.setCurrentIndex(idx)
            else:
                self.cliCom.setCurrentText(cliDev)
        if dataDev:
            log.info(f"Data COM Port found: {dataDev}")
            idx = self.dataCom.findData(dataDev)
            if idx >= 0:
                self.dataCom.setCurrentIndex(idx)
            else:
                self.dataCom.setCurrentText(dataDev)

        self.core.isGUILaunched = 1
        self.loadCachedData()

    def initConfigPane(self):
        self.configBox = QGroupBox(tr("Configuration"))
        self.selectConfig = QPushButton(tr("Select Configuration"))
        self.sendConfig = QPushButton(tr("Start and Send Configuration"))
        self.start = QPushButton(tr("Start without Send Configuration"))
        self.sensorStop = QPushButton(tr("Send sensorStop Command"))
        self.sensorStop.setToolTip(tr("Stop sensor (only works if lowPowerCfg is 0)"))
        self.filename_edit = QLineEdit()
        self.selectConfig.clicked.connect(lambda: self.selectCfg(self.filename_edit))
        self.sendConfig.setEnabled(False)
        self.start.setEnabled(False)
        self.sendConfig.clicked.connect(self.sendCfg)
        self.start.clicked.connect(self.startApp)
        self.sensorStop.clicked.connect(self.stopSensor)
        self.sensorStop.setHidden(True)
        self.configLayout = QGridLayout()
        self.configLayout.addWidget(self.filename_edit, 0, 0, 1, 1)
        self.configLayout.addWidget(self.selectConfig, 0, 1, 1, 1)
        self.configLayout.addWidget(self.sendConfig, 1, 0, 1, 2)
        self.configLayout.addWidget(self.start, 2, 0, 1, 2)
        self.configLayout.addWidget(self.sensorStop, 3, 0, 1, 2)
        # self.configLayout.addStretch(1)
        self.configBox.setLayout(self.configLayout)

    def displayErrorPopUp(self):
        # QMessageBox.critical() is a static helper that shows the dialog and
        # returns the clicked button; no extra .exec() call needed (Qt6)
        QMessageBox.critical(
                self,
                tr("ERROR"),
                tr("Ensure that the device is in the proper SOP mode after flashing the correct binary, and that the cfg you are sending is valid"))
    
    def loadCachedData(self):
        self.core.loadCachedData(
            self.demoList, self.deviceList, self.recordAction, self.gridLayout, self.demoTabs
        )

    # Callback function when device is changed
    def onChangeDevice(self):
        self.core.changeDevice(
            self.demoList, self.deviceList, self.gridLayout, self.demoTabs
        )
        self.core.updateCOMPorts(self.cliCom, self.dataCom)
        self.core.updateResetButton(self.sensorStop)

    # Callback function when demo is changed
    def onChangeDemo(self):
        self.core.changeDemo(
            self.demoList, self.deviceList, self.gridLayout, self.demoTabs
        )
        # When 2-Pass Video doorbell is the demo, you cannot send a cfg file over UART
        if(self.core.demo == DEMO_VIDEO_DOORBELL):
            self.sendConfig.setDisabled(True)
        else:
            self.sendConfig.setDisabled(False)

        # self.core.changeDevice(self.demoList, self.deviceList, self.gridLayout, self.demoTabs)

    # Callback function when connect button clicked
    def onConnect(self):
        if not self.connected:
            if self.core.connectCom(self.cliCom, self.dataCom, self.connectStatus) == 0:
                self.connected = True
                self.connectButton.setText(tr("Reset Connection"))
                # When 2-Pass Video doorbell is the demo, you cannot send a cfg file over UART
                if(self.core.demo == DEMO_VIDEO_DOORBELL):
                    self.sendConfig.setEnabled(False)
                else:
                    self.sendConfig.setEnabled(True)
                self.start.setEnabled(True)
            else:
                self.sendConfig.setEnabled(False)
                self.start.setEnabled(False)
        else:
            self.core.gracefulReset()
            self.connected = False
            self.connectButton.setText(tr("Connect"))
            self.connectStatus.setText(tr("Not Connected"))
            self.sendConfig.setEnabled(False)
            self.start.setEnabled(False)

            # need to do ser.close()

    # Callback function when 'Select Configuration' is clicked
    def selectCfg(self, filename):
        self.core.selectCfg(filename)

    # Callback function when 'Start and Send Configuration' is clicked
    def sendCfg(self):
        self.core.sendCfg()
        if(self.core.parser.comError == 1):
            self.core.parser.comError = 0
            self.displayErrorPopUp()
            
    # Callback function to send sensorStop to device
    def stopSensor(self):
        self.core.stopSensor()
        if(self.core.parser.comError == 1):
            self.core.parser.comError = 0
            self.displayErrorPopUp()

    # Callback function when 'Start without Send Configuration' is clicked
    def startApp(self):
        if (self.core.replay and self.core.playing is False):
            self.start.setText(tr("Pause"))
        elif (self.core.replay and self.core.playing is True):
            self.start.setText(tr("Replay"))
        self.core.startApp()

    # Callback function when language is changed (languageCombo index: 0=en, 1=zh)
    def onLanguageChanged(self, index):
        lang = "en" if index == 0 else "zh"
        if lang == get_language():
            return
        self.core.cachedData.setCachedLanguage(lang)
        set_language(lang)
        self.retranslateMainUI()

    def retranslateMainUI(self):
        """语言切换后重设主界面静态文本并重建当前 demo UI。"""
        self.setWindowTitle(tr(self._title))
        self.comBox.setTitle(tr("Connect to COM Ports"))
        self.configBox.setTitle(tr("Configuration"))
        self.replayBox.setTitle(tr("Replay"))
        self.deviceLabel.setText(tr("Device:"))
        self.cliLabel.setText(tr("CLI COM:"))
        self.dataLabel.setText(tr("DATA COM:"))
        self.demoLabel.setText(tr("Demo:"))
        self.languageLabel.setText(tr("Language:"))
        self.connectButton.setText(tr("Reset Connection") if self.connected else tr("Connect"))
        self.connectStatus.setText(tr("Connected") if self.connected else tr("Not Connected"))
        self.recordAction.setText(tr("Save Data to File"))
        self.selectConfig.setText(tr("Select Configuration"))
        self.sendConfig.setText(tr("Start and Send Configuration"))
        self.sensorStop.setText(tr("Send sensorStop Command"))
        self.sensorStop.setToolTip(tr("Stop sensor (only works if lowPowerCfg is 0)"))
        if self.core.replay:
            self.start.setText(tr("Pause") if self.core.playing else tr("Replay"))
        else:
            self.start.setText(tr("Start without Send Configuration"))
        self.fileMenu.setTitle(tr("&File"))
        self.playbackMenu.setTitle(tr("&Playback"))
        self.helpMenu.setTitle(tr("&Help"))
        self.logOutputAction.setText(tr("Log Terminal Output to File"))
        self.playbackAction.setText(tr("Load and Replay"))
        self.helpAction.setText(tr("Visualizer User Guide"))
        # demoList 重填（保留当前选择；blockSignals 防止 clear/addItem 误触发 changeDemo）
        cur = self.demoList.currentData()
        self.demoList.blockSignals(True)
        self.demoList.clear()
        for demoName in self.core.getDemoList():
            self.demoList.addItem(tr(demoName), demoName)
        self.demoList.blockSignals(False)
        idx = self.demoList.findData(cur) if cur is not None else 0
        self.demoList.setCurrentIndex(idx)
        # 重建当前 demo 的 UI
        self.core.changeDemo(self.demoList, self.deviceList, self.gridLayout, self.demoTabs)

class Core:
    def __init__(self):
        self.cachedData = CachedDataType()

        # 应用缓存的界面语言（必须在任何 UI 构建前设置）
        set_language(self.cachedData.getCachedLanguage())

        self.device = "xWR6843"
        self.demo = DEMO_OOB_x843

        self.frameTime = 50
        self.parser = UARTParser(type="DoubleCOMPort")

        self.replayFile: tuple[str, str] = ("replay.json", "")  # (path, filter) tuple, as returned by QFileDialog.getOpenFileName
        self.replay = False

        # set to 1 
        self.isGUILaunched = 0

        self.sl = QSlider(Qt.Orientation.Horizontal)
        self.sl.valueChanged.connect(self.sliderValueChange)
        self.playing = False
        self.replayFrameNum = 0

        # Populated with each demo and it's corresponding object
        self.demoClassDict = {
            DEMO_OOB_x843: OOBx843(),
            DEMO_OOB_x432: OOBx432(),
            DEMO_OOB_x844: OOBx844(),
            DEMO_3D_PEOPLE_TRACKING: PeopleTracking(),
            DEMO_VITALS: VitalSigns(),
            DEMO_SMALL_OBSTACLE: SmallObstacle(),
            DEMO_GESTURE: GestureRecognition(),
            DEMO_SURFACE: SurfaceClassification(),
            DEMO_LEVEL_SENSING: LevelSensing(),
            DEMO_GROUND_SPEED: TrueGroundSpeed(),
            DEMO_LONG_RANGE: LongRangePD(),
            DEMO_MOBILE_TRACKER: MobileTracker(),
            DEMO_KTO: KickToOpen(),
            DEMO_CALIBRATION: Calibration(),
            DEMO_DASHCAM: Dashcam(),
            DEMO_EBIKES: EBikes(),
            DEMO_VIDEO_DOORBELL: VideoDoorbell(),
            DEMO_INTRUDER: IntruderDetection()
        }

    def loadCachedData(self, demoList, deviceList, recordAction, gridLayout, demoTabs):
        deviceName = self.cachedData.getCachedDeviceName()
        demoName = self.cachedData.getCachedDemoName()
        if self.cachedData.getCachedRecord() == "True":
            recordState = True
        else:
            recordState = False
        if deviceName in self.getDeviceList():
            deviceList.setCurrentIndex(self.getDeviceList().index(deviceName))

        if demoName in self.getDemoList():
            demoList.setCurrentIndex(self.getDemoList().index(demoName))
            self.changeDemo(demoList, deviceList, gridLayout, demoTabs)

        if recordState:
            self.parser.setSaveBinary(True)
            recordAction.setChecked(True)
        else:
            #default recordAction is false so no need to set that here
            self.parser.setSaveBinary(False)

    def getDemoList(self):
        return DEVICE_DEMO_DICT[self.device]["demos"]

    def getDeviceList(self):
        return list(DEVICE_DEMO_DICT.keys())

    def changeDemo(self, demoList, deviceList, gridLayout, demoTabs):
        demo = demoList.currentData()  # 英文逻辑 key（显示的是翻译名）
        if demo is None:  # QComboBox.clear() 等中间态会触发 currentIndexChanged(-1)
            return
        self.demo = demo

        if (self.isGUILaunched):
            self.cachedData.setCachedDemoName(self.demo)
            self.cachedData.setCachedDeviceName(deviceList.currentText())

        # 白名单与 GroupBox 标题同源翻译：任何语言下都能正确匹配永久控件
        permanentWidgetsList = [tr(t) for t in ("Connect to COM Ports", "Configuration", "Tabs", "Replay")]
        # Destroy current contents of graph pane
        for _ in range(demoTabs.count()):
            demoTabs.removeTab(0)
        for i in range(gridLayout.count()):
            try:
                currWidget = gridLayout.itemAt(i).widget()
                if currWidget.title() not in permanentWidgetsList:
                    currWidget.setVisible(False)
            except AttributeError as e:
                log.log(0, "Demo Tabs don't have title attribute. This is OK")
                continue

        # Make call to selected demo's initialization function
        if self.demo in self.demoClassDict:
            self.demoClassDict[self.demo].setupGUI(gridLayout, demoTabs, self.device)

    def changeDevice(self, demoList, deviceList, gridLayout, demoTabs):
        self.device = deviceList.currentText()

        self.parser.device = self.device

        if (self.isGUILaunched):
            self.cachedData.setCachedDemoName(demoList.currentData())
            self.cachedData.setCachedDeviceName(self.device)

        if DEVICE_DEMO_DICT[self.device]["singleCOM"]:
            self.parser.parserType = "SingleCOMPort"
        else:
            self.parser.parserType = "DoubleCOMPort"

        demoList.clear()
        for demoName in DEVICE_DEMO_DICT[self.device]["demos"]:
            demoList.addItem(tr(demoName), demoName)

    def updateCOMPorts(self, cliCom, dataCom):
        if DEVICE_DEMO_DICT[self.device]["isxWRLx432"]:
            dataCom.setCurrentText(cliCom.currentText())
            dataCom.setEnabled(False)
        else:
            dataCom.setEnabled(True)

    def updateResetButton(self, sensorStopButton):
        if DEVICE_DEMO_DICT[self.device]["isxWRLx432"]:
            sensorStopButton.setHidden(True) # TODO change to false once sending sensorStop is implemented
        else:
            sensorStopButton.setHidden(True)

    def stopSensor(self):
        self.parser.sendLine("sensorStop 0")

    def selectFile(self, filename):
        try:
            current_dir = os.getcwd()
            configDirectory = current_dir
            path = self.cachedData.getCachedCfgPath()
            if path != "":
                configDirectory = path
        except:
            configDirectory = ""

        fname = QFileDialog.getOpenFileName(caption=tr("Open .cfg File"), dir=configDirectory, filter="cfg(*.cfg)")
        filename.setText(str(fname[0]))
        return fname[0]

    def parseCfg(self, fname):
        if (self.replay):
            self.cfg = self.data['cfg']
        else:
            with open(fname, "r") as cfg_file:
                self.cfg = cfg_file.readlines()
                self.parser.cfg = self.cfg
                self.parser.demo = self.demo
                self.parser.device = self.device
        for line in self.cfg:
            args = line.split()
            if len(args) > 0:
                # trackingCfg
                if args[0] == "trackingCfg":
                    if len(args) < 5:
                        log.error("trackingCfg had fewer arguments than expected")
                    else:
                        with suppress(AttributeError):
                            self.demoClassDict[self.demo].parseTrackingCfg(args)
                elif args[0] == "SceneryParam" or args[0] == "boundaryBox":
                    if len(args) < 7:
                        log.error(
                            "SceneryParam/boundaryBox had fewer arguments than expected"
                        )
                    else:
                        with suppress(AttributeError):
                            self.demoClassDict[self.demo].parseBoundaryBox(args)
                elif args[0] == "frameCfg":
                    if len(args) < 4:
                        log.error("frameCfg had fewer arguments than expected")
                    else:
                        self.frameTime = float(args[5]) / 2
                        self.demoClassDict[self.demo].frameTime = self.frameTime
                elif args[0] == "sensorPosition":
                    # sensorPosition for x843 family has 3 args
                    if DEVICE_DEMO_DICT[self.device]["isxWRx843"] and len(args) < 4:
                        log.error("sensorPosition had fewer arguments than expected")
                    elif DEVICE_DEMO_DICT[self.device]["isxWRLx432"] and len(args) < 6:
                        log.error("sensorPosition had fewer arguments than expected")
                    elif DEVICE_DEMO_DICT[self.device]["isxWRLx844"]:
                        self.demoClassDict[self.demo].parseSensorPositionCfg(args)
                    else:
                        with suppress(AttributeError):
                            self.demoClassDict[self.demo].parseSensorPosition(
                                args, DEVICE_DEMO_DICT[self.device]["isxWRx843"]
                            )
                
                # Only used for Small Obstacle Detection
                elif args[0] == "occStateMach":
                    numZones = int(args[1])
                # Only used for Small Obstacle Detection
                elif args[0] == "zoneDef":
                    if len(args) < 8:
                        log.error("zoneDef had fewer arguments than expected")
                    else:
                        with suppress(AttributeError):
                            self.demoClassDict[self.demo].parseBoundaryBox(args)
                elif args[0] == "mpdBoundaryBox":
                    if len(args) < 8:
                        log.error("mpdBoundaryBox had fewer arguments than expected")
                    else:
                        with suppress(AttributeError):
                            self.demoClassDict[self.demo].parseBoundaryBox(args)
                elif args[0] == "chirpComnCfg":
                    if len(args) < 8:
                        log.error("chirpComnCfg had fewer arguments than expected")
                    else:
                        with suppress(AttributeError):
                            self.demoClassDict[self.demo].parseChirpComnCfg(args)
                elif args[0] == "chirpTimingCfg":
                    if len(args) < 6:
                        log.error("chirpTimingCfg had fewer arguments than expected")
                    else:
                        with suppress(AttributeError):
                            self.demoClassDict[self.demo].parseChirpTimingCfg(args)
                # TODO This is specifically guiMonitor for 60Lo, this parsing will break the gui when an SDK 3 config is sent
                elif args[0] == "guiMonitor":
                    if DEVICE_DEMO_DICT[self.device]["isxWRLx432"]:
                        if len(args) < 12:
                            log.error("guiMonitor had fewer arguments than expected")
                        else:
                            with suppress(AttributeError):
                                self.demoClassDict[self.demo].parseGuiMonitor(args)
                elif args[0] == "presenceDetectCfg":
                    with suppress(AttributeError):
                        self.demoClassDict[self.demo].parsePresenceDetectCfg(args)
                elif args[0] == "sigProcChainCfg2":
                    with suppress(AttributeError):
                        self.demoClassDict[self.demo].parseSigProcChainCfg2(args)
                elif args[0] == "mpdBoundaryArc":
                    if len(args) < 8:
                        log.error("mpdBoundaryArc had fewer arguments than expected")
                    else:
                        with suppress(AttributeError):
                            self.demoClassDict[self.demo].parseBoundaryBox(args)
                elif args[0] == "measureRangeBiasAndRxChanPhase":
                    with suppress(AttributeError):
                        self.demoClassDict[self.demo].parseRangePhaseCfg(args)
                elif args[0] == "clutterRemoval":
                    with suppress(AttributeError):
                        self.demoClassDict[self.demo].parseClutterRemovalCfg(args)
                elif args[0] == "sigProcChainCfg":
                    with suppress(AttributeError):
                        self.demoClassDict[self.demo].parseSigProcChainCfg(args)
                elif args[0] == "channelCfg":
                    with suppress(AttributeError):
                        self.demoClassDict[self.demo].parseChannelCfg(args)
                elif args[0] == "SOSOClassifierCfg":
                    with suppress(AttributeError):
                        self.demoClassDict[self.demo].parseSOSOCfg(args)
                elif args[0] == "occupancyBox":
                    with suppress(AttributeError):
                        self.demoClassDict[self.demo].parseOccCfg(args)
                elif args[0] == "intruderDetAdvCfg":
                    with suppress(AttributeError):
                        self.demoClassDict[self.demo].parseDetAdvCfg(args)
        # Initialize 1D plot values based on cfg file
        with suppress(AttributeError):
            self.demoClassDict[self.demo].setRangeValues()

    def selectCfg(self, filename):
        try:
            file = self.selectFile(filename)
            self.cachedData.setCachedCfgPath(file)  # cache the file and demo used
            self.parseCfg(file)
        except Exception as e:
            log.error(e)
            log.error(
                "Parsing .cfg file failed. Did you select a valid configuration file?"
            )

        log.debug("Demo Changed to " + self.demo)
        if self.demo == DEMO_CALIBRATION:
            self.demoClassDict[self.demo].checkCalibrationParams()

    def sendCfg(self):
        try:
            if self.demo != DEMO_REPLAY:
                self.parser.sendCfg(self.cfg)
                sys.stdout.flush()
                self.parseTimer.start(int(self.frameTime))  # need this line
        except Exception as e:
            log.error(e)
            log.error("Parsing .cfg file failed. Did you select the right file?")

    def updateGraph(self, outputDict):
        self.demoClassDict[self.demo].updateGraph(outputDict)

    def connectCom(self, cliCom, dataCom, connectStatus):
        if self.demo == DEMO_GESTURE or self.demo == DEMO_VIDEO_DOORBELL:
            self.frameTime = 25 # Gesture demo runs at 35ms frame time
        # init threads and timers
        self.uart_thread = parseUartThread(self.parser)

        self.uart_thread.fin.connect(self.updateGraph)
        self.parseTimer = QTimer()
        self.parseTimer.setSingleShot(False)
        self.parseTimer.timeout.connect(self.parseData)
        try:
            uart = comboDevice(cliCom)
            data = comboDevice(dataCom)
            # Windows 兼容：手动输入纯数字（如 "5"）时补 "COM" 前缀
            if os.name == "nt":
                if uart and not uart.upper().startswith("COM"):
                    uart = "COM" + uart
                if data and not data.upper().startswith("COM"):
                    data = "COM" + data
            if DEVICE_DEMO_DICT[self.device]["isxWRx843"] or DEVICE_DEMO_DICT[self.device]["isxWRLx844"]:  # If using x843 device
                self.parser.connectComPorts(uart, data)
            else:  # If not x843 device then defer to x432 device
                if self.demo == DEMO_GESTURE or self.demo == DEMO_KTO or self.demo == DEMO_VIDEO_DOORBELL:
                    self.parser.connectComPort(uart, 1250000)
                else:
                    self.parser.connectComPort(uart)
            connectStatus.setText(tr("Connected"))
        except Exception as e:
            log.error(e)
            connectStatus.setText(tr("Unable to Connect"))
            return -1

        return 0

    def startApp(self):
        if (self.replay and self.playing is False):
            self.replayTimer = QTimer()
            self.replayTimer.setSingleShot(True)
            self.replayTimer.timeout.connect(self.replayData)
            self.playing = True
            self.replayTimer.start(100) # arbitrary value to start plotting
        elif (self.replay and self.playing is True):
            self.playing = False
        else :
            self.parseTimer.start(int(self.frameTime))  # need this line, this is for normal plotting

    def loadForReplay(self, state):
        if (state):
            self.cachedData.setCachedRecord("True")
            with open(self.replayFile[0], 'r') as fp:
                self.data = json.load(fp)
            self.parseCfg("")
            self.sl.setMinimum(0)
            self.sl.setMaximum(len(self.data['data']) - 1)
            self.sl.setValue(0)
            self.sl.setTickInterval(5)
            # TODO need to load correct demo from file
        else:
            self.cachedData.setCachedRecord("False")


    def replayData(self):
        if (self.playing) :
            outputDict = self.data['data'][self.replayFrameNum]['frameData']
            self.updateGraph(outputDict)
            self.replayFrameNum += 1
            self.sl.setValue(self.replayFrameNum)
            if (self.replayFrameNum < len(self.data['data'])) :
                self.replayTimer.start(self.data['data'][self.replayFrameNum]['timestamp'] - self.data['data'][self.replayFrameNum-1]['timestamp'])

    def sliderValueChange(self):
        self.replayFrameNum = self.sl.value()

    def parseData(self):
        self.uart_thread.start(priority=QThread.Priority.HighestPriority)

    def boardReset(self):
        try:
            if getattr(sys, 'frozen', False):
                path_json = resource_path("common/External_Resources/path.json")
            else:
                path_json = os.path.join("..", "common", "External_Resources", "path.json")
            paths = json.load(open(path_json, 'r'))
            xds_reset_path = paths.get("xds_reset_path")
            reset_cmd = "xds110reset --action toggle"
            try:
                subprocess.run(reset_cmd, cwd= xds_reset_path, shell = True)
            except:
                log.error("Unable to reset the device. Check your xds reset path in <Industrial_Visualizer/misc/path.json>")
        except:
            log.warning("Unable to read path.json")

    def gracefulReset(self):
        self.parseTimer.stop()
        self.uart_thread.stop()
        if self.parser.cliCom is not None:
            self.parser.cliCom.close()
        if self.parser.dataCom is not None:
            self.parser.dataCom.close()
        for demo in self.demoClassDict.values():
            if hasattr(demo, "plot_3d_thread"):
                demo.plot_3d_thread.stop()
            if hasattr(demo, "plot_3d"):
                demo.removeAllBoundBoxes()
            if hasattr(demo, "power_report"):
                demo.resetPowerNumbers()
        self.boardReset()

