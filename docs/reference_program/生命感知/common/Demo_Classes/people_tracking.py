# General Library Imports
# PyQt Imports
# Local Imports
# Logger
# # Different methods to color the points 
COLOR_MODE_SNR = 'SNR'
COLOR_MODE_HEIGHT = 'Height'
COLOR_MODE_DOPPLER = 'Doppler'
COLOR_MODE_TRACK = 'Associated Track'

MAX_PERSISTENT_FRAMES = 30

from collections import deque
import numpy as np
import time
import string

from PySide6.QtCore import Qt, QThread
from PySide6.QtGui import QPixmap, QFont
import pyqtgraph.opengl as gl
import pyqtgraph as pg
from PySide6.QtWidgets import QGroupBox, QGridLayout, QLabel, QWidget, QVBoxLayout, QTabWidget, QComboBox, QCheckBox, QSlider, QFormLayout

from Common_Tabs.plot_3d import Plot3D
from Common_Tabs.plot_1d import Plot1D
from Demo_Classes.Helper_Classes.fall_detection import *
from demo_defines import *
from graph_utilities import get_trackColors, eulerRot
from gl_text import GLTextItem

from gui_threads import updateQTTargetThread3D
from gui_common import TAG_HISTORY_LEN
from translations import tr

import logging

log = logging.getLogger(__name__)


class PeopleTracking(Plot3D, Plot1D):
    def __init__(self):
        Plot3D.__init__(self)
        Plot1D.__init__(self)
        self.fallDetection = FallDetection()
        self.tabs = None
        self.cumulativeCloud = None
        self.colorGradient = pg.GradientWidget(orientation='right')
        self.colorGradient.restoreState({'ticks': [ (1, (255, 0, 0, 255)), (0, (131, 238, 255, 255))], 'mode': 'hsv'})
        self.colorGradient.setVisible(False)
        self.maxTracks = int(5) # default to 5 tracks
        self.trackColorMap = get_trackColors(self.maxTracks)

    def setupGUI(self, gridLayout, demoTabs, device):
        # Init setup pane on left hand side
        statBox = self.initStatsPane()
        gridLayout.addWidget(statBox,2,0,1,1)

        demoGroupBox = self.initPlotControlPane()
        gridLayout.addWidget(demoGroupBox,3,0,1,1)

        fallDetectionOptionsBox = self.initFallDetectPane()
        gridLayout.addWidget(fallDetectionOptionsBox, 4,0,1,1)

        demoTabs.addTab(self.plot_3d, '3D Plot')
        demoTabs.addTab(self.rangePlot, 'Range Plot')
        self.device = device
        self.tabs = demoTabs

    def updateGraph(self, outputDict):
        self.plotStart = int(round(time.time()*1000))
        self.updatePointCloud(outputDict)

        self.cumulativeCloud = None

        # Track indexes on 6843 are delayed a frame. So, delay showing the current points by 1 frame for 6843
        if ('frameNum' in outputDict and outputDict['frameNum'] > 1 and len(self.previousClouds[:-1]) > 0 and DEVICE_DEMO_DICT[self.device]["isxWRx843"]):
            # For all the previous point clouds (except the most recent, whose tracks are being computed mid-frame)
            for frame in range(len(self.previousClouds[:-1])):
                # if it's not empty
                if(len(self.previousClouds[frame]) > 0):
                    # if it's the first member, assign it equal
                    if(self.cumulativeCloud is None):
                        self.cumulativeCloud = self.previousClouds[frame]
                    # if it's not the first member, concatinate it
                    else:
                        self.cumulativeCloud = np.concatenate((self.cumulativeCloud, self.previousClouds[frame]),axis=0)
        elif (len(self.previousClouds) > 0):
            # For all the previous point clouds, including the current frame's
            for frame in range(len(self.previousClouds[:])):
                # if it's not empty
                if(len(self.previousClouds[frame]) > 0):
                    # if it's the first member, assign it equal
                    if(self.cumulativeCloud is None):
                        self.cumulativeCloud = self.previousClouds[frame]
                    # if it's not the first member, concatinate it
                    else:
                        self.cumulativeCloud = np.concatenate((self.cumulativeCloud, self.previousClouds[frame]),axis=0)

        if ('numDetectedPoints' in outputDict):
            self.numPointsDisplay.setText(tr('Points: {}').format(outputDict['numDetectedPoints']))
        if ('numDetectedTracks' in outputDict):
            self.numTargetsDisplay.setText(tr('Targets: {}').format(outputDict['numDetectedTracks']))

        # Tracks
        for cstr in self.coordStr:
            cstr.setVisible(False)

        # Plot
        if (self.tabs.currentWidget() == self.plot_3d):
            if ('trackData' in outputDict):
                tracks = outputDict['trackData']
                for i in range(outputDict['numDetectedTracks']):
                    rotX, rotY, rotZ = eulerRot(tracks[i,1], tracks[i,2], tracks[i,3], self.elev_tilt, self.az_tilt)
                    tracks[i,1] = rotX
                    tracks[i,2] = rotY
                    tracks[i,3] = rotZ
                    tracks[i,3] = tracks[i,3] + self.sensorHeight

                # If there are heights to display
                if ('heightData' in outputDict):
                    if (len(outputDict['heightData']) != len(outputDict['trackData'])):
                        log.warning("WARNING: number of heights does not match number of tracks")

                    # For each height heights for current tracks
                    for height in outputDict['heightData']:
                        # Find track with correct TID
                        for track in outputDict['trackData']:
                            # Found correct track
                            if (int(track[0]) == int(height[0])):
                                tid = int(height[0])
                                height_str = tr('tid : {}, height : {} m').format(height[0], round(height[1], 2))
                                # If this track was computed to have fallen, display it on the screen
                                if(self.displayFallDet.checkState() == Qt.CheckState.Checked):
                                    # Compute the fall detection results for each object
                                    fallDetectionDisplayResults = self.fallDetection.step(outputDict['heightData'], outputDict['trackData'])
                                    if (fallDetectionDisplayResults[tid] > 0):
                                        height_str = height_str + tr(" FALL DETECTED")
                                self.coordStr[tid].setText(height_str)
                                self.coordStr[tid].setX(track[1])
                                self.coordStr[tid].setY(track[2])
                                self.coordStr[tid].setZ(track[3])
                                self.coordStr[tid].setVisible(True)
                                break
            else:
                tracks = None
            if (self.plotComplete):
                self.plotStart = int(round(time.time()*1000))
                self.plot_3d_thread = updateQTTargetThread3D(self.cumulativeCloud, tracks, self.scatter, self.plot_3d, 0, self.ellipsoids, "", colorGradient=self.colorGradient, pointColorMode=self.pointColorMode.currentData(), trackColorMap=self.trackColorMap)
                self.plotComplete = 0
                self.plot_3d_thread.done.connect(lambda: self.graphDone(outputDict))
                self.plot_3d_thread.start(priority=QThread.HighPriority)
        elif (self.tabs.currentWidget() == self.rangePlot):
            self.update1DGraph(outputDict)
            self.graphDone(outputDict)

        if ('frameNum' in outputDict):
            self.frameNumDisplay.setText(tr('Frame: {}').format(outputDict['frameNum']))

    def graphDone(self, outputDict):
        if ('frameNum' in outputDict):
            self.frameNumDisplay.setText(tr('Frame: {}').format(outputDict['frameNum']))

        if ('powerData' in outputDict):
            powerData = outputDict['powerData']
            self.updatePowerNumbers(powerData)

        plotTime = int(round(time.time()*1000)) - self.plotStart
        self.plotTimeDisplay.setText(tr('Plot Time: {} ms').format(plotTime))
        self.plotComplete = 1

    def updatePowerNumbers(self, powerData):
        if powerData['power1v2'] == 65535:
            self.avgPower.setText(tr('Average Power: N/A'))
        else:
            powerStr = str((powerData['power1v2'] \
                + powerData['power1v2RF'] + powerData['power1v8'] + powerData['power3v3']) * 0.1)
            self.avgPower.setText(tr('Average Power: {} mW').format(powerStr[:5]))

    def initStatsPane(self):
        statBox = QGroupBox(tr('Statistics'))
        self.frameNumDisplay = QLabel(tr('Frame: {}').format(0))
        self.plotTimeDisplay = QLabel(tr('Plot Time: {} ms').format(0))
        self.numPointsDisplay = QLabel(tr('Points: {}').format(0))
        self.numTargetsDisplay = QLabel(tr('Targets: {}').format(0))
        self.avgPower = QLabel(tr('Average Power: {} mW').format(0))
        self.statsLayout = QVBoxLayout()
        self.statsLayout.addWidget(self.frameNumDisplay)
        self.statsLayout.addWidget(self.plotTimeDisplay)
        self.statsLayout.addWidget(self.numPointsDisplay)
        self.statsLayout.addWidget(self.numTargetsDisplay)
        self.statsLayout.addWidget(self.avgPower)
        statBox.setLayout(self.statsLayout)
        return statBox

    def initPlotControlPane(self):
        plotControlBox = QGroupBox(tr('Plot Controls'))
        self.pointColorMode = QComboBox()
        # itemData 存英文逻辑 key（线程内按 COLOR_MODE_* 比较），显示翻译名
        for mode in (COLOR_MODE_SNR, COLOR_MODE_HEIGHT, COLOR_MODE_DOPPLER, COLOR_MODE_TRACK):
            self.pointColorMode.addItem(tr(mode), mode)

        self.displayFallDet = QCheckBox(tr('Detect Falls'))
        self.snapTo2D = QCheckBox(tr('Snap to 2D'))
        self.displayFallDet.stateChanged.connect(self.fallDetDisplayChanged)
        self.persistentFramesInput = QComboBox()
        self.persistentFramesInput.addItems([str(i) for i in range(1, MAX_PERSISTENT_FRAMES + 1)])
        self.persistentFramesInput.setCurrentIndex(self.numPersistentFrames - 1)
        self.persistentFramesInput.currentIndexChanged.connect(self.persistentFramesChanged)
        plotControlLayout = QFormLayout()
        plotControlLayout.addRow(tr("Color Points By:"), self.pointColorMode)
        plotControlLayout.addRow(tr("Enable Fall Detection"), self.displayFallDet)
        plotControlLayout.addRow(tr("# of Persistent Frames"), self.persistentFramesInput)
        plotControlLayout.addRow(self.snapTo2D)
        plotControlBox.setLayout(plotControlLayout)

        return plotControlBox

    def persistentFramesChanged(self, index):
        self.numPersistentFrames = index + 1

    def fallDetDisplayChanged(self, state):
        if state:
            self.fallDetectionOptionsBox.setVisible(True)
        else:
            self.fallDetectionOptionsBox.setVisible(False)

    def updateFallDetectionSensitivity(self):
        self.fallDetection.setFallSensitivity(((self.fallDetSlider.value() / self.fallDetSlider.maximum()) * 0.4) + 0.4) # Range from 0.4 to 0.8

    def initFallDetectPane(self):
        self.fallDetectionOptionsBox = QGroupBox(tr('Fall Detection Sensitivity'))
        self.fallDetLayout = QGridLayout()
        self.fallDetSlider = FallDetectionSliderClass(Qt.Orientation.Horizontal)
        self.fallDetSlider.setTracking(True)
        self.fallDetSlider.setTickPosition(QSlider.TickPosition.TicksBothSides)
        self.fallDetSlider.setTickInterval(10)
        self.fallDetSlider.setRange(0, 100)
        self.fallDetSlider.setSliderPosition(50)
        self.fallDetSlider.valueChanged.connect(self.updateFallDetectionSensitivity)
        self.lessSensitiveLabel = QLabel(tr("Less Sensitive"))
        self.fallDetLayout.addWidget(self.lessSensitiveLabel,0,0,1,1)
        self.moreSensitiveLabel = QLabel(tr("More Sensitive"))
        self.fallDetLayout.addWidget(self.moreSensitiveLabel,0,10,1,1)
        self.fallDetLayout.addWidget(self.fallDetSlider,1,0,1,11)
        self.fallDetectionOptionsBox.setLayout(self.fallDetLayout)
        if(self.displayFallDet.checkState() == Qt.CheckState.Checked):
            self.fallDetectionOptionsBox.setVisible(True)
        else:
            self.fallDetectionOptionsBox.setVisible(False)

        return self.fallDetectionOptionsBox

    def parseTrackingCfg(self, args):
        self.maxTracks = int(args[4])
        self.updateNumTracksBuffer() # Update the max number of tracks based off the config file
        self.trackColorMap = get_trackColors(self.maxTracks)
        for m in range(self.maxTracks):
            # Add track gui object
            mesh = gl.GLLinePlotItem()
            mesh.setVisible(False)
            self.plot_3d.addItem(mesh)
            self.ellipsoids.append(mesh)
            # Add track coordinate string
            text = GLTextItem()
            text.setGLViewWidget(self.plot_3d)
            text.setVisible(False)
            self.plot_3d.addItem(text)
            self.coordStr.append(text)
            # Add track classifier label string
            classifierText = GLTextItem()
            classifierText.setGLViewWidget(self.plot_3d)
            classifierText.setVisible(False)
            self.plot_3d.addItem(classifierText)
            self.classifierStr.append(classifierText)

    def updateNumTracksBuffer(self):
        # Use a deque here because the append operation adds items to the back and pops the front
        self.classifierTags = [deque([0] * TAG_HISTORY_LEN, maxlen = TAG_HISTORY_LEN) for i in range(self.maxTracks)]
        self.tracksIDsInPreviousFrame = []
        self.wasTargetHuman = [0 for i in range(self.maxTracks)]
        self.fallDetection = FallDetection(self.maxTracks)
