import { useEffect, useMemo, useState } from 'react';
import { backend } from '../api';
import type { BlockActivity, BlockSearchResult } from '../api/backend';
import { StrokeIcon } from '../icons';
import './CalendarView.css';

/**
 * [M3.5a 日历 + 块热力图]
 *
 * 按月显示写作节奏:某天写了多少块(创建 + 更新)决定格子深浅(薄荷绿 → teal 渐变)。
 * 点击某天 → 下方展示当天写下的块(块片段 + 来源笔记 + 块时间戳),可点跳笔记。
 * 空态:本月无任何写入显示「本月暂无写作足迹」。
 */
interface CalendarViewProps {
  onSelectNote: (note: { id: string; title: string }) => void;
}

/** 月历星期表头(周日开头,符合中文习惯) */
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 毫秒 → 本地日 "YYYY-MM-DD" */
function toDay(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 当天 00:00 本地毫秒 */
function dayStartLocal(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function CalendarView({ onSelectNote }: CalendarViewProps) {
  // 当前渲染的月份(任意 Date,只看其年+月)
  const [cursor, setCursor] = useState(() => new Date());
  const [activity, setActivity] = useState<BlockActivity[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayBlocks, setDayBlocks] = useState<BlockSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  const year = cursor.getFullYear();
  const month = cursor.getMonth(); // 0-based

  // 本月的 start/end 本地毫秒
  const monthStart = useMemo(
    () => new Date(year, month, 1).getTime(),
    [year, month],
  );
  const monthEnd = useMemo(
    () => new Date(year, month + 1, 1).getTime() - 1,
    [year, month],
  );

  // 月份切换 → 拉取该月块活跃
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    backend.getBlockActivity(monthStart, monthEnd)
      .then(data => { if (!cancelled) setActivity(data); })
      .catch(() => { if (!cancelled) setActivity([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [monthStart, monthEnd]);

  // 选中某天 → 拉取当天块
  useEffect(() => {
    let cancelled = false;
    if (!selectedDay) { setDayBlocks([]); return; }
    const [y, m, d] = selectedDay.split('-').map(Number);
    const start = new Date(y, m - 1, d).getTime();
    const end = start + 86400_000 - 1;
    setDayBlocks([]);
    backend.getBlocksInRange(start, end)
      .then(data => { if (!cancelled) setDayBlocks(data); })
      .catch(() => { if (!cancelled) setDayBlocks([]); });
    return () => { cancelled = true; };
  }, [selectedDay]);

  const activityMap = useMemo(() => {
    const m = new Map<string, BlockActivity>();
    activity.forEach(a => m.set(a.date, a));
    return m;
  }, [activity]);

  // 该月最大写入量,用于相对色阶
  const maxCount = useMemo(() => {
    let max = 1;
    activity.forEach(a => { max = Math.max(max, a.created + a.updated); });
    return max;
  }, [activity]);

  // 生成月历格子:首位星期偏移 + 当月天数
  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay(); // 0=周日
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    return out;
  }, [year, month]);

  /** 色阶:0 无写入;1..4 越写越深(薄荷绿→teal) */
  const heatLevel = (count: number) => {
    if (count <= 0) return 0;
    return Math.max(1, Math.min(4, Math.ceil((count / maxCount) * 4)));
  };

  const dateStr = (d: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const todayStr = toDay(Date.now());

  const prevMonth = () => setCursor(new Date(year, month - 1, 1));
  const nextMonth = () => setCursor(new Date(year, month + 1, 1));

  const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const snippet = (content: string) => content.replace(/[#*_`~[\]]/g, '').trim();

  return (
    <div className="calendar-view">
      <div className="calendar-header">
        <button className="calendar-nav-btn" onClick={prevMonth} title="上个月">
          <StrokeIcon name="chevron_left" size={16} />
        </button>
        <div className="calendar-title">
          {year} 年 {month + 1} 月
        </div>
        <button className="calendar-nav-btn" onClick={nextMonth} title="下个月">
          <StrokeIcon name="chevron_right" size={16} />
        </button>
        <button className="calendar-today-btn" onClick={() => { setCursor(new Date()); setSelectedDay(todayStr); }} title="回到今天">
          今天
        </button>
      </div>

      {/* 周表头 */}
      <div className="calendar-week">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className={`calendar-weekday ${i === 0 || i === 6 ? 'weekend' : ''}`}>{w}</div>
        ))}
      </div>

      {/* 月历网格(热力图着色) */}
      <div className="calendar-grid">
        {cells.map((d, i) => {
          if (d === null) return <div key={`blank-${i}`} className="calendar-cell blank" />;
          const ds = dateStr(d);
          const act = activityMap.get(ds);
          const count = act ? act.created + act.updated : 0;
          const level = heatLevel(count);
          const isToday = ds === todayStr;
          const isSelected = ds === selectedDay;
          return (
            <button
              key={ds}
              className={`calendar-cell heat-${level} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedDay(isSelected ? null : ds)}
              title={count > 0 ? `${ds} · 写了 ${count} 块` : ds}
            >
              <span className="calendar-daynum">{d}</span>
              {count > 0 && <span className="calendar-count">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="calendar-legend">
        <span>少</span>
        {[0, 1, 2, 3, 4].map(l => (
          <span key={l} className={`legend-cell heat-${l}`} />
        ))}
        <span>多</span>
      </div>

      {/* 当天块明细 */}
      <div className="calendar-day-detail">
        {!selectedDay ? (
          <p className="calendar-empty">点击有颜色的日期,查看当天写了哪些内容;空月请切换月份。</p>
        ) : loading && dayBlocks.length === 0 ? (
          <p className="calendar-empty">加载中...</p>
        ) : (
          <>
            <div className="calendar-day-title">
              <StrokeIcon name="calendar" size={15} />
              {selectedDay}
              <span className="calendar-day-summary">
                {activityMap.get(selectedDay)
                  ? `创建 ${activityMap.get(selectedDay)!.created} · 更新 ${activityMap.get(selectedDay)!.updated}`
                  : '当天无写入'}
              </span>
            </div>
            {dayBlocks.length === 0 ? (
              <p className="calendar-empty">当天没有写入的块。空态:继续阅读或换一天看看。</p>
            ) : (
              <ul className="calendar-block-list">
                {dayBlocks.map(b => (
                  <li key={b.block_id} className="calendar-block-item">
                    <div className="calendar-block-note" onClick={() => onSelectNote({ id: b.note_id, title: b.note_title })}>
                      {b.note_title || '未命名笔记'}
                      <span className="calendar-block-time">{fmtTime(b.updated_at)}</span>
                    </div>
                    <p className="calendar-block-snippet">{snippet(b.content) || '（空块）'}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
