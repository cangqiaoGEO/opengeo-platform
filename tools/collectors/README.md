# @opengeo/collectors · 中外十六引擎观测采集器

豆包 / 千问 / DeepSeek / 元宝 / 文心一言 / Kimi / 讯飞星火 / 智谱 + 百度AI / 夸克AI / 纳米AI / 抖音AI（仅 scraped）+ ChatGPT / Claude / Gemini / Perplexity 的可见度观测采集本体，输出 [RFC-0005 ObservationRecord](https://github.com/cangqiaoGEO/opengeo-spec/blob/main/rfcs/0005-observation-record.md)。零运行时依赖，Node ≥ 20。

## 血统与署名

- **端点、请求载荷、文本/引用提取**：移植自 [opengeo-audit](https://github.com/cangqiaoGEO/opengeo-audit) `brand-geo-audit/scripts/platform_adapters.py`（本组织 MIT，四引擎实测通过）；
- **Provider 注册架构**（`getProvider` / `access: scraped|api` / 归一化结果）：对齐 [elmo](https://github.com/elmohq/elmo) `packages/lib/src/providers` 的模式（MIT, Blue Whale Software, LLC）。

## 双通道（RFC-0005 §1）

| 通道 | Provider | 说明 |
| --- | --- | --- |
| `api` | 中文：`volcengine` / `dashscope` / `deepseek` / `tencent_tokenhub` / `qianfan` / `moonshot` / `xfyun` / `bigmodel`；国际：`openai_api` / `anthropic_api` / `google_api` / `perplexity_api` | 官方 API 直连，联网检索按引擎能力开启（OpenAI web_search、Anthropic web_search、Gemini grounding、Perplexity 原生联网）；凭证只从环境变量读取（`ARK_API_KEY` / `DASHSCOPE_API_KEY` / `DEEPSEEK_API_KEY` / `TENCENT_TOKENHUB_API_KEY` / `QIANFAN_API_KEY` / `MOONSHOT_API_KEY` / `SPARK_API_PASSWORD` / `ZHIPU_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `PERPLEXITY_API_KEY`）。注意：api 通道观测的是模型（如 gpt-5-mini），不是消费者产品界面（如 chatgpt.com）——RFC-0005 双通道语义 |
| `scraped` | `user_reported` | 用户从消费者产品（App/网页）粘贴真实回答。**百度AI搜索 / 夸克AI / 纳米AI / 抖音AI 无公开 API，只能走这条通道**；浏览器自动采集在 opengeo-audit 的宿主适配器中（登录与授权由用户本人完成），后续版本吸收进本包 |

两通道观测的是不同的面（模型裸答案 vs 用户真实界面），**聚合时不得混算**。

## 用法

```js
import { getProvider, annotateObservation, validateRecord } from "@opengeo/collectors";

const record = await getProvider("deepseek").run({
  prompt: "企业 AI 培训哪家值得考虑？",
  queryId: "q-reco-01",
});
console.log(validateRecord(record)); // []

const row = annotateObservation(record,
  { name: "仓桥智能", aliases: ["仓桥"], domains: ["cangqiao.ai"] },
  [{ name: "竞对A", domains: [] }]);
// → { query_id, brand_mentioned, competitors_mentioned } —— RFC-0006 SoV 输入行
```

```bash
npm test   # 25 个离线用例（请求构建 / 提取 / 注册表 / 记录校验 / 提及判定），不发真实请求
```

## 边界

- 观测可标 `surface`（`pc` | `mobile`）——同一问题在两端的答案常不同，聚合时分列不混算（RFC-0005 §3.1）；
- 只做「采集 + 归一化 + 提及标注」；评分与 SoV 归 opengeo-audit（RFC-0006），聚合与基准归 opengeo-index；
- 只提取显式结构化引用，绝不从行文猜 URL；取不到答案时产出 `status: error` 的合法记录而非静默丢弃；
- 不内置任何绕过登录/验证码的能力。
