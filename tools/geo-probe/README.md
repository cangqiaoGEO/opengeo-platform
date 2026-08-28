# geo-probe · 真测诊断队列（服务器侧）

geo.claudewiki.cn 诊断页的后端：零依赖 node（node:http + node:sqlite），端口 3010，
Caddy 将 /api/* 反代至此。限流：每 IP 每日 3 次、全局每日 50 次、同品牌+品类 24h 缓存复用。
worker 接口以 PROBE_TOKEN 鉴权。`diagnosis-page.html` 为部署在 /var/www/geo-diagnosis 的前端。
