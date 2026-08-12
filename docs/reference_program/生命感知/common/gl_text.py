import numpy as np
from pyqtgraph.opengl.items.GLTextItem import GLTextItem as _PyQtGraphGLTextItem


class GLTextItem(_PyQtGraphGLTextItem):
    """3D 文本标签，兼容 TI Industrial Visualizer 原有 API。

    绘制逻辑复用 pyqtgraph 0.14 官方的 GLTextItem（QPainter + 投影矩阵），
    替换已移除的 QGLWidget.qglColor()/renderText() 路径（Qt6 不再有 QGLWidget）。
    """

    def __init__(self, X=None, Y=None, Z=None, text=None):
        self.GLViewWidget = None  # 先于父类构造初始化，父类 update() 会调用 view()
        _PyQtGraphGLTextItem.__init__(self)

        self.text = text if text is not None else ''
        self.pos = np.array([float(X if X is not None else 0.0),
                             float(Y if Y is not None else 0.0),
                             float(Z if Z is not None else 0.0)])
        self.GLViewWidget = None

    def setGLViewWidget(self, GLViewWidget):
        self.GLViewWidget = GLViewWidget

    def view(self):
        # 兼容旧调用方式：setGLViewWidget() 显式指定 view
        if self.GLViewWidget is not None:
            return self.GLViewWidget
        return _PyQtGraphGLTextItem.view(self)

    def setText(self, text):
        self.text = text
        self.update()

    def setX(self, X):
        self.pos[0] = X
        self.update()

    def setY(self, Y):
        self.pos[1] = Y
        self.update()

    def setZ(self, Z):
        self.pos[2] = Z
        self.update()

    def setPosition(self, X, Y, Z):
        self.pos[0] = X + 0.25
        self.pos[2] = Z + 0.6
        self.pos[1] = Y
        self.text = '(' + str(X)[:4] + ', ' + str(Y)[:4] + ', ' + str(Z)[:4] + ')'
        self.update()
