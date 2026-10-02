# ADR: HackDigest 迁移到 Glaze（Racket 后端 + 保留 React 前端）

日期：2026-10-02 · 状态：R1 进行中 · 分支：`glaze`

## 决策

用 **Glaze**（Tauri-like Racket 框架）替换 Tauri/Rust：Racket 写后端
（存储、LLM 代理、应用壳），React 前端**组件零改动**，只重写 5 个桥接
文件的内部实现。全量 Rivet 原生 UI 重写已被否（2026-10-01 评估：
三平台 UI 重写成本大、对框架边际增益弱、与收费优先排期冲突）。

## 迁移时的框架前提（2026-10-02 核实，全部已合入 glaze main）

| 需求 | glaze 落点 |
|---|---|
| LLM 流式输出（每日 digest 的核心 UX） | #16 → PR #19：`streaming-response` / `event-stream-response` |
| 自动更新 | #17：`check-update`（探测为止）；完整下载安装链路 R3 再做 |
| 窗口状态持久化 + 防搁浅 | #18 → PR #23：`run-app #:window-state #t #:app-id` |
| 外链打开 | `open-browser`（显式工具函数，非 fallback） |
| 单实例 | `single-instance?` |

## 架构映射

Tauri 面（`apps/desktop/src-tauri/`，308 行 Rust）全部由 `backend/` 接管：

| Tauri | Glaze backend | 前端改动点 |
|---|---|---|
| `kv_get/kv_set` | `POST api/kv/*`（SQLite 同 schema） | `packages/core/src/storage.ts` |
| `get/put_translations`、`get/put_items` | `POST api/translations/*`、`api/items/*` | 同上 |
| `read/write_data_file`（settings/library） | `POST api/data/*`（数据目录 JSON 白名单） | `packages/core/src/dataFile.ts` |
| `@tauri-apps/plugin-http` fetch（LLM） | `POST api/llm/chat` + `api/llm/chat/stream`（key 移入 Racket 侧，安全升级） | `packages/core/src/llm.ts` |
| `plugin-opener` | `POST api/open` → `open-browser` | `apps/desktop/src/lib/hooks.ts` |
| `plugin-updater` 原地安装 | `POST api/update/check`（探测）+ 前往下载页 | `apps/desktop/src/lib/updater.ts`、`UpdateBanner.tsx` |
| `plugin-window-state` + 防搁浅 guard | `run-app #:window-state #t`（框架内置） | 无 |

**保持不变**：全部 React 组件、键盘流、i18n、评论树渲染、`hn.ts` /
`algolia.ts` / `hosted.ts`（Firebase 与 Algolia 均带 CORS 头，页面直连
与 Tauri 版一致）、`sanitize.ts`（DOMParser 属视图层）、`store.ts`（UI
状态 + 浏览器 dev 模式的 IndexedDB 兜底）、`translate.ts` / `digest.ts`
的编排逻辑（继续跑在页面里，通过后端 chat 端点发请求，key 不再进
webview 网络层）。

核心手法：**桥接文件保持导出签名不变，只换内部实现**——组件感知不到
Tauri → Glaze 的切换。前端用 `bridge.ts` 里的 `hasBackend()`（探测
`/api/health`，memoized）替代 `isTauri()`；无后端时（vite 纯浏览器
dev）自动落回 IndexedDB / window.open，行为与 Tauri 版的 dev 模式一致。

## 数据与迁移

Tauri 数据目录：`<pref-dir>/site.jrtx.hackdigest/`（macOS
`~/Library/Application Support/`，Win `%APPDATA%`，Linux `~/.config`），
内含 `hackdigest.db`（WAL；kv / translations / hn_items 三表）、
`settings.json`、`library.json`。

Glaze 数据目录定为 `<pref-dir>/hackdigest/`。**schema 与 JSON shape 均
不变**，`backend/migrate.rkt` 首启时整体复制旧目录三个文件（旧安装保持
原样，可回退）。无任何格式转换。

## 更新器 UX 变化（已接受的取舍）

Tauri 版是应用内下载安装重启；glaze #17 当前范围止步于探测。R1 行为：
横幅显示新版本号 + 「前往下载」打开 GitHub Release 页。完整下载安装链
路留给 R3（届时评估 glaze `update.rkt` 的 install-plan 是否够用）。

## 分阶段

- **R1（本分支）**：后端九命令 + LLM 代理（含流式）+ 数据迁移 + 应用壳
  （窗口状态/单实例/外链/更新探测）；前端五个桥接文件内部切换。验收：
  `raco test backend/` 绿、`vite build` 后 `racket backend/main.rkt` 打开
  真窗口、feed/翻译/摘要/digest 流式全链路可用。
- **R2**：`translate/digest` 编排移入 Racket（batch 自愈二分重试下沉）；
  settings 中 apiKey 改为只写不回读（表单显示掩码）。
- **R3**：打包分发（`raco glaze build` 三平台 bundle；Windows 安装器按
  glaze#20/#22 路线接 Inno/NSIS）+ 完整更新链路；移除 `src-tauri/`。

## 风险与已知简化

- R1 的 LLM 代理不做 60s 硬超时（Tauri 版有）：依赖端点可靠性 + 用户
  取消（前端 abort 断开流，后端写入失败即收尾）。R2 若需要，按请求
  custodian 超时补齐。
- `check-update` 对 GitHub `releases/latest` 做版本比较，不解析 Tauri
  `latest.json` 签名格式（那是 R3 安装链路的事）。
- macOS WKWebView 遮挡节流（glaze#2 已关，框架层有结论）不影响本应用
  ——无后台监测需求。
