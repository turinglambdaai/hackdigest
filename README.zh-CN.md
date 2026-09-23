# HackDigest

把 Hacker News 读成中文 —— 为「看得懂英文、但读不痛快」的开发者做的 HN 阅读器。

[English](README.md) · **中文**

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE) [![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20mobile%20(Phase%203)-lightgrey)](#roadmap)

Hacker News 大概是互联网上最好的技术首页 —— 但对数以百万计的开发者来说，它也是一堵英文墙。HackDigest 拆掉这堵墙：每一条新闻、每一篇原文、每一个评论楼，按需翻译、按需总结。

## 三层 Digest

1. **文章 Digest** —— HN 链接的原文动辄五千词英文，压缩成几段中文摘要。
2. **评论区 Digest** —— HN 的精华在评论区。八百条回复提炼成「正反双方的核心论点、谁说了什么、社区的最终倾向」。
3. **每日 Digest** —— 今早的首页变成两分钟中文晨读，再决定哪条值得点开。

## 免费 / Pro

全平台客户端免费下载。翻译与 Digest 功能免费层限量、Pro 无限。

| | 免费 | Pro |
|---|---|---|
| 浏览 HN（Top / New / Best / Ask / Show / Jobs） | ✅ | ✅ |
| 阅读优化的评论楼、深色模式 | ✅ | ✅ |
| 收藏与本地历史 | ✅ | ✅ |
| 翻译新闻 + 评论区（按帖子计） | 每日限额 | 无限 |
| 文章 TL;DR 与评论区 Digest | 每日限额 | 无限 |
| 首页每日 Digest | — | ✅ |
| 跨设备同步（桌面 + 手机，一份授权） | — | ✅ |
| 自带 LLM API Key（BYOK） | ✅ 无限 | ✅ |

自带 Key 全功能免费用到天荒地老 —— 这是开源的那一半约定。Pro 是给「只想开箱即用」的人：免配置、免 Key、无限额的托管翻译。

## Roadmap

- **Phase 1 —— 桌面 MVP**（先 Windows，后 macOS）：HN 信息流与评论楼的日常阅读体验打磨；翻译与 Digest 走 BYOK（自带 Key）。全程免费开源。
- **Phase 2 —— 托管服务 + Pro**：订阅制或一次性买断的托管翻译；每日 Digest；一个账号全设备通用。
- **Phase 3 —— 手机端**（iOS / Android）：复用同一套 TypeScript 核心，Pro 授权跨端携带。

## 技术栈

Tauri 2 + TypeScript，单仓库，`apps/<platform>`（沿用 Taskly 验证过的模式）。HackDigest 是内容型应用 —— 文章页、富文本评论树、排版 —— 而内容渲染，web 引擎就是最好的文本引擎。Tauri 让外壳保持小巧原生，其移动端目标让 Phase 3 能整体复用 `packages/core`（HN API 客户端、翻译管线、Digest 提示词）。

HN 数据直接来自官方 [Hacker News API](https://github.com/HackerNews/API) 与 Algolia 搜索 API —— 不爬虫，免费版不需要任何后端。

## 仓库结构

```
hackdigest/
├── apps/desktop/     Tauri 2 桌面应用（Windows / macOS / Linux）
├── apps/mobile/      Phase 3
├── packages/core/    共享 TypeScript 核心：HN API、翻译、Digest
└── docs/
```

## 许可与商业模式

AGPL-3.0 —— 客户端永久开源。托管翻译、Digest 算力与跨设备同步是支撑项目活下去的 Pro 订阅。竞品尽管来读代码；用户尽管自带 Key。
