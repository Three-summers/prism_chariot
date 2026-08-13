import { useLayoutEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  Activity, Clock3, Crosshair, FileText, HeartPulse, ImagePlus, Map, Menu, Radio,
  ScanLine, Thermometer,
} from 'lucide-react'
import { computeUiScale } from './uiScale'

type Module = { label: string; icon: typeof ScanLine; tone: string }
const modules: Module[] = [
  { label: '线卡识别', icon: ScanLine, tone: 'cyan' },
  { label: '线突识别', icon: Crosshair, tone: 'cyan' },
  { label: '磁极板识别', icon: Activity, tone: 'cyan' },
  { label: '红外测温', icon: Thermometer, tone: 'orange' },
  { label: '生命感知', icon: HeartPulse, tone: 'violet' },
]

const logs = [
  ['10:24:18', 'GL-01 进入 B 区域', 'info'],
  ['10:25:02', '生命感知扫描已启动', 'info'],
  ['10:25:48', '检测到人员静止', 'info'],
  ['10:25:49', '毫米波生命体征检测中', 'info'],
  ['10:25:52', '人员倒地 / 生命体征异常', 'danger'],
  ['10:25:53', '事件已生成：B1-086', 'info'],
  ['10:25:55', '通知：运营中心', 'info'],
  ['10:26:01', '运营中心已接收', 'info'],
  ['10:27:05', '支援人员已派发', 'info'],
  ['10:30:18', '现场处置中', 'info'],
  ['10:32:44', '等待结案处理', 'info'],
]

const cases = [
  { id: 'CASE-001', level: '红色', color: 'red', time: '2026-08-12 10:25:52', spot: 'B1-086', type: '人员倒地 / 生命体征异常', state: '处理中', owner: '张伟', updated: '10:30:18' },
  { id: 'CASE-002', level: '橙色', color: 'orange', time: '2026-08-12 09:58:23', spot: 'A1-042', type: '线卡异常', state: '已确认', owner: '李强', updated: '10:02:11' },
  { id: 'CASE-003', level: '黄色', color: 'yellow', time: '2026-08-12 09:32:47', spot: 'C2-118', type: '线突出疑似', state: '已关闭', owner: '王磊', updated: '09:45:33' },
  { id: 'CASE-004', level: '黄色', color: 'yellow', time: '2026-08-12 08:46:05', spot: 'B1-063', type: '磁极板温度偏高', state: '已关闭', owner: '陈晨', updated: '08:58:21' },
  { id: 'CASE-005', level: '橙色', color: 'orange', time: '2026-08-12 08:12:30', spot: 'E1-009', type: '红外测温超限', state: '已关闭', owner: '赵敏', updated: '08:23:41' },
]

const floors = ['1F', '3F'] as const

function useUiScale() {
  useLayoutEffect(() => {
    const root = document.documentElement
    const previous = root.style.getPropertyValue('--ui-scale')
    const apply = () => {
      root.style.setProperty('--ui-scale', String(computeUiScale(window.innerWidth, window.innerHeight)))
    }
    apply()
    window.addEventListener('resize', apply)
    document.addEventListener('fullscreenchange', apply)
    return () => {
      window.removeEventListener('resize', apply)
      document.removeEventListener('fullscreenchange', apply)
      if (previous) root.style.setProperty('--ui-scale', previous)
      else root.style.removeProperty('--ui-scale')
    }
  }, [])
}

function Panel({ title, icon, children, className = '' }: { title: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-title">{icon}{title}</div>
      {children}
    </section>
  )
}

function TrendChart() {
  const breath = '16,48 56,50 96,47 136,51 176,46 216,49 256,45 296,50 336,47 376,52 416,54 456,58 500,64'
  const heart = '16,68 56,67 96,70 136,68 176,66 216,69 256,65 296,68 336,70 376,73 416,76 456,80 500,84'
  return (
    <div className="trend-wrap">
      <div className="legend">
        <span><i className="dot violet" />呼吸频率</span>
        <span><i className="dot cyan" />心率</span>
        <span className="axis-note">bpm</span>
      </div>
      <svg className="trend-chart" viewBox="0 0 520 110" preserveAspectRatio="none">
        <g className="grid">
          {[18, 42, 66, 90].map((y) => <line key={y} x1="8" x2="512" y1={y} y2={y} />)}
        </g>
        <polyline points={breath} className="line breath" />
        <polyline points={heart} className="line heart" />
        <circle cx="500" cy="64" r="3.5" className="end violet-fill" />
        <circle cx="500" cy="84" r="3.5" className="end cyan-fill" />
      </svg>
      <div className="chart-labels">
        <span>10:20</span><span>10:21</span><span>10:22</span><span>10:23</span><span>10:24</span><span>10:25</span>
      </div>
    </div>
  )
}

function FactoryMap({ floor }: { floor: (typeof floors)[number] }) {
  const zones = floor === '1F'
    ? [
        { id: 'A', x: 18, y: 68, w: 64, h: 46, current: false },
        { id: 'B', x: 104, y: 116, w: 56, h: 42, current: true },
        { id: 'B', x: 18, y: 198, w: 64, h: 56, current: false },
        { id: 'C', x: 176, y: 58, w: 64, h: 40, current: false },
        { id: 'C', x: 176, y: 168, w: 64, h: 42, current: false },
      ]
    : [
        { id: 'A', x: 28, y: 48, w: 64, h: 46, current: false },
        { id: 'B', x: 112, y: 88, w: 56, h: 42, current: false },
        { id: 'C', x: 176, y: 148, w: 64, h: 46, current: false },
        { id: 'D', x: 28, y: 188, w: 72, h: 52, current: false },
      ]

  return (
    <svg viewBox="0 0 260 300" className="route-map" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="map-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0H0V16" fill="none" stroke="#1a3d52" strokeWidth=".6" />
        </pattern>
      </defs>
      <rect width="260" height="300" fill="#07141d" />
      <rect width="260" height="300" fill="url(#map-grid)" />

      <g className="zone">
        {zones.map((zone, index) => (
          <g key={`${floor}-${zone.id}-${index}`}>
            <rect className={`zone-box${zone.current ? ' current' : ''}`} x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx="3" />
            <text x={zone.x + zone.w / 2} y={zone.y + zone.h / 2 + 4} textAnchor="middle">{zone.id}区</text>
          </g>
        ))}
      </g>

      <g className="compass">
        <circle cx="232" cy="268" r="16" />
        <path d="M232 256 L235 268 L232 265 L229 268 Z" />
        <text x="232" y="252" textAnchor="middle">N</text>
      </g>

      <path id="track-main" d="M130 278 V214 C130 184 78 184 78 152 V92 C78 56 118 42 168 42 H220" />
      <path className="route-flow" d="M130 278 V214 C130 184 78 184 78 152 V92 C78 56 118 42 168 42 H220" />
      <path className="arrow" d="M220 42 v-12 m0 12 6-7 m-6 7-6-7" />

      <g className="vehicle">
        <circle r="12" className="vehicle-pulse" />
        <circle r="4.5" className="vehicle-dot" />
        <rect className="vehicle-label" x="-18" y="14" width="36" height="14" rx="2" />
        <text x="0" y="24" textAnchor="middle">GL-01</text>
        <animateMotion dur="16s" repeatCount="indefinite" rotate="0">
          <mpath href="#track-main" />
        </animateMotion>
      </g>
    </svg>
  )
}

function App() {
  useUiScale()
  const [active, setActive] = useState('生命感知')
  const [selectedCase, setSelectedCase] = useState(cases[0])
  const [floor, setFloor] = useState<(typeof floors)[number]>('1F')
  const [scenePhotos, setScenePhotos] = useState<{ id: string; name: string; url: string }[]>([])
  const now = useMemo(() => '2026-08-12 10:25:52', [])

  function addScenePhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files?.length) return
    const next = [...files]
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => ({
        id: `${file.name}-${file.lastModified}-${file.size}`,
        name: file.name,
        url: URL.createObjectURL(file),
      }))
    setScenePhotos((prev) => [...prev, ...next])
    event.target.value = ''
  }

  function removeScenePhoto(id: string) {
    setScenePhotos((prev) => {
      const target = prev.find((photo) => photo.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((photo) => photo.id !== id)
    })
  }

  return (
    <div className="stage">
      <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img src="/resources/prism-logo.svg" alt="" />
          <div>
            <strong>光棱战车</strong>
            <small>PRISM CHARIOT</small>
          </div>
        </div>
        <nav>
          {modules.map(({ label, icon: Icon, tone }) => (
            <button
              key={label}
              className={`module-tab ${active === label ? `active ${tone}` : ''}`}
              onClick={() => setActive(label)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="top-status">
          <span>{now}</span>
          <span className="weekday">星期三</span>
          <span className="online"><i />实时</span>
        </div>
        <button className="mobile-menu" type="button"><Menu size={20} /></button>
      </header>

      {active !== '生命感知' ? (
        <main className="placeholder">
          <div className="placeholder-icon"><Radio size={42} /></div>
          <h1>{active}</h1>
          <p>功能模块正在建设中，当前页面先展示生命感知驾驶舱。</p>
          <button type="button" onClick={() => setActive('生命感知')}>返回生命感知</button>
        </main>
      ) : (
        <main className="dashboard">
          <aside className="left-column">
            <Panel title="厂区总览" icon={<Map size={15} />} className="map-panel">
              <div className="map-grid">
                <FactoryMap floor={floor} />
                <div className="floor-switch">
                  {floors.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={floor === item ? 'active' : ''}
                      onClick={() => setFloor(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </Panel>
            <Panel title="LOG" icon={<Clock3 size={15} />} className="log-panel">
              <div className="log-list">
                {logs.map(([time, text, type]) => (
                  <div className={`log-row ${type}`} key={time + text}>
                    <i />
                    <time>{time}</time>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </aside>

          <section className="center-column">
            <div className="live-heading">
              <span>实时画面</span>
              <b>|</b>
              <span>GL-01</span>
              <b>|</b>
              <span className="live-stamp">{now}</span>
              <span className="live-meta">0.38 m/s　↑ 前进　自动巡检</span>
              <span className="online"><i />在线</span>
            </div>
            <div className="scene">
              <div className="scene-placeholder">
                <div className="placeholder-grid" />
                <div className="camera-ring"><span>LIVE</span></div>
                <strong>实时视频占位画面</strong>
                <small>GL-01 · B 区生产线 · 画面源待接入</small>
              </div>
              <div className="scene-alert">
                <div className="scene-alert-tag">
                  <span>人员倒地</span>
                  <small>置信度 98%</small>
                </div>
                <div className="scene-alert-vitals">
                  <p><span className="vital-label">呼吸</span><strong>10</strong><small>bpm</small></p>
                  <p><span className="vital-label">心跳</span><strong>48</strong><small>bpm</small></p>
                  <p><span className="vital-label">雷达</span><strong>77</strong><small>GHz</small></p>
                </div>
              </div>
            </div>
            <Panel title="CASE记录" icon={<FileText size={15} />} className="case-panel">
              <div className="case-table">
                <div className="case-head">
                  <span>编号</span><span>等级</span><span>时间</span><span>点位</span>
                  <span>事件类型</span><span>状态</span><span>响应人</span><span>更新时间</span>
                </div>
                {cases.map((item) => (
                  <button
                    className={`case-row ${selectedCase.id === item.id ? 'selected' : ''}`}
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedCase(item)}
                  >
                    <span>{item.id}</span>
                    <span><i className={`level-dot ${item.color}`} />{item.level}</span>
                    <span>{item.time}</span>
                    <span>{item.spot}</span>
                    <span>{item.type}</span>
                    <span className={item.state === '处理中' ? 'processing' : item.state === '已确认' ? 'confirmed' : 'closed'}>{item.state}</span>
                    <span>{item.owner}</span>
                    <span>{item.updated}</span>
                  </button>
                ))}
              </div>
              <div className="table-foot">共 5 条记录 <span>‹　1 / 1　›</span></div>
            </Panel>
          </section>

          <aside className="right-column">
            <Panel title="状态信息" icon={<Activity size={15} />} className="status-panel">
              <div className="metrics-grid">
                <Metric label="前方距离" value="12.6" unit="m" />
                <Metric label="运行速度" value="0.38" unit="m/s" />
                <Metric label="所在楼层" value={floor} />
                <Metric label="当前点位" value="B1-086" />
                <Metric label="呼吸频率" value="10" unit="bpm" detected />
                <Metric label="心率" value="48" unit="bpm" detected />
                <Metric label="生命状态" value="异常" tone="warning" />
                <Metric label="事件等级" value="红色" tone="danger" />
              </div>
              <div className="subheading">生命体征趋势（最近 5 分钟）</div>
              <TrendChart />
              <div className="system-status">
                <span><i className="status-dot green" />毫米波雷达 正常</span>
                <span><i className="status-dot green" />视频流 实时</span>
                <span><i className="status-dot green" />数据同步 刚刚</span>
              </div>
            </Panel>
            <Panel title="结案处理" icon={<FileText size={15} />} className="resolution-panel">
              <div className="resolution-case">
                <span className="eyebrow">{selectedCase.id} · <span className="danger-text">{selectedCase.type}</span></span>
                <span className="resolution-meta">点位：{selectedCase.spot}　发生时间：{selectedCase.time}</span>
              </div>
              <label htmlFor="resolution-conclusion">结论
                <select id="resolution-conclusion" name="conclusion" defaultValue="救助">
                  <option>人员已救助，生命体征稳定，事件关闭</option>
                  <option>误报，继续观察</option>
                </select>
              </label>
              <label htmlFor="resolution-notes">响应记录
                <textarea id="resolution-notes" name="notes" defaultValue="10:27 支援人员到达现场；10:29 进行初步检查；10:30 人员意识恢复，生命体征稳定。" />
              </label>
              <div className="form-row">
                <label htmlFor="resolution-operator">操作人<input id="resolution-operator" name="operator" defaultValue="张伟" /></label>
                <label htmlFor="resolution-time">结案时间<input id="resolution-time" name="resolvedAt" defaultValue="2026-08-12 10:32:44" /></label>
              </div>
              <div className="scene-photos">
                <span>现场照片</span>
                <div className="photo-grid">
                  {scenePhotos.map((photo) => (
                    <figure key={photo.id}>
                      <img src={photo.url} alt={photo.name} />
                      <figcaption title={photo.name}>{photo.name}</figcaption>
                      <button type="button" className="photo-remove" onClick={() => removeScenePhoto(photo.id)}>移除</button>
                    </figure>
                  ))}
                  <label className="photo-upload">
                    <ImagePlus size={16} />
                    <span>上传照片</span>
                    <input id="scene-photos" name="scenePhotos" type="file" accept="image/*" multiple onChange={addScenePhotos} />
                  </label>
                </div>
              </div>
              <div className="drawer-actions">
                <button type="button">取消</button>
                <button type="button" className="primary">确认结案</button>
              </div>
            </Panel>
          </aside>
        </main>
      )}
      </div>
    </div>
  )
}

function Metric({ label, value, unit, tone = '', detected = false }: { label: string; value: string; unit?: string; tone?: string; detected?: boolean }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={tone}>{value}{unit ? <small>{unit}</small> : null}</strong>
      {detected ? <em>检测到</em> : null}
    </div>
  )
}

export default App
