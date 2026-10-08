# HackDigest

把 Hacker News 读成中文 —— 为「看得懂英文、但读不痛快」的开发者做的 HN 阅读器。

[![CI](https://github.com/turinglambdaai/hackdigest/actions/workflows/ci.yml/badge.svg)](https://github.com/turinglambdaai/hackdigest/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

[English](README.md) · **中文**


应用启动时会检查 GitHub Releases 并提示新版本（一键更新器将随 Glaze 线首个版本回归）。

## 键盘优先

HN 老用户的肌肉记忆全部保留：**j/k** 上下移动选中，**Enter/o** 打开，**s** 收藏，**t** 快翻选中标题，**r** 刷新，**1–6** 切换信息流，**/** 搜索。详情页：**←/u** 返回，**t** 翻译本帖，**Shift+T** 翻译全部评论，**d** AI 摘要。随时按 **?** 呼出速查表。

## 三层 Digest

1. **文章 Digest** —— HN 链接的原文动辄五千词英文，压缩成几段中文摘要。
2. **评论区 Digest** —— HN 的精华在评论区。八百条回复提炼成「正反双方的核心论点、谁说了什么、社区的最终倾向」。
3. **每日 Digest** —— 今早的首页变成两分钟中文晨读，再决定哪条值得点开。

## 免费 / Pro

全平台客户端免费下载。所有功能都可以自带 LLM Key 永久免费解锁（BYOK 真免费）；Pro 托管服务是给「只想开箱即用」的人 —— 免 Key、免配置。

| | 免费（BYOK） | Pro（托管） |
|---|---|---|
| 浏览 HN、阅读优化的评论楼、收藏、深色模式 | ✅ | ✅ |
| 翻译新闻与评论楼 | ✅ 无限 | ✅ 免配置 |
| 文章 TL;DR、评论摘要、每日晨报 | ✅ 无限 | ✅ 免配置 |
| 自带 LLM API Key | ✅ GLM / DeepSeek / 通义 / Kimi / Ollama…… | — 无需 |
| 托管服务（免 Key，合理使用日额度†） | 每设备 7 天免费试用 | ✅ 合理使用内无限† |
| 跨设备同步（一份授权，桌面 + 手机） | — | 规划中（Phase 3） |

† Pro 的**托管**服务采用宽松的每日额度 + 全局共享翻译缓存（HN 流量高度集中在几百个帖子上，缓存命中的帖子服务成本为零）。这让一个平价订阅可以持续经营，同时不会真正限制任何「像人一样阅读」的用户。自带 Key 的路径与此无关 —— 那条路永久免费、真无限。

## Roadmap

- **Phase 1 —— 桌面 MVP** ✅（v0.1.x，Tauri 线）：HN 信息流与评论楼的日常阅读体验打磨；翻译与 Digest 走 BYOK（自带 Key）。
- **Phase 2 —— 托管 Pro 服务**（v0.2.0）：License Key 解锁托管翻译，免配置免 Key；每设备 7 天免费试用、宽松日额度、全局共享缓存。软启动：先手动发售（终身/年度 Key），支付网关随后接入。
- **Phase 3 —— 手机端**（iOS / Android）：复用同一套 TypeScript 核心，Pro 授权跨端携带。

## 技术栈

**Glaze（Racket 后端）+ React + TypeScript**，单仓库，`backend/` + `apps/desktop/` + `packages/core`（HackDigest 是内容型应用：文章页、富文本评论树、排版，而内容渲染，web 引擎就是最好的文本引擎；应用壳、存储、LLM 代理与更新检查住在 [Glaze](https://github.com/turinglambdaai/glaze) 驱动的 Racket 后端里）。

- `packages/core` —— 纯 TypeScript，全端复用：HN API 客户端（官方 Firebase API + Algolia 搜索）、翻译管线、Digest 提示词，以及任意 OpenAI 兼容端点的 BYOK 预置（GLM、DeepSeek、通义、Kimi、OpenAI、Claude……），国内用户可直连国产 API。
- 前端 —— React + Vite + zustand + Tailwind 4，渐进加载的评论树与信息流，深浅色。
- 存储 —— SQLite + JSON 文件，住在 Racket 后端的应用数据目录：收藏、历史、翻译缓存 —— 同一帖子的翻译绝不重复计费。BYOK 的 API Key 只存在后端，页面碰不到。
- 网络 —— LLM 调用经后端代理（含流式）；HN 数据直接来自官方 [Hacker News API](https://github.com/HackerNews/API) 与 Algolia 搜索 API —— 不爬虫。
- 更新 —— 后端对接 GitHub Releases 做版本检查。

## 仓库结构

```
hackdigest/
├── backend/          Racket 后端（Glaze）：存储、LLM 代理、应用壳
├── apps/desktop/     React 前端（构建到 dist/，由后端托管）
├── apps/mobile/      Phase 3
├── packages/core/    共享 TypeScript 核心：HN API、翻译、Digest
└── docs/
```

## 许可与商业模式

AGPL-3.0 —— 客户端永久开源。托管翻译、Digest 算力与跨设备同步是支撑项目活下去的 Pro 订阅。竞品尽管来读代码；用户尽管自带 Key。
