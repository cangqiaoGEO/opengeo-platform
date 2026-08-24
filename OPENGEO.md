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

## 路线图

- [ ] v0.1 去品牌化清扫：elmo 名称/logo/营销站（apps/www）全量替换或移除
- [ ] v0.2 剥离 cloud 计费与 Auth0 同步（保留 local / whitelabel 两种部署模式）
- [ ] v0.3 观测导出对齐 [RFC-0005 ObservationRecord](https://github.com/cangqiaoGEO/opengeo-spec/blob/main/rfcs/0005-observation-record.md)，与 opengeo-index 互通
- [ ] v0.4 中文引擎 scraped 通道（消费者界面采集，经用户本人授权登录）
- [ ] v0.5 与 opengeo-insights console / opengeo-audit 报告的互导
