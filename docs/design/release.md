# XTodoY 发布与更新

> 依据：SRS F10（FR-UPD-01~11）、D-13~D-15、NFR-SEC-04/05

## 1 版本号

- 语义化版本 `MAJOR.MINOR.PATCH`；预发布 `1.1.0-beta.1`。
- 版本号只在 `package.json` 维护；tag 为 `v<版本号>`。
- 修复 → PATCH；新功能（向后兼容）→ MINOR；数据格式不兼容或大改版 → MAJOR。

## 2 分支与发布流程

```
feature/* ──PR──▶ develop ──PR──▶ main ──tag vX.Y.Z──▶ GitHub Actions: release.yml
                                                         ├─ pnpm install / lint / typecheck / test
                                                         ├─ electron-builder --win --publish always
                                                         │    ├─ XTodoY-Setup-X.Y.Z.exe（NSIS）
                                                         │    ├─ XTodoY-Setup-X.Y.Z.exe.blockmap（差分更新）
                                                         │    └─ latest.yml（版本清单：版本、sha512、大小、发布日期）
                                                         └─ 上传到 AhDaii/XTodoY Releases（草稿 → 人工检查后发布）
```

- 稳定版：tag `vX.Y.Z` → 普通 Release；测试版：tag `vX.Y.Z-beta.N` → 标记为 pre-release。
- Release 以 **草稿** 创建，人工补充发布说明（中文，按"新增 / 改进 / 修复"分组）后再发布；发布后客户端才能检查到。
- 发布说明的格式与原型更新详情对话框一致，直接作为 `releaseNotes` 展示。

## 3 客户端更新（electron-updater）

| 配置 | 值 | 说明 |
|---|---|---|
| provider | `github`，`owner: AhDaii`，`repo: XTodoY` | D-13，仓库已公开 |
| `autoDownload` | 由设置"自动下载更新"决定（默认 true） | FR-UPD-04 |
| `autoInstallOnAppQuit` | true | D-15：退出时静默安装 |
| `allowPrerelease` | 通道为"测试版"时 true | FR-UPD-10 |
| `allowDowngrade` | false | NFR-SEC-04 |
| `disableDifferentialDownload` | false | 使用 blockmap 差分下载 |
| 检查时机 | 启动 60 秒后、之后每 24 小时、休眠唤醒且距上次 > 24 小时 | FR-UPD-01，复用单定时器 |

- electron-updater 内置校验 `latest.yml` 中的 SHA-512；Windows 安装包已签名时额外校验发布者（`publisherName`）。
- 用户级 NSIS（`perMachine: false`、`oneClick: true`），安装与更新都不需要管理员权限（IR-10）。
- 安装前由 update 服务调用备份服务做"更新前备份"（FR-UPD-07）。
- 状态机与 IPC 见 [ipc.md](ipc.md) §2.5，界面见原型 UI-17。

## 4 代码签名（A-5，NFR-SEC-05）

| 阶段 | 方案 |
|---|---|
| 当前（无证书） | 不签名；更新只做 SHA-512 校验；首次安装 SmartScreen 会提示"未知发布者"，在发布说明中说明 |
| 取得证书后 | OV / EV 证书或 Azure Trusted Signing；`CSC_LINK`、`CSC_KEY_PASSWORD`（或 Azure 凭据）只存于 GitHub Actions Secrets；配置 `win.signtoolOptions.publisherName` 启用发布者校验 |

## 5 发布检查清单

- [ ] `package.json` 版本号已更新，CHANGELOG 已补充
- [ ] CI 全绿（lint / typecheck / 单元测试 / E2E）
- [ ] 本地用上一个版本安装，验证自动更新到新版本（下载、校验、退出时安装、数据完整、迁移成功）
- [ ] Release 草稿中的 `latest.yml`、安装包、blockmap 三个文件齐全
- [ ] 发布说明按"新增 / 改进 / 修复"填写
- [ ] 发布后 24 小时内观察 Issues 反馈
