-- P5：循环事项的首次实例日期，用于"每 N 周 / 月 / 年"的间隔计算（shared/recurrence.ts）
ALTER TABLE todos ADD COLUMN repeat_anchor TEXT;
