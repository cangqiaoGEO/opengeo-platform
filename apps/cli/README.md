<p align="center">
  <img src="https://raw.githubusercontent.com/cangqiaoGEO/opengeo-platform/main/apps/web/public/icons/opengeo-icon-512.png" alt="OpenGEO" width="120">
</p>

<p align="center">
  <a href="https://github.com/cangqiaoGEO/opengeo-platform">OpenGEO Platform</a> 的部署 CLI —— 开源的 AI 可见度监测与优化平台
</p>

<br />

## 这是什么

[OpenGEO Platform](https://github.com/cangqiaoGEO/opengeo-platform) 追踪 AI 答案引擎——ChatGPT、Perplexity、Gemini、Copilot、Google AI 模式与 AI 概览，以及国内的豆包、通义千问、DeepSeek、腾讯元宝——如何提及、引用和描述你的品牌。定义客户会问的问题，按周期在各引擎上跑，得到提及率、引用来源与竞对份额的长期趋势。

这个 CLI 是在自己的机器上把它跑起来的最快方式：生成 Docker Compose 栈、管理密钥与配置，并用一条命令启停与运维实例。

## 安装

```bash
npm install -g @elmohq/cli
```

需要 [Docker](https://docs.docker.com/get-docker/) 与 Docker Compose。

> 包名仍是上游的 `@elmohq/cli`——这个分叉尚未发布自己的 npm 包。从源码运行见仓库根目录的 README。

## 快速开始

```bash
# 1. 交互式配置向导
elmo init

# 2. 起栈
elmo compose up -d

# 3. 打开 http://localhost:1515
```

`elmo init` 会问几个问题（数据库、引擎凭证），生成配置与 `.env`，并可选择直接把栈拉起来。

配置中文引擎需要对应凭证：豆包 `ARK_API_KEY`、通义千问 `DASHSCOPE_API_KEY`、DeepSeek `DEEPSEEK_API_KEY`、腾讯元宝 `TENCENT_TOKENHUB_API_KEY`；阿里云百炼（一个 key 覆盖 Qwen / DeepSeek / GLM）用 `BAILIAN_API_KEY`。国际消费者界面采集二选一：Cloro 或 BrightData。

## 命令

| 命令 | 说明 |
| --- | --- |
| `elmo init` | 交互式向导，配置一个本地实例 |
| `elmo compose <args...>` | 对你的项目执行任意 `docker compose` 命令（`up -d`、`down`、`logs -f`、`build`、`ps`） |
| `elmo edit <env\|compose>` | 修改 API key、采集目标或 Compose YAML |
| `elmo upgrade` | 升级到当前 CLI 版本 —— 跑迁移、重新固定镜像 tag、重启栈 |

`elmo --help` 或 `elmo <command> --help` 查看完整参数。

### 常用参数

- `--dir <path>` —— 指定配置目录（默认 `~/.elmo`）
- `elmo init --dev` —— 从本地 checkout 构建镜像，而不是拉取仓库镜像

## 遥测

CLI 会发送匿名的安装与命令事件。关掉它：在 shell 里 `export DISABLE_TELEMETRY=1`，或写进 `.env`：

```bash
elmo edit env       # 加一行 DISABLE_TELEMETRY=1
elmo compose up -d  # 重启使其生效
```

## 参与

- ⭐ [给仓库点个 Star](https://github.com/cangqiaoGEO/opengeo-platform)
- 🐛 [提 issue](https://github.com/cangqiaoGEO/opengeo-platform/issues)

## 关于上游

本仓库是 [elmohq/elmo](https://github.com/elmohq/elmo)（MIT, Copyright © 2026 Blue Whale Software, LLC）的分叉。CLI 的命令与配置格式沿用上游，上游版权声明完整保留。
