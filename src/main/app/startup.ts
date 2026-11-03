import { app, dialog, shell } from 'electron';
import { DbCorruptError, DbMigrationError, openDatabase, type DB } from '../db/client';
import { latestBackup, restoreFromBackup, setAsideDatabase } from '../db/recovery';

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${d
    .toTimeString()
    .slice(0, 5)}`;

/**
 * 打开数据库；损坏时提示从最近备份恢复（NFR-REL-02），迁移失败时说明数据未改动并退出（NFR-REL-03、FR-UPD-07）。
 * 返回 null 表示用户选择退出。所有恢复操作都不删除文件：损坏的库移到数据目录的 corrupt/ 中保留。
 */
export function openDatabaseOrRecover(dataDir: string): { db: DB; schemaVersion: number } | null {
  for (;;) {
    try {
      return openDatabase(dataDir);
    } catch (e) {
      console.error('[startup] open database failed', e);
      if (e instanceof DbMigrationError) {
        const newer = e.from > e.to;
        const r = dialog.showMessageBoxSync({
          type: 'error',
          title: 'XTodoY',
          message: newer ? '数据来自更新版本的 XTodoY' : '数据库升级失败',
          detail: newer
            ? '当前安装的版本比上次使用的版本旧，无法读取这些数据。请安装最新版本的 XTodoY。'
            : '升级在事务中进行，失败后数据已自动回滚，没有任何改动；升级前的备份也保存在数据目录的 backups 文件夹中。\n\n请重新安装最新版本，或到项目主页反馈问题。',
          buttons: ['打开数据目录', '退出'],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        });
        if (r === 0) void shell.openPath(dataDir);
        return null;
      }
      if (!(e instanceof DbCorruptError)) throw e;
      const b = latestBackup(dataDir);
      const r = dialog.showMessageBoxSync({
        type: 'error',
        title: 'XTodoY',
        message: '数据库文件已损坏',
        detail: b
          ? `可以从最近的备份（${fmt(b.at)}）恢复，这之后的修改会丢失。\n损坏的文件会移到数据目录的 corrupt 文件夹中保留，不会删除。`
          : '没有找到可用的备份。可以使用空的数据库继续，损坏的文件会移到数据目录的 corrupt 文件夹中保留。',
        buttons: b ? ['从备份恢复', '打开数据目录', '退出'] : ['使用空数据库', '打开数据目录', '退出'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
      if (r === 0) {
        if (b) restoreFromBackup(dataDir, b.file);
        else setAsideDatabase(dataDir);
        continue; // 重新打开
      }
      if (r === 1) void shell.openPath(dataDir);
      return null;
    }
  }
}

/** 后台未捕获的异常写入日志并继续运行（NFR-REL-04）；渲染进程崩溃时重新加载，不影响托盘与提醒 */
export function installCrashGuards(): void {
  process.on('uncaughtException', (e) => console.error('[main] uncaught exception', e));
  process.on('unhandledRejection', (e) => console.error('[main] unhandled rejection', e));
  app.on('render-process-gone', (_e, contents, details) => {
    console.error(`[renderer] gone: ${details.reason} (exit ${details.exitCode}) ${contents.getURL()}`);
    if (details.reason !== 'clean-exit' && !contents.isDestroyed()) contents.reload();
  });
  app.on('child-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit') console.error(`[child] ${details.type} gone: ${details.reason}`);
  });
}
