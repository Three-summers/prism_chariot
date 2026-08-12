# General Library Imports
from collections import deque

# PyQt Imports
from PySide6.QtCore import Qt
from PySide6.QtGui import QFont
import pyqtgraph as pg
from translations import tr
from PySide6.QtWidgets import QGroupBox, QLabel, QWidget, QVBoxLayout, QTabWidget
import time

# Local Imports

# Logger

class TrueGroundSpeed():
    def __init__(self):
        self.speedPlots = {}
        self.speedVals = {'speedVals': []}

    def setupGUI(self, gridLayout, demoTabs, device):
        # Init setup pane on left hand side
        statBox = self.initStatsPane()
        gridLayout.addWidget(statBox,2,0,1,1)

        self.groundSpeedTab = QWidget()
        vboxGroundSpeed = QVBoxLayout()

        vboxDetectedSpeed = QVBoxLayout()
        vboxDetectedSpeedMph = QVBoxLayout()
        self.speedOutput = QLabel(tr("Undefined"))
        self.speedOutputMph = QLabel(tr("Undefined"))
        self.speedOutput.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.speedOutputMph.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.speedOutput.setStyleSheet('background-color: rgb(70, 72, 79); color: white; font-size: 60px; font-weight: bold')
        self.speedOutputMph.setStyleSheet('background-color: rgb(70, 72, 79); color: white; font-size: 60px; font-weight: bold')
        font = QFont()
        font.setPointSize(int(self.groundSpeedTab.width() / 20))
        self.speedOutput.setFont(font)
        self.speedOutputMph.setFont(font)
        vboxDetectedSpeed.addWidget(self.speedOutput, 1)
        vboxDetectedSpeedMph.addWidget(self.speedOutputMph, 1)
        vboxGroundSpeed.addLayout(vboxDetectedSpeed)
        vboxGroundSpeed.addLayout(vboxDetectedSpeedMph)

        vBoxFeatures = QVBoxLayout()
        pen = pg.mkPen(color='b', width=2, style=Qt.SolidLine)
        self.speedPlots['avgSpeedPlot'] = pg.PlotWidget()
        self.speedPlots['avgSpeedPlot'].setBackground((70, 72, 79))
        self.speedPlots['avgSpeedPlot'].showGrid(x=True, y=True)
        self.speedPlots['avgSpeedPlot'].setYRange(-7, 7)
        self.speedPlots['avgSpeedPlot'].setXRange(1, 30)
        self.speedPlots['avgSpeedPlot'].setTitle(tr('True Ground Speed'))
        self.speedPlots['avgSpeedPlot'].plot(self.speedVals['speedVals'], pen=pen)
        vBoxFeatures.addWidget(self.speedPlots['avgSpeedPlot'])

        vboxGroundSpeed.addLayout(vBoxFeatures)
        self.groundSpeedTab.setLayout(vboxGroundSpeed)

        demoTabs.addTab(self.groundSpeedTab, tr('True Ground Speed'))
        demoTabs.setCurrentIndex(1)

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

    def updateGraph(self, outputDict):
        pen = pg.mkPen(color='b', width=2, style=Qt.SolidLine)
        speedData = deque(self.speedVals['speedVals'])
        if ('velocity' in outputDict):
            # get velocity
            velocity = outputDict['velocity'][0][0]

            # update the plot
            speedData.appendleft(velocity) # doppler avg feature is at index 1
            if (len(speedData) > 40):
                speedData.pop()
            self.speedVals['speedVals'] = speedData
            self.speedPlots['avgSpeedPlot'].clear()
            self.speedPlots['avgSpeedPlot'].plot(self.speedVals['speedVals'], pen=pen)

            # update text
            self.speedOutput.setStyleSheet(f'background-color: blue; color: white; font-weight: bold')
            self.speedOutput.setText(tr('{0:.2f} m/s').format(velocity))
            
            self.speedOutputMph.setStyleSheet(f'background-color: blue; color: white; font-weight: bold')
            self.speedOutputMph.setText(tr('{0:.2f} mph').format(velocity * 2.237))

        if ('frameNum' in outputDict):
            self.frameNumDisplay.setText('Frame: ' + str(outputDict['frameNum']))

        if ('numDetectedPoints' in outputDict):
            self.numPointsDisplay.setText('Points: '+ str(outputDict['numDetectedPoints']))

        # plotTime = int(round(time.time()*1000)) - self.plotStart
        # self.plotTimeDisplay.setText('Plot Time: ' + str(plotTime) + 'ms')

        