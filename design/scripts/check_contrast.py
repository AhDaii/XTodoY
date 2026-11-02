"""校验 design/tokens.css 中关键颜色组合的 WCAG 对比度。

用法：python design/scripts/check_contrast.py
文本组合要求 ≥ 4.5:1，非文本（控件边框、焦点环、图标）要求 ≥ 3:1。
"""
import re
import sys
from pathlib import Path

TOKENS = Path(__file__).resolve().parents[1] / "tokens.css"

# (前景, 背景, 最低对比度)
PAIRS = [
    ("foreground", "surface", 4.5),
    ("foreground", "background", 4.5),
    ("foreground", "surface-sunken", 4.5),
    ("foreground-muted", "surface", 4.5),
    ("foreground-muted", "surface-sunken", 4.5),
    ("foreground-subtle", "surface", 4.5),
    ("primary-foreground", "primary", 4.5),
    ("primary-soft-foreground", "primary-soft", 4.5),
    ("primary", "surface", 3.0),
    ("foreground", "surface-selected", 4.5),
    ("accent", "surface", 4.5),
    ("success", "surface", 4.5),
    ("warning", "surface", 4.5),
    ("destructive", "surface", 4.5),
    ("destructive-foreground", "destructive", 4.5),
    ("control-border", "surface", 3.0),
    ("ring", "surface", 3.0),
    ("priority-high", "surface", 3.0),
    ("priority-medium", "surface", 3.0),
    ("priority-low", "surface", 3.0),
] + [(f"tag-{c}-fg", f"tag-{c}-bg", 4.5) for c in
     "teal blue indigo violet pink red orange amber lime green cyan slate".split()]


def parse(block: str) -> dict:
    return {k: v for k, v in re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})", block)}


def lum(hex_color: str) -> float:
    def ch(c):
        c = int(c, 16) / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(hex_color[i:i + 2]) for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a: str, b: str) -> float:
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def main() -> int:
    css = TOKENS.read_text(encoding="utf-8")
    root = css.split(".dark {")[0]
    dark = css.split(".dark {")[1].split("}")[0]
    light_vals = parse(root)
    themes = {"light": light_vals, "dark": {**light_vals, **parse(dark)}}
    failed = 0
    for name, vals in themes.items():
        for fg, bg, need in PAIRS:
            r = ratio(vals[fg], vals[bg])
            ok = r >= need
            failed += not ok
            flag = "OK  " if ok else "FAIL"
            print(f"{flag} {name:5} {fg:24} on {bg:18} {r:5.2f} (≥{need})")
    print(f"\n{failed} 项未达标")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
