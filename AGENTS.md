# AGENTS.md

## Authorization decision before implementation

Decision `2026-10-auth-1`: Online hosted-service entitlement, verified on the server with current account state and atomic quotas; no desktop activation lease. Read the complete [local authorization decision](PRICING.md#authorization-decision-for-implementation) and its Chinese counterpart before commercial, trial, update-eligibility or credential work. Record this decision revision and the source/policy SHAs actually read in the PR/handoff. Refresh at each bounded slice; existing agent conversations do not receive this change automatically. Follow the existing product contract and implementation issue; do not activate a payment gate merely because a plan exists.

HackDigest uses one Racket/Glaze backend in `backend/` and a React/Vite frontend in `apps/desktop/`.
`backend/main.rkt` exports `api` and starts the application only in `module+ main`.
`glaze.rktd` and `glaze-schema.json` own its reviewed application contract.

Before changing routes run `raco glaze schema check --json`; update the baseline only for an intentional reviewed contract change.
Validate with `raco test backend/`, `pnpm test`, `pnpm check`, and `pnpm build`.
Do not replace a failed native WebView with an external browser. Windows/Linux still default to HTTP transport; native packaged parity remains a release gate in the existing Glaze plan.


## 组合定位（Portfolio placement）

- 当前决策（2026-10-v2）：免费 BYOK + 限额托管订阅。具体价格、免费/付费边界和开卖门禁以本仓 [PRICING.md](PRICING.md) 为唯一权威；旧版收费候选与早鸟方案已被替代。
- 组合归属：[PORTFOLIO](https://github.com/turinglambdaai/turinglambdaai.github.io/blob/master/PORTFOLIO.md)。当前全部产品开发中、没有实际用户；目标定价不表示已经开卖，不因此立即给开发版加收费墙。
- 免费产品不接商业激活；付费层先实现可验证价值，再接 Commerce/Permit。优先完成本仓既有产品审查 issue；不修改现行源码 LICENSE。

## 产品交付与下一步（2026-10-23）

- 家族[交付标准](https://github.com/turinglambdaai/turinglambdaai.github.io/blob/master/docs/PRODUCT-STANDARD.md)与[组合策略](https://github.com/turinglambdaai/turinglambdaai.github.io/blob/master/PORTFOLIO.md)是共用政策；本仓具体行为以 `README.md` 为准，不复制五库依赖图。
- 当前执行入口：[产品审查 issue](https://github.com/turinglambdaai/hackdigest/issues/2)。真实 API schema 基线与 CI 检查已接入；下一步做三平台 native transport 与打包验证。BYOK 免费；托管层明确配额、停止行为和成本预算后再开卖。
- 开工先检查干净工作树与远端，以 fast-forward-only 更新并记录 SHA；共享文件一次一个写入者，保留其他 checkout 的未提交工作。
- 每次只完成一个可验收切片，记录 owned files、依赖 pin、命令/平台/产物证据和回滚。已实现、已发布、实机验收分别陈述；不修改 requirements 或复用旧证据来制造通过。

## Documentation languages

Public default documentation is English; maintain complete Chinese user paths in `*.zh-CN.md`, with reciprocal links. Update both languages when prices, quotas, installation, recovery, privacy or supported platforms change. API/protocol identifiers and commands remain unchanged; do not maintain a second normative protocol or implementation. Follow the [family language policy](https://github.com/turinglambdaai/turinglambdaai.github.io/blob/master/docs/DOCUMENTATION-LANGUAGES.md). Existing internal notes are not a claim that every document is bilingual.
