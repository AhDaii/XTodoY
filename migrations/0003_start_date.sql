-- 时间跨度待办任务的开始日期（#51）；NULL 表示单日或无日期
ALTER TABLE todos ADD COLUMN start_date TEXT;
