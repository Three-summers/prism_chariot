import { useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowUpRight, Bell, CheckCircle2, ChevronDown, Clock3,
  Crosshair, FileText, HeartPulse, Map, Maximize2, Menu, MoreHorizontal, Radio,
  ScanLine, Thermometer, UserRound, X, Zap,
} from 'lucide-react'

type Module = { label: string; icon: typeof ScanLine; tone: string }
const modules: Module[] = [
  { label: '线卡识别', icon: ScanLine, tone: 'cyan' },
  { label: '线突识别', icon: Crosshair, tone: 'cyan' },
  { label: '磁极板识别', icon: Activity, tone: 'cyan' },
  { label: '红外测温', icon: Thermometer, tone: 'orange' },
  { label: '生命感知', icon: HeartPulse, tone: 'violet' },
]

const logs = [
  ['10:24:18', 'GL-01 进入 B 区域', 'info'], ['10:25:02', '生命感知扫描已启动', 'info'],
  ['10:25:48', '检测到人员静止', 'info'], ['10:25:49', '毫米波生命体征检测中', 'info'],
  ['10:25:52', '人员倒地 / 生命体征异常', 'danger'], ['10:25:53', '事件已生成：B1-086', 'info'],
  ['10:25:55', '通知：运营中心', 'info'], ['10:26:01', '运营中心已接收', 'info'],
  ['10:27:05', '支援人员已派发', 'info'], ['10:30:18', '现场处置中', 'info'],
  ['10:32:44', '等待结案处理', 'info'],
]

const cases = [
  { level: '红色', color: 'red', time: '2026-08-12 10:25:52', spot: 'B1-086', type: '人员倒地 / 生命体征异常', state: '处理中', owner: '张伟', updated: '10:30:18' },
  { level: '橙色', color: 'orange', time: '2026-08-12 09:58:23', spot: 'A1-042', type: '线卡异常', state: '已确认', owner: '李强', updated: '10:02:11' },
  { level: '黄色', color: 'yellow', time: '2026-08-12 09:32:47', spot: 'C2-118', type: '线突出疑似', state: '已关闭', owner: '王磊', updated: '09:45:33' },
  { level: '黄色', color: 'yellow', time: '2026-08-12 08:46:05', spot: 'B1-063', type: '磁极板温度偏高', state: '已关闭', owner: '陈晨', updated: '08:58:21' },
  { level: '橙色', color: 'orange', time: '2026-08-12 08:12:30', spot: 'E1-009', type: '红外测温超限', state: '已关闭', owner: '赵敏', updated: '08:23:41' },
]

function Panel({ title, icon, children, className = '' }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-title">{icon}{title}<MoreHorizontal size={15} className="muted-icon" /></div>{children}</section>
}

function TrendChart() {
  const breath = '0,53 28,55 56,52 84,55 112,51 140,53 168,50 196,54 224,51 252,52 280,49 308,54 336,52 364,56 392,53 420,58 448,60 476,64 504,68'
  const heart = '0,72 28,71 56,74 84,72 112,70 140,72 168,69 196,71 224,70 252,74 280,72 308,76 336,72 364,75 392,73 420,77 448,79 476,83 504,86'
  return <div className="trend-wrap"><div className="legend"><span><i className="dot violet" />呼吸频率 (bpm)</span><span><i className="dot cyan" />心率 (bpm)</span><span className="axis-note">心率 (bpm)</span></div><svg className="trend-chart" viewBox="0 0 520 130" preserveAspectRatio="none"><g className="grid">{[20,45,70,95,120].map(y => <line key={y} x1="0" x2="520" y1={y} y2={y} />)}{[60,160,260,360,460].map(x => <line key={x} x1={x} x2={x} y1="0" y2="112" />)}</g><polyline points={breath} className="line breath" /><polyline points={heart} className="line heart" /><circle cx="504" cy="53" r="4" className="end violet-fill" /><circle cx="504" cy="86" r="4" className="end cyan-fill" /></svg><div className="chart-labels"><span>10:20</span><span>10:21</span><span>10:22</span><span>10:23</span><span>10:24</span><span>10:25</span></div></div>
}

function App() {
  const [active, setActive] = useState('生命感知')
  const [caseOpen, setCaseOpen] = useState(true)
  const now = useMemo(() => '2026-08-12 10:25:52', [])
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><img src="/resources/prism-logo.svg" /><div><strong>光棱战车</strong><small>PRISM CHARIOT</small></div></div><nav>{modules.map(({ label, icon: Icon, tone }) => <button key={label} className={`module-tab ${active === label ? `active ${tone}` : ''}`} onClick={() => setActive(label)}><Icon size={18} />{label}</button>)}</nav><div className="top-status"><span>{now}</span><span className="weekday">星期三</span><span className="online"><i />实时</span></div><button className="mobile-menu"><Menu size={20} /></button></header>
    {active !== '生命感知' ? <main className="placeholder"><div className="placeholder-icon"><Radio size={42} /></div><h1>{active}</h1><p>功能模块正在建设中，当前页面先展示生命感知驾驶舱。</p><button onClick={() => setActive('生命感知')}>返回生命感知</button></main> : <main className="dashboard">
      <aside className="left-column"><Panel title="厂区总览（轨道平面图）" icon={<Map size={15} />} className="map-panel"><div className="map-grid"><div className="zone zone-a">A区</div><div className="zone zone-b">B区</div><div className="zone zone-c">C区</div><div className="zone zone-d">D区</div><svg viewBox="0 0 260 350" className="route-map"><path d="M130 345V250C130 220 92 220 92 188V106C92 72 122 55 165 55h42" /><path d="M130 250V188" className="route-thin" /><circle cx="130" cy="188" r="13" className="vehicle-pulse" /><circle cx="130" cy="188" r="5" className="vehicle-dot" /><text x="150" y="184">GL-01</text><path d="M207 55v-18m0 18 7-8m-7 8-7-8" className="arrow" /></svg><div className="compass">N</div></div><div className="floor-switch"><button className="selected">1F</button><button>3F</button></div></Panel><Panel title="LOG" icon={<Clock3 size={15} />} className="log-panel"><div className="log-list">{logs.map(([time, text, type]) => <div className={`log-row ${type}`} key={time + text}><i /> <time>{time}</time><span>{text}</span></div>)}</div></Panel></aside>
      <section className="center-column"><div className="live-heading"><span>实时画面</span><b>|</b><span>车辆：GL-01</span><span className="live-meta">速度：0.38 m/s　|　方向：前进　|　模式：自动巡检</span><span className="online"><i />在线</span></div><div className="scene"><img src="/resources/life-sensing-reference.png" /><div className="scene-wash" /><div className="scene-caption"><span>实时画面</span><b>|</b><span>{now}</span><small>车辆：GL-01　楼层：1F　点位：B1-086</small></div><div className="person-box"><span>人员倒地</span><small>置信度：98%</small></div><div className="vital-callout"><div><span>毫米波生命体征检测（77GHz）</span><b>◉</b></div><p>呼吸频率 <strong>10</strong> <small>bpm</small></p><p>心跳频率 <strong>48</strong> <small>bpm</small></p></div><div className="scan-corner tl" /><div className="scan-corner br" /></div><div className="scene-footer"><span>点位：<b>B1-086</b></span><span>楼层：<b>1F</b></span><span>速度：<b>0.38 m/s</b></span><span>方向：<b>↑ 前进</b></span></div><Panel title="CASE记录" icon={<FileText size={15} />} className="case-panel"><div className="case-table"><div className="case-head"><span>等级</span><span>时间</span><span>点位</span><span>事件类型</span><span>状态</span><span>响应人</span><span>更新时间</span></div>{cases.map((item, index) => <button className={`case-row ${index === 0 ? 'selected' : ''}`} key={item.time} onClick={() => setCaseOpen(true)}><span><i className={`level-dot ${item.color}`} />{item.level}</span><span>{item.time}</span><span>{item.spot}</span><span>{item.type}</span><span className={item.state === '处理中' ? 'processing' : 'closed'}>{item.state}</span><span>{item.owner}</span><span>{item.updated}</span></button>)}</div><div className="table-foot">共 5 条记录 <span>‹　1 / 1　›</span></div></Panel></section>
      <aside className="right-column"><Panel title="状态信息" icon={<Activity size={15} />}><div className="metrics-grid"><Metric label="前方距离" value="12.6" unit="m" /><Metric label="运行速度" value="0.38" unit="m/s" /><Metric label="所在楼层" value="1F" /><Metric label="当前点位" value="B1-086" /><Metric label="呼吸频率" value="10" unit="bpm" /><Metric label="心率" value="48" unit="bpm" /><Metric label="生命状态" value="异常" tone="warning" /><Metric label="事件等级" value="红色" tone="danger" /></div><div className="subheading">生命体征趋势（最近 5 分钟）</div><TrendChart /></Panel><Panel title="点位信息" icon={<Crosshair size={15} />}><div className="location-list"><p><span>建筑：</span>B 区厂房</p><p><span>楼层：</span>1F</p><p><span>区域：</span>B1 生产线</p><p><span>坐标：</span>X 128.45 m　Y 76.32 m　Z 6.20 m</p></div></Panel><Panel title="系统状态" icon={<Zap size={15} />}><div className="system-status"><span><i className="status-dot green" />毫米波雷达</span><b>正常</b><span><i className="status-dot green" />视频流</span><b>实时</b><span><i className="status-dot green" />数据同步</span><b>刚刚</b></div></Panel></aside>
    </main>}
    {caseOpen && active === '生命感知' && <div className="case-drawer"><div className="drawer-title"><div><span className="eyebrow">事件　<span className="danger-text">人员倒地 / 生命体征异常（红色）</span></span><h2>结案窗口 / 结案处理</h2></div><button onClick={() => setCaseOpen(false)}><X /></button></div><div className="drawer-meta"><span>点位：B1-086（1F / B1 生产线）</span><span>发生时间：{now}</span></div><label>结论 <select defaultValue="救助"><option>人员已救助，生命体征稳定，事件关闭</option><option>误报，继续观察</option></select></label><label>响应记录<textarea defaultValue="10:27 支援人员到达现场；10:29 进行初步检查；10:30 人员意识恢复，生命体征稳定。" /></label><div className="form-row"><label>操作人<input defaultValue="张伟" /></label><label>结案时间<input defaultValue="2026-08-12 10:32:44" /></label></div><div className="evidence"><span>证据</span><div><figure><img src="/resources/life-sensing-reference.png" /><figcaption>事故画面<br />10:25:52</figcaption></figure><figure><div className="mini-chart" /><figcaption>生命体征曲线<br />10:25:52</figcaption></figure><figure><div className="responder" /><figcaption>现场照片<br />10:30:05</figcaption></figure><figure><div className="doc-thumb"><FileText /></div><figcaption>处置记录<br />10:30:18</figcaption></figure></div></div><div className="drawer-actions"><button onClick={() => setCaseOpen(false)}>取消</button><button className="primary" onClick={() => setCaseOpen(false)}>确认结案</button></div></div>}
  </div>
}

function Metric({ label, value, unit, tone = '' }: { label: string; value: string; unit?: string; tone?: string }) { return <div className="metric"><span>{label}</span><strong className={tone}>{value} <small>{unit}</small></strong>{label.includes('频率') || label === '心率' ? <em>检测到</em> : null}</div> }

export default App
