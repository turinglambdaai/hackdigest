# AGENTS.md

HackDigest uses one Racket/Glaze backend in `backend/` and a React/Vite frontend in `apps/desktop/`.
`backend/main.rkt` exports `api` and starts the application only in `module+ main`.
`glaze.rktd` and `glaze-schema.json` own its reviewed application contract.

Before changing routes run `raco glaze schema check --json`; update the baseline only for an intentional reviewed contract change.
Validate with `raco test backend/`, `pnpm test`, `pnpm check`, and `pnpm build`.
Do not replace a failed native WebView with an external browser. Windows/Linux still default to HTTP transport; native packaged parity remains a release gate in the existing Glaze plan.


## 组合定位（Portfolio placement）

- 轨道与授权：轨道 3 免费 + 托管 Pro；授权形态：AGPL-3.0；商业归属：自带 key 全功能免费，托管翻译/同步层订阅。
- 组合归属唯一权威：[PORTFOLIO.md](https://github.com/turinglambdaai/turinglambdaai.github.io/blob/master/PORTFOLIO.md)（turinglambdaai.github.io 仓库）。改归属/授权先改权威档，再同步本节。
- 纪律：价格只进本仓 `PRICING.md`，且收费开始时才发布；README 与产品站不做价格预告。

## 产品交付与下一步（2026-10-23）

- 家族[交付标准](https://github.com/turinglambdaai/turinglambdaai.github.io/blob/master/docs/PRODUCT-STANDARD.md)与[组合策略](https://github.com/turinglambdaai/turinglambdaai.github.io/blob/master/PORTFOLIO.md)是共用政策；本仓具体行为以 `README.md` 为准，不复制五库依赖图。
- 当前执行入口：[产品审查 issue](https://github.com/turinglambdaai/hackdigest/issues/2)。真实 API schema 基线与 CI 检查已接入；下一步做三平台 native transport 与打包验证。BYOK 免费；托管层明确配额、停止行为和成本预算后再开卖。
- 开工先检查干净工作树与远端，以 fast-forward-only 更新并记录 SHA；共享文件一次一个写入者，保留其他 checkout 的未提交工作。
- 每次只完成一个可验收切片，记录 owned files、依赖 pin、命令/平台/产物证据和回滚。已实现、已发布、实机验收分别陈述；不修改 requirements 或复用旧证据来制造通过。
