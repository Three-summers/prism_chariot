# General Library Imports
from os.path import exists
from os import mkdir
import os

# Logger
import logging
log = logging.getLogger(__name__)

CACHE_FILE = os.path.join("cache", "cachedData.txt")

class CachedDataType:
    def __init__(self):
        self.cachedDemoName = ""
        self.cachedCfgPath = ""
        self.cachedDeviceName = ""
        self.cachedRecord = "False"
        self.cachedLanguage = "en"

        try:
            if(exists(CACHE_FILE)):
                configCacheFile = open(CACHE_FILE, 'r')
                lines = [ln.rstrip("\n") for ln in configCacheFile.readlines()]
                configCacheFile.close()
                if len(lines) >= 4:
                    self.cachedDeviceName = lines[0]
                    self.cachedDemoName = lines[1]
                    self.cachedCfgPath = lines[2]
                    self.cachedRecord = lines[3]
                if len(lines) >= 5:
                    self.cachedLanguage = lines[4]
        except:
            log.warning("Missing some or all of cached data")

    def writeToFile(self):
        if not exists("cache"):
        # Note that this will create the folder in the caller's path, not necessarily in the Industrial Viz Folder
            mkdir("cache")
        configCacheFile = open(CACHE_FILE, 'w')
        configCacheFile.write(self.cachedDeviceName + '\n')
        configCacheFile.write(self.cachedDemoName + '\n')
        configCacheFile.write(self.cachedCfgPath + '\n')
        configCacheFile.write(self.cachedRecord + '\n')
        configCacheFile.write(self.cachedLanguage)
        configCacheFile.close()

    def getCachedDeviceName(self):
        return self.cachedDeviceName

    def getCachedDemoName(self):
        return self.cachedDemoName

    def getCachedCfgPath(self):
        return self.cachedCfgPath

    def getCachedRecord(self):
        return self.cachedRecord

    def setCachedDemoName(self, newDemo):
        self.cachedDemoName = newDemo
        self.writeToFile()

    def setCachedDeviceName(self, newDevice):
        self.cachedDeviceName = newDevice
        self.writeToFile()

    def setCachedCfgPath(self, newPath):
        self.cachedCfgPath = newPath
        self.writeToFile()

    def setCachedRecord(self, record):
        self.cachedRecord = record
        self.writeToFile()

    def getCachedLanguage(self):
        return self.cachedLanguage

    def setCachedLanguage(self, language):
        self.cachedLanguage = language
        self.writeToFile()

