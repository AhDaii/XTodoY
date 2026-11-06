import { Fragment, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { monotonePath } from '@shared/curve';
import type { Stats, StatsLog, StatsPeriodKind, StatsSlice } from '@shared/stats';
import { Icon } from '../components/Icon';
import { useStats } from '../lib/data';
import { diffDays, friendlyDate, parse, WEEKDAY_LABELS } from '../lib/dates';
import { useUi } from '../lib/store';

/** 统计页（UI-09，SRS F8；设计系统 §7.7）：摘要卡片 + 按维度切换的主图 + 标签分布 / 完成明细 */
export function StatsPage({ weekStart }: { weekStart: 0 | 1 }) {
  const [period, setPeriod] = useState<StatsPeriodKind>('week');
  const [offset, setOffset] = useState(0);
  const [tagId, setTagId] = useState<string | undefined>();
  const s = useStats({ period, offset, ...(tagId && { tagId }) });

  const switchPeriod = (p: StatsPeriodKind) => {
    setPeriod(p);
    setOffset(0);
  };
  /** 月视图展开某天后"在日视图中查看"（#35） */
  const openDay = (date: string) => {
    if (!s) return;
    setPeriod('day');
    setOffset(Math.min(0, diffDays(date, s.today)));
  };
  const unit = period === 'day' ? '天' : period === 'week' ? '周' : '月';
  const label = s ? periodLabel(s) : '';

  return (
    <main className="main" aria-label="统计">
      <header className="main-header">
        <div>
          <h1>统计</h1>
          <div className="sub">{s ? (s.from === s.to ? `${s.from} ${wd(s.from)}` : `${s.from} ~ ${s.to}`) : ' '}</div>
        </div>
        <span className="spacer" />
        <div className="header-ctl">
          <div className="seg" role="group" aria-label="统计维度">
            {(
              [
                ['day', '日'],
                ['week', '周'],
                ['month', '月'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} aria-pressed={period === v} onClick={() => switchPeriod(v)}>
                {l}
              </button>
            ))}
          </div>
          <div className="period-nav">
            <button className="icon-btn" aria-label={`上一${unit}`} onClick={() => setOffset(offset - 1)}>
              <Icon name="chevronLeft" />
            </button>
            <span className="period" aria-live="polite">
              {label}
            </span>
            <button
              className="icon-btn"
              aria-label={`下一${unit}`}
              disabled={offset >= 0}
              onClick={() => setOffset(Math.min(0, offset + 1))}
            >
              <Icon name="chevronRight" />
            </button>
            {offset !== 0 && (
              <button className="btn sm ghost" onClick={() => setOffset(0)}>
                回到本期
              </button>
            )}
          </div>
        </div>
      </header>
      <div className="main-scroll">
        {s && <StatsBody s={s} label={label} weekStart={weekStart} onDrill={setTagId} onOpenDay={openDay} />}
      </div>
    </main>
  );
}

const wd = (d: string) => `周${WEEKDAY_LABELS[parse(d).getDay()]}`;
const hasDigit = (l: string) => /\d/.test(l);
const heatLevel = (n: number, max: number) => (n <= 0 ? 0 : Math.min(4, Math.ceil((n / Math.max(max, 1)) * 4)));
const hhmm = (at: number) => new Date(at).toTimeString().slice(0, 5);

function periodLabel(s: Stats): string {
  if (s.period === 'day') return s.offset === 0 ? '今天' : s.offset === -1 ? '昨天' : s.from;
  if (s.period === 'week')
    return s.offset === 0 ? '本周' : s.offset === -1 ? '上周' : `${s.from.slice(5)} ~ ${s.to.slice(5)}`;
  const d = parse(s.from);
  return s.offset === 0 ? '本月' : `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
}

function prevName(s: Stats): string {
  if (s.period === 'day') return s.offset === 0 ? '昨天' : '前一天';
  return s.period === 'week' ? '上周同期' : '上月同期';
}

function StatsBody({
  s,
  label,
  weekStart,
  onDrill,
  onOpenDay,
}: {
  s: Stats;
  label: string;
  weekStart: 0 | 1;
  onDrill(id: string | undefined): void;
  onOpenDay(date: string): void;
}) {
  const delta = s.total - s.prevTotal;
  const pct = s.due.total ? Math.round((s.due.done / s.due.total) * 100) : null;
  const peak = s.total ? s.hours.indexOf(Math.max(...s.hours)) : null;
  const inLabel = hasDigit(label) ? ` ${label} ` : label;

  let main: ReactNode;
  if (s.period === 'week')
    main = (
      <div className="panel chart">
        <h2>
          每日完成趋势<span className="help">虚线为前一周，悬停或聚焦圆点查看同日对比</span>
        </h2>
        <WeekTrend s={s} label={label} />
      </div>
    );
  else if (s.period === 'month')
    main = (
      <div className="panel">
        <h2>
          完成日历<span className="help">颜色越深，完成越多；点击日期查看当天完成的事项</span>
        </h2>
        <MonthHeatmap key={s.from} s={s} label={label} weekStart={weekStart} onOpenDay={onOpenDay} />
      </div>
    );
  else
    main = (
      <div className="panel">
        <h2>
          完成时间线<span className="help">{peak !== null ? `最活跃时段 ${peak}:00–${peak + 1}:00` : ''}</span>
        </h2>
        <DayTimeline s={s} />
      </div>
    );

  return (
    <>
      <div className="stats-hero">
        <section className="hero-card hero-main" aria-label="完成数">
          <div className="k">{hasDigit(label) ? `${label} ` : label}完成</div>
          <div className="hero-num">
            <span className="num">{s.total}</span>
            <span className="unit">项</span>
            <span
              className={`pill ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}
              title={`${prevName(s)} ${s.prevTotal} 项`}
            >
              {delta > 0 ? `↑ ${delta}` : delta < 0 ? `↓ ${-delta}` : '持平'}
              <span className="sr-only">，与{prevName(s)}相比</span>
            </span>
          </div>
          <div className="hero-sub">
            {s.period === 'day' ? (
              <>
                {prevName(s)} {s.prevTotal} 项{peak !== null && ` · 最活跃 ${peak}:00–${peak + 1}:00`}
              </>
            ) : (
              <>
                日均 <b className="num">{(s.total / s.elapsed).toFixed(1)}</b> 项 · 最多{' '}
                <b>{s.best ? `${friendlyDate(s.best.date, s.today)} ${s.best.count} 项` : '—'}</b> · {prevName(s)}{' '}
                {s.prevTotal} 项
              </>
            )}
          </div>
        </section>
        <section className="hero-card hero-ring" aria-label="到期完成率">
          <div className="ring-wrap">
            <Ring pct={pct ?? 0} />
            <span className="ring-txt num">{pct === null ? '—' : `${pct}%`}</span>
          </div>
          <div>
            <div className="k">到期完成率</div>
            <div className="hero-sub">
              {s.due.total ? (
                <>
                  截止在{inLabel}的 {s.due.total} 项中
                  <br />
                  已完成 {s.due.done} 项
                </>
              ) : (
                `${label}没有到期事项`
              )}
            </div>
          </div>
        </section>
        <section className="hero-card hero-streak" aria-label="连续完成天数">
          <div className="k">连续完成</div>
          <div className="hero-num">
            <span className="num">{s.streak.current}</span>
            <span className="unit">天</span>
          </div>
          <div className="streak-dots" aria-label="最近 7 天">
            {s.streak.last7.map((x) => (
              <span
                key={x.date}
                className={`sd ${x.on ? 'on' : ''} ${x.date === s.today ? 'today' : ''}`}
                title={`${x.date}${x.on ? ' 有完成' : ' 无完成'}`}
              >
                {WEEKDAY_LABELS[parse(x.date).getDay()]}
              </span>
            ))}
          </div>
          <div className="hero-sub">最长纪录 {s.streak.best} 天</div>
        </section>
      </div>
      {main}
      <div className={s.period === 'day' ? '' : 'two-col'}>
        <TagDistribution s={s} onDrill={onDrill} />
        {s.period !== 'day' && <LogList s={s} />}
      </div>
    </>
  );
}

function Ring({ pct, size = 88, stroke = 9 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--primary-soft)" strokeWidth={stroke} />
      {pct > 0 && (
        <circle
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      )}
    </svg>
  );
}

function WeekTrend({ s, label }: { s: Stats; label: string }) {
  const cur = s.daily.map((d) => ({ ...d, future: d.date > s.today }));
  const prev = s.prevDaily;
  const max = Math.max(4, ...cur.map((x) => x.count), ...prev);
  const W = 680,
    H = 220,
    L = 32,
    R = 20,
    T = 28,
    B = 28;
  const x = (i: number) => L + (i * (W - L - R)) / 6;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const pts = cur.filter((c) => !c.future).map((c, i): [number, number] => [x(i), y(c.count)]);
  const prevPts = prev.map((v, i): [number, number] => [x(i), y(v)]);
  const area = pts.length > 1 ? `${monotonePath(pts)} L${pts.at(-1)![0]},${H - B} L${pts[0]![0]},${H - B} Z` : '';
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}每天完成数折线图，虚线为前一周`}>
        <defs>
          <linearGradient id="area-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--chart-area-from)" />
            <stop offset="1" stopColor="var(--chart-area-to)" />
          </linearGradient>
        </defs>
        {[0, Math.round(max / 2), max].map((t) => (
          <g key={t}>
            <line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        <path d={monotonePath(prevPts)} className="line-prev" />
        {area && <path d={area} fill="url(#area-grad)" />}
        {pts.length > 1 && <path d={monotonePath(pts)} className="line-cur" />}
        {cur.map((c, i) => {
          const isToday = c.date === s.today;
          return (
            <g key={c.date} className="pt" tabIndex={c.future ? -1 : 0}>
              <title>
                {`${c.date} ${wd(c.date)}：${c.future ? '未到' : `完成 ${c.count} 项`} · 前一周同日 ${prev[i] ?? 0} 项`}
              </title>
              {c.future ? (
                <circle cx={x(i)} cy={H - B} r={3} className="dot-future" />
              ) : (
                <>
                  <circle cx={x(i)} cy={y(c.count)} r={isToday ? 6 : 4.5} className={`dot ${isToday ? 'today' : ''}`} />
                  <text className="val" x={x(i)} y={y(c.count) - 12} textAnchor="middle">
                    {c.count}
                  </text>
                </>
              )}
              <text x={x(i)} y={H - 8} textAnchor="middle" className={isToday ? 'xl-today' : ''}>
                {isToday ? '今天' : wd(c.date)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span>
          <i className="sw line" />
          {label}
        </span>
        <span>
          <i className="sw dash" />
          {s.offset === 0 ? '上周' : '前一周'}
        </span>
      </div>
    </>
  );
}

/**
 * 月视图完成日历（#35 方案 A）：点击或回车展开该周下方的一行，列出当天完成的事项；
 * 再点同一天或按 Esc 收起，可跳到日视图查看当天统计。
 */
function MonthHeatmap({
  s,
  label,
  weekStart,
  onOpenDay,
}: {
  s: Stats;
  label: string;
  weekStart: 0 | 1;
  onOpenDay(date: string): void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const pad = (parse(s.from).getDay() - weekStart + 7) % 7;
  const max = Math.max(1, ...s.daily.map((d) => d.count));
  const selIdx = sel ? s.daily.findIndex((d) => d.date === sel) : -1;
  // 展开行插在所选日期所在周的最后一格之后
  const rowEnd = selIdx < 0 ? -1 : Math.min(Math.floor((pad + selIdx) / 7) * 7 + 6 - pad, s.daily.length - 1);

  const toggle = (date: string) => setSel((cur) => (cur === date ? null : date));
  const onKey = (e: KeyboardEvent<HTMLDivElement>, date: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(date);
    }
  };
  const close = () => {
    const d = sel;
    setSel(null);
    if (d) grid.current?.querySelector<HTMLElement>(`[data-date="${d}"]`)?.focus();
  };

  return (
    <>
      <div
        ref={grid}
        className="hm"
        role="grid"
        aria-label={`${label}每日完成热力图`}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && sel) {
            e.stopPropagation();
            close();
          }
        }}
      >
        {Array.from({ length: 7 }, (_, i) => (
          <div key={`w${i}`} className="hm-wd">
            周{WEEKDAY_LABELS[(i + weekStart) % 7]}
          </div>
        ))}
        {Array.from({ length: pad }, (_, i) => (
          <div key={`b${i}`} className="hm-cell blank" aria-hidden="true" />
        ))}
        {s.daily.map((d, i) => {
          const future = d.date > s.today;
          const text = `${d.date} ${future ? '未到' : `完成 ${d.count} 项`}`;
          const open = d.date === sel;
          return (
            <Fragment key={d.date}>
              <div
                className={`hm-cell ${future ? 'future' : `lv${heatLevel(d.count, max)}`} ${d.date === s.today ? 'is-today' : ''} ${open ? 'is-sel' : ''}`}
                role="gridcell"
                data-date={d.date}
                tabIndex={future ? -1 : 0}
                title={text}
                aria-label={text}
                aria-expanded={future ? undefined : open}
                aria-controls={open ? 'hm-day' : undefined}
                onClick={future ? undefined : () => toggle(d.date)}
                onKeyDown={future ? undefined : (e) => onKey(e, d.date)}
              >
                <span className="dd">{i + 1}</span>
                {!future && d.count > 0 && <span className="nn">{d.count}</span>}
              </div>
              {i === rowEnd && sel && (
                <DayDrawer
                  s={s}
                  date={sel}
                  count={s.daily[selIdx]!.count}
                  arrow={(((pad + selIdx) % 7) + 0.5) / 7}
                  onOpenDay={onOpenDay}
                />
              )}
            </Fragment>
          );
        })}
      </div>
      <div className="legend">
        <span>少</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <i key={l} className={`hm-sw lv${l}`} />
        ))}
        <span>多</span>
        <span className="help">· 格内右下角数字为当天完成数</span>
      </div>
    </>
  );
}

/** 完成日历中展开的某一天（#35） */
function DayDrawer({
  s,
  date,
  count,
  arrow,
  onOpenDay,
}: {
  s: Stats;
  date: string;
  count: number;
  /** 指向所选日期的小箭头的水平位置（0–1） */
  arrow: number;
  onOpenDay(date: string): void;
}) {
  const items = s.logs.filter((l) => l.date === date).sort((a, b) => a.at - b.at);
  // 完成明细最多返回 STATS_LOG_LIMIT 条（最近的），极端情况下较早的日期可能不全
  const missing = count - items.length;
  return (
    <div
      id="hm-day"
      className="hm-drawer"
      role="region"
      aria-label={`${date} 完成的事项`}
      style={{ '--arrow': `${arrow * 100}%` } as CSSProperties}
    >
      <div className="hd-head">
        {parse(date).getMonth() + 1}月{parse(date).getDate()}日 {wd(date)}
        <span className="sub">完成 {count} 项</span>
        <span className="spacer" />
        <button className="btn sm ghost" onClick={() => onOpenDay(date)}>
          在日视图中查看
          <Icon name="chevronRight" size={14} />
        </button>
      </div>
      {items.length ? (
        <ul className="log-list">
          {items.map((l) => (
            <li key={l.id}>
              <span className="t">{hhmm(l.at)}</span>
              <span className="ok">
                <Icon name="checkCircle" size={14} />
              </span>
              <LogTitle log={l} className="lt" />
              <TagChip log={l} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="help">这一天没有完成记录</p>
      )}
      {missing > 0 && items.length > 0 && <p className="help">还有 {missing} 项未列出，可在日视图中查看全部</p>}
    </div>
  );
}

function DayTimeline({ s }: { s: Stats }) {
  const max = Math.max(1, ...s.hours);
  const items = [...s.logs].sort((a, b) => a.at - b.at);
  return (
    <>
      <div className="hour-strip" role="img" aria-label="按小时分布">
        {s.hours.map((n, h) => (
          <div key={h} className={`hs-cell lv${heatLevel(n, max)}`} title={`${h}:00–${h + 1}:00 完成 ${n} 项`} />
        ))}
      </div>
      <div className="hour-axis">
        <span>0:00</span>
        <span>6:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
      {items.length ? (
        <ol className="timeline">
          {items.map((l) => (
            <li key={l.id}>
              <time className="num">{hhmm(l.at)}</time>
              <span className="node">
                <Icon name="check" size={10} />
              </span>
              <LogTitle log={l} className="tl-title" />
              <TagChip log={l} />
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty" style={{ padding: 32 }}>
          <div className="badge">
            <Icon name="clock" size={24} />
          </div>
          <h2>这一天还没有完成记录</h2>
        </div>
      )}
    </>
  );
}

function TagChip({ log }: { log: StatsLog }) {
  if (!log.tag) return null;
  return (
    <span className={`chip tc-${log.tag.color}`}>
      <span className="dot" />
      <span>{log.tag.name}</span>
    </span>
  );
}

/** 明细标题：单击跳转到事项（FR-STA-05）；事项已被永久删除时只显示文字 */
function LogTitle({ log, className }: { log: StatsLog; className: string }) {
  const { go, select } = useUi();
  if (!log.todoId) return <span className={className}>{log.title}</span>;
  return (
    <button
      className={`${className} link-btn`}
      title="查看事项"
      onClick={() => {
        go({ kind: 'view', view: 'all' });
        select(log.todoId);
      }}
    >
      {log.title}
    </button>
  );
}

function Donut({
  segs,
  size = 132,
  stroke = 18,
}: {
  segs: { v: number; color: string }[];
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segs.reduce((n, x) => n + x.v, 0) || 1;
  const gap = segs.length > 1 ? 2 : 0;
  const mid = size / 2;
  const lens = segs.map((x) => (c * x.v) / total);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((n, l) => n + l, 0));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={stroke} />
      {segs.map((x, i) => {
        const len = lens[i]!;
        return (
          <circle
            key={i}
            cx={mid}
            cy={mid}
            r={r}
            fill="none"
            stroke={x.color}
            strokeWidth={stroke}
            strokeDasharray={`${Math.max(len - gap, 0.5)} ${c}`}
            strokeDashoffset={-starts[i]!}
            transform={`rotate(-90 ${mid} ${mid})`}
          />
        );
      })}
    </svg>
  );
}

// 下钻时，只带了父标签本身（没有细分到子标签）的记录归为"未细分"
const sliceName = (x: StatsSlice) => (x.tag ? (x.self ? '未细分' : x.tag.name) : '无标签');
const sliceColor = (x: StatsSlice) => (x.tag ? `var(--tag-${x.tag.color}-fg)` : 'var(--control-border)');

function TagDistribution({ s, onDrill }: { s: Stats; onDrill(id: string | undefined): void }) {
  const total = s.byTag.reduce((n, x) => n + x.count, 0);
  return (
    <div className="panel">
      <h2>
        按标签分布
        <span className="help">{s.drill ? `"${s.drill.name}"下的子标签` : '按根标签汇总，单击可查看子标签'}</span>
        {s.drill && (
          <button className="btn sm ghost drill-back" onClick={() => onDrill(undefined)}>
            <Icon name="chevronLeft" size={14} />
            全部标签
          </button>
        )}
      </h2>
      {s.byTag.length ? (
        <div className="donut-wrap">
          <div className="donut">
            <Donut segs={s.byTag.map((x) => ({ v: x.count, color: sliceColor(x) }))} />
            <div className="donut-center">
              <b className="num">{total}</b>
              <span>项</span>
            </div>
          </div>
          <ul className="donut-legend">
            {s.byTag.map((x) => {
              const body = (
                <>
                  <span className="dot" style={{ background: sliceColor(x) }} />
                  <span className="nm" title={sliceName(x)}>
                    {sliceName(x)}
                  </span>
                  <span className="num">{x.count}</span>
                  <span className="pc num">{Math.round((x.count / total) * 100)}%</span>
                </>
              );
              const drillable = !s.drill && x.tag;
              return (
                <li key={x.tag?.id ?? 'none'}>
                  {drillable ? (
                    <button
                      className="legend-btn"
                      onClick={() => onDrill(x.tag!.id)}
                      aria-label={`查看"${x.tag!.name}"的子标签分布`}
                    >
                      {body}
                    </button>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="help">暂无数据</p>
      )}
    </div>
  );
}

function LogList({ s }: { s: Stats }) {
  const byDay = new Map<string, StatsLog[]>();
  for (const l of s.logs) byDay.set(l.date, [...(byDay.get(l.date) ?? []), l]);
  return (
    <div className="panel">
      <h2>
        完成明细
        <span className="help">
          {s.total} 条{s.logsTruncated ? `，显示最近 ${s.logs.length} 条` : ''}
        </span>
      </h2>
      {s.logs.length ? (
        <div className="log-groups">
          {[...byDay].map(([d, ls]) => (
            <div key={d} className="lg-day">
              <div className="lg-head">
                {friendlyDate(d, s.today)}
                <span>
                  {d.slice(5)} · {ls.length} 项
                </span>
              </div>
              <ul className="log-list">
                {ls.map((l) => (
                  <li key={l.id}>
                    <span className="t">{hhmm(l.at)}</span>
                    <span className="ok">
                      <Icon name="checkCircle" size={14} />
                    </span>
                    <LogTitle log={l} className="lt" />
                    <TagChip log={l} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="help">本期还没有完成记录</p>
      )}
    </div>
  );
}
