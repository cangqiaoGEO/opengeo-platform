# probe-worker · 真测诊断执行端

跑在有 openclaw-zero-token 登录态的机器上（个人账号的网页版会话留在本机，符合
"自有账号、低频、人工触发"的采集红线）。轮询腾讯云 geo-probe 队列，对每个任务
用真实引擎网页版跑三问（品类推荐 / 品牌直达 / 对比验证），判定提及后回传。

```bash
# 前置：openclaw-zero-token 网关已在 :3001 运行且已 onboard 各引擎
PROBE_TOKEN=<与服务器一致> node worker.mjs        # 常驻
PROBE_TOKEN=<与服务器一致> node worker.mjs once   # 人工触发处理一单
```

服务器侧队列见 `../geo-probe/`（部署于 geo.claudewiki.cn，systemd: geo-probe）。
