import type { Settings, UiSoundStyle } from '@shared/types';

/**
 * 界面音效（#37，设计系统 §5.4，方案见 design/prototype/sound-variants.html）。
 * 全部用 Web Audio 实时合成：不附带音频文件，没有版权问题，安装包几乎不增加体积。
 * 只在用户于主窗口中操作时调用；后台提醒、循环实例生成等不发声。
 */
export type UiSoundEvent = 'add' | 'done' | 'all' | 'undo' | 'del';

type Prefs = Pick<Settings, 'uiSound' | 'uiSoundStyle' | 'uiSoundVolume'>;
let prefs: Prefs = { uiSound: true, uiSoundStyle: 'mallet', uiSoundVolume: 0.6 };
let ctx: AudioContext | null = null;
/** 同一种声音至少间隔 60 ms，连续快速勾选时不叠成噪音 */
const MIN_GAP_MS = 60;
const lastAt = new Map<UiSoundEvent, number>();

/** 由 App 在设置变化时同步 */
export function setSoundPrefs(p: Prefs): void {
  prefs = p;
}

export function playSound(ev: UiSoundEvent, style: UiSoundStyle = prefs.uiSoundStyle, force = false): void {
  if (!force && (!prefs.uiSound || prefs.uiSoundVolume <= 0)) return;
  const now = performance.now();
  if (!force && now - (lastAt.get(ev) ?? -Infinity) < MIN_GAP_MS) return;
  lastAt.set(ev, now);
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    SETS[style][ev](new Synth(ctx, prefs.uiSoundVolume));
  } catch (e) {
    // 没有音频设备等情况：静默忽略，不影响操作本身
    console.warn('[sound]', e);
  }
}

class Synth {
  constructor(
    private readonly c: AudioContext,
    private readonly vol: number,
  ) {}

  /** 一个音：f 频率（可滑到 f1），t 开始偏移（秒），d 衰减时长，g 音量 */
  tone({ type = 'sine', f, f1, t = 0, a = 0.004, d = 0.18, g = 0.3 }: ToneOpts): void {
    const c = this.c;
    const at = c.currentTime + t;
    const o = c.createOscillator();
    const e = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, at + d * 0.6);
    e.gain.setValueAtTime(0.0001, at);
    e.gain.exponentialRampToValueAtTime(Math.max(0.0001, g * this.vol), at + a);
    e.gain.exponentialRampToValueAtTime(0.0001, at + a + d);
    o.connect(e).connect(c.destination);
    o.start(at);
    o.stop(at + a + d + 0.02);
  }

  /** 短噪声"嗒"（极简风格） */
  click({ t = 0, d = 0.03, g = 0.25, hp = 2500 }: { t?: number; d?: number; g?: number; hp?: number }): void {
    const c = this.c;
    const at = c.currentTime + t;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * d), c.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 4);
    const s = c.createBufferSource();
    const f = c.createBiquadFilter();
    const e = c.createGain();
    s.buffer = buf;
    f.type = 'highpass';
    f.frequency.value = hp;
    e.gain.value = g * this.vol;
    s.connect(f).connect(e).connect(c.destination);
    s.start(at);
  }

  /** 木琴：基音 + 4 倍泛音快速衰减 */
  mallet(f: number, t = 0, g = 0.32): void {
    this.tone({ f, t, d: 0.22, g });
    this.tone({ f: f * 4, t, d: 0.05, g: g * 0.25 });
  }

  /** 风铃：基音 + 非整数泛音，余音较长 */
  bell(f: number, t = 0, g = 0.2): void {
    this.tone({ f, t, d: 0.9, g });
    this.tone({ f: f * 2.76, t, d: 0.35, g: g * 0.35 });
    this.tone({ f: f * 5.4, t, d: 0.15, g: g * 0.15 });
  }
}

interface ToneOpts {
  type?: OscillatorType;
  f: number;
  f1?: number;
  t?: number;
  a?: number;
  d?: number;
  g?: number;
}

const N = {
  E4: 329.63,
  A4: 440,
  C5: 523.25,
  G5: 783.99,
  C6: 1046.5,
  D6: 1174.7,
  E6: 1318.5,
  G6: 1568,
  C7: 2093,
};

const SETS: Record<UiSoundStyle, Record<UiSoundEvent, (s: Synth) => void>> = {
  // A 木质轻敲：完成上扬、取消下行、全部完成为琶音
  mallet: {
    add: (s) => s.mallet(N.G5),
    done: (s) => {
      s.mallet(N.C6);
      s.mallet(N.G6, 0.07, 0.24);
    },
    all: (s) => {
      s.mallet(N.C6);
      s.mallet(N.E6, 0.09);
      s.mallet(N.G6, 0.18);
      s.mallet(N.C7, 0.27, 0.26);
    },
    undo: (s) => {
      s.mallet(N.G5);
      s.mallet(N.C5, 0.07, 0.24);
    },
    del: (s) => s.mallet(N.E4, 0, 0.3),
  },
  // B 气泡：正弦波快速向上滑音
  bubble: {
    add: (s) => s.tone({ f: 420, f1: 820, d: 0.12, g: 0.35 }),
    done: (s) => {
      s.tone({ f: 600, f1: 1200, d: 0.1, g: 0.35 });
      s.tone({ f: 900, f1: 1700, t: 0.08, d: 0.1, g: 0.25 });
    },
    all: (s) => [0, 1, 2, 3].forEach((i) => s.tone({ f: 500 + i * 180, f1: 1000 + i * 300, t: i * 0.07, d: 0.1 })),
    undo: (s) => s.tone({ f: 900, f1: 420, d: 0.14, g: 0.3 }),
    del: (s) => s.tone({ f: 380, f1: 180, d: 0.16, g: 0.32 }),
  },
  // C 极简滴答：短噪声 + 细小高音
  tick: {
    add: (s) => {
      s.click({ g: 0.3 });
      s.tone({ f: 2400, d: 0.03, g: 0.08 });
    },
    done: (s) => {
      s.click({ g: 0.35, hp: 3500 });
      s.tone({ f: 3000, t: 0.02, d: 0.05, g: 0.1 });
    },
    all: (s) => {
      s.click({ g: 0.3 });
      s.tone({ f: 2000, t: 0.03, d: 0.08, g: 0.1 });
      s.tone({ f: 3000, t: 0.1, d: 0.12, g: 0.1 });
    },
    undo: (s) => s.click({ g: 0.28, hp: 1500 }),
    del: (s) => s.click({ g: 0.35, hp: 800, d: 0.05 }),
  },
  // D 清亮风铃：带泛音的铃声，全部完成为大三和弦琶音
  chime: {
    add: (s) => s.bell(N.E6, 0, 0.16),
    done: (s) => {
      s.bell(N.G5);
      s.bell(N.D6, 0.08, 0.16);
    },
    all: (s) => {
      s.bell(N.C6);
      s.bell(N.E6, 0.1);
      s.bell(N.G6, 0.2);
      s.bell(N.C7, 0.32, 0.18);
    },
    undo: (s) => {
      s.bell(N.D6, 0, 0.16);
      s.bell(N.G5, 0.08, 0.14);
    },
    del: (s) => s.bell(N.A4, 0, 0.18),
  },
};
