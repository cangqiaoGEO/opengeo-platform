# OpenGEO Platform（elmo 分叉声明）

本仓库是 [elmohq/elmo](https://github.com/elmohq/elmo)（MIT, Copyright (c) 2026 Blue Whale Software, LLC）的分叉，
作为 **OpenGEO 的产品层**：一个可自托管的 AI 可见度平台，中外引擎同列一等公民。
标准与工具层在 [cangqiaoGEO](https://github.com/cangqiaoGEO) 组织的六层仓库（spec / audit / insights / skills / agentready / index）。

## 分叉策略：fork-and-diverge

锁定分叉点自主演进，不承诺跟随上游功能；`upstream` remote 保留用于按需 cherry-pick 修复。
上游 LICENSE 与版权声明按 MIT 要求完整保留；elmo 名称与 logo 属上游商誉，将在去品牌化清扫中全部移除。

## 已完成的分叉改动

- **中文引擎官方 API Provider**（`packages/lib/src/providers/registry/chinese-api.ts`）：
  豆包（火山方舟 Responses + web_search）、千问（DashScope 强制联网 + 结构化引用）、
  DeepSeek、元宝（腾讯 TokenHub + 联网检索）。端点与解析移植自 OpenGEO 实测代码
  （opengeo-audit / opengeo-insights，MIT）；纯 fetch 零新增依赖，不触碰上游供应链策略。
- KNOWN_MODELS 增加 doubao / yuanbao；STATUS_TARGETS 增加四个中文引擎监测目标。
- 配置示例：`SCRAPE_TARGETS=doubao:volcengine:doubao-seed-2-0-lite-260215:online,qwen:dashscope:qwen-plus:online,deepseek:deepseek-api:deepseek-chat,yuanbao:tencent-tokenhub:hunyuan-turbos-latest:online`
  凭证环境变量：`ARK_API_KEY` / `DASHSCOPE_API_KEY` / `DEEPSEEK_API_KEY` / `TENCENT_TOKENHUB_API_KEY`。

## 本地部署（macOS，已验证）

```bash
pnpm install
brew services start postgresql@18 && /opt/homebrew/opt/postgresql@18/bin/createdb opengeo_platform
cp .env.example .env && cp .env .env.web && mv .env.web apps/web/.env   # 填入两个随机密钥
(cd packages/lib && pnpm exec drizzle-kit migrate)
pnpm --filter @workspace/web dev      # http://localhost:3000
pnpm --filter @workspace/worker dev   # 后台任务
```

初始 `SCRAPE_TARGETS=stub:stub`（零成本跑通全流程）。启用真实引擎：在 `.env` 里按注释块
填入对应 Key 并替换 SCRAPE_TARGETS——中文四引擎走官方 API；国际消费者界面二选一
（**Cloro** 全覆盖最可靠 $30/月起，或 **BrightData** 按量 $10 起、AI Overview 较弱），
注册与付款需运营者本人完成。四个中文凭证已进 ENV_REGISTRY / turbo globalEnv，缺 Key 时
启动校验会像上游原生 Provider 一样明确报错。

## 路线图

- [x] v0.1 去品牌化清扫（2026-08-25）：产品 UI 全量换为 OpenGEO——wordmark/图标集（观测环，teal #0E6B5B）/标题/manifest/OG 分享图/导出水印/关于链接；Titan One 字体与 @fontsource/titan-one 依赖移除。保留：`ELMO_ENCRYPTION_KEY` 环境变量名（兼容）、demo 模式凭证、`apps/www`（上游营销站，不部署不改，后续或移除）
- [x] i18n P1+P2（2026-08-25）：react-i18next 双语框架 + 侧边栏语言切换器（偏好存 localStorage，`<html lang>` 动态）；导航全量、六个仪表盘页标题/说明、筛选器、图表导出按钮、注册页、品牌切换页中文化，术语对齐 OpenGEO 六层仓库口径（可见度/竞对份额/检索扩散/引用来源/机会点）。长尾字符串（图表徽标、tooltip、错误提示、报告导出）为 P3
- [ ] v0.2 剥离 cloud 计费与 Auth0 同步（保留 local / whitelabel 两种部署模式）
- [ ] v0.3 观测导出对齐 [RFC-0005 ObservationRecord](https://github.com/cangqiaoGEO/opengeo-spec/blob/main/rfcs/0005-observation-record.md)，与 opengeo-index 互通
- [ ] v0.4 中文引擎 scraped 通道（消费者界面采集，经用户本人授权登录）
- [ ] v0.5 与 opengeo-insights console / opengeo-audit 报告的互导
