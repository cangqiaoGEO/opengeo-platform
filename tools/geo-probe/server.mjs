/**
 * geo-probe — 真测诊断的队列服务（腾讯云侧）。
 * 访客提交品牌+品类 → 入队；Mac 上的 worker（连 openclaw-zero-token 网关）
 * 轮询取任务、跑真实引擎、回传结果。零依赖：node:http + node:sqlite。
 *
 * 端口 3010。鉴权：worker 接口用 PROBE_TOKEN；访客接口按 IP 限流 + 结果缓存。
 */
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";

const PORT = 3010;
const TOKEN = process.env.PROBE_TOKEN;
if (!TOKEN) throw new Error("需要 PROBE_TOKEN 环境变量");
const IP_DAILY = 3; // 每 IP 每日提交数
const GLOBAL_DAILY = 50; // 全局每日提交数
const CACHE_HOURS = 24;

const db = new DatabaseSync(process.env.PROBE_DB || "/var/lib/geo-probe/probe.db");
db.exec(`
create table if not exists probes (
  id text primary key, brand text not null, category text not null,
  key text not null, ip text not null, status text not null default 'queued',
  results text, created_at integer not null, done_at integer
);
create index if not exists idx_key on probes(key, created_at);
create index if not exists idx_status on probes(status, created_at);
`);

const day = () => Math.floor(Date.now() / 86400000);
const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
const keyOf = (b, c) => createHash("sha256").update(`${norm(b)}|${norm(c)}`).digest("hex").slice(0, 16);

function json(res, code, obj) {
	const body = JSON.stringify(obj);
	res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
	res.end(body);
}

async function readBody(req) {
	let raw = "";
	for await (const chunk of req) {
		raw += chunk;
		if (raw.length > 64 * 1024) throw new Error("body too large");
	}
	return JSON.parse(raw || "{}");
}

const server = createServer(async (req, res) => {
	const url = new URL(req.url, "http://x");
	const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
	try {
		// —— 访客：提交自检 ——
		if (req.method === "POST" && url.pathname === "/api/probe") {
			const { brand, category } = await readBody(req);
			if (!brand?.trim() || !category?.trim()) return json(res, 400, { error: "缺少品牌或品类" });
			if (brand.length > 60 || category.length > 60) return json(res, 400, { error: "长度超限" });
			const key = keyOf(brand, category);

			// 24h 内同品牌+品类直接复用结果
			const cached = db
				.prepare("select id,status from probes where key=? and created_at>? order by created_at desc limit 1")
				.get(key, Date.now() - CACHE_HOURS * 3600e3);
			if (cached) return json(res, 200, { id: cached.id, reused: true });

			const ipCount = db
				.prepare("select count(*) n from probes where ip=? and created_at/86400000=?")
				.get(ip, day()).n;
			if (ipCount >= IP_DAILY) return json(res, 429, { error: "今日自检次数已用完，明天再来" });
			const globalCount = db.prepare("select count(*) n from probes where created_at/86400000=?").get(day()).n;
			if (globalCount >= GLOBAL_DAILY) return json(res, 429, { error: "今日全站测试额度已用完" });

			const id = randomUUID();
			db.prepare("insert into probes (id,brand,category,key,ip,created_at) values (?,?,?,?,?,?)").run(
				id, brand.trim(), category.trim(), key, ip, Date.now(),
			);
			return json(res, 200, { id });
		}

		// —— 访客：查询结果 ——
		if (req.method === "GET" && url.pathname.startsWith("/api/probe/")) {
			const row = db
				.prepare("select id,brand,category,status,results,created_at from probes where id=?")
				.get(url.pathname.slice("/api/probe/".length));
			if (!row) return json(res, 404, { error: "not found" });
			const queueAhead =
				row.status === "queued"
					? db.prepare("select count(*) n from probes where status='queued' and created_at<?").get(row.created_at).n
					: 0;
			return json(res, 200, { ...row, results: row.results ? JSON.parse(row.results) : null, queueAhead });
		}

		// —— worker：取任务 ——
		if (req.method === "GET" && url.pathname === "/api/worker/next") {
			if (url.searchParams.get("token") !== TOKEN) return json(res, 403, { error: "forbidden" });
			// 卡住超过 10 分钟的 running 任务放回队列
			db.prepare("update probes set status='queued' where status='running' and done_at is null and created_at<?")
				.run(Date.now() - 600e3);
			const row = db.prepare("select id,brand,category from probes where status='queued' order by created_at limit 1").get();
			if (!row) return json(res, 204, {});
			db.prepare("update probes set status='running' where id=?").run(row.id);
			return json(res, 200, row);
		}

		// —— worker：回传结果 ——
		if (req.method === "POST" && url.pathname === "/api/worker/result") {
			if (url.searchParams.get("token") !== TOKEN) return json(res, 403, { error: "forbidden" });
			const { id, results, failed } = await readBody(req);
			if (!id) return json(res, 400, { error: "缺 id" });
			db.prepare("update probes set status=?, results=?, done_at=? where id=?").run(
				failed ? "failed" : "done", JSON.stringify(results ?? null), Date.now(), id,
			);
			return json(res, 200, { ok: true });
		}

		json(res, 404, { error: "not found" });
	} catch (e) {
		json(res, 500, { error: String(e.message || e) });
	}
});
server.listen(PORT, "127.0.0.1", () => console.log(`geo-probe on :${PORT}`));
