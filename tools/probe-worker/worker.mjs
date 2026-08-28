/**
 * probe-worker — 真测诊断的执行端（跑在有 openclaw-zero-token 登录态的机器上）。
 * 轮询腾讯云 geo-probe 队列 → 对每个任务用真实引擎网页版跑三问 → 判定提及 → 回传。
 *
 * 环境变量：
 *   PROBE_SERVER  如 https://geo.claudewiki.cn:8443
 *   PROBE_TOKEN   与服务器一致
 *   GATEWAY       openclaw 网关，默认 http://localhost:3001
 *   GATEWAY_KEY   网关鉴权（如启用），可空
 *   ENGINES       逗号分隔的模型 id，默认见下
 *
 * 用法：node worker.mjs        # 常驻轮询
 *       node worker.mjs once   # 只处理一个任务后退出（人工触发模式）
 */
const SERVER = process.env.PROBE_SERVER || "https://geo.claudewiki.cn:8443";
const TOKEN = process.env.PROBE_TOKEN;
const GATEWAY = process.env.GATEWAY || "http://localhost:3001";
const GATEWAY_KEY = process.env.GATEWAY_KEY || "";
if (!TOKEN) throw new Error("需要 PROBE_TOKEN");

// v1 默认只挂已验证真答稳定的引擎；千问/Kimi/GLM 修复采集后经 ENGINES 扩展
const DEFAULT_ENGINES = [
	["deepseek-web/deepseek-chat", "DeepSeek"],
	["doubao-web/doubao-seed-2.0", "豆包"],
];
const ENGINES = process.env.ENGINES
	? process.env.ENGINES.split(",").map((s) => [s.trim(), s.split("/")[0]])
	: DEFAULT_ENGINES;

const questions = (brand, category) => [
	{ kind: "品类推荐", judge: "visibility", q: `推荐几个靠谱的${category}品牌或厂家，说明推荐理由。` },
	{ kind: "品牌直达", judge: "knowledge", q: `${brand} 这家${category}怎么样？可靠吗？请具体说说。` },
	{ kind: "对比验证", judge: "knowledge", q: `在${category}里，${brand} 和其他家相比有什么优劣势？` },
];

const UNKNOWN_PATTERNS = /(没有找到|未找到|不了解|无法确认|没有(相关|足够)的?(信息|资料)|无法提供|不熟悉|no information|couldn't find)/i;

function judgeAnswer(judge, brand, text) {
	const mentioned = text.toLowerCase().includes(brand.toLowerCase());
	if (judge === "visibility") return { mentioned, verdict: mentioned ? "主动提及" : "缺席" };
	if (!mentioned || UNKNOWN_PATTERNS.test(text) || text.length < 60)
		return { mentioned, verdict: "不认识/信息不足" };
	return { mentioned, verdict: "有认知" };
}

async function ask(model, prompt, sessionUser) {
	// openclaw 网关约定：body.model 固定 "openclaw"，真实引擎经 x-openclaw-model 指定；
	// 会话按 user 粘住，因此每问一个独立 user，避免上下文串味。
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 180e3);
	try {
		const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-openclaw-scopes": "operator.write",
				"x-openclaw-model": model,
				...(GATEWAY_KEY ? { authorization: `Bearer ${GATEWAY_KEY}` } : {}),
			},
			body: JSON.stringify({
				model: "openclaw",
				user: sessionUser,
				messages: [{ role: "user", content: prompt }],
				stream: false,
			}),
			signal: ctrl.signal,
		});
		if (!res.ok) throw new Error(`${model} HTTP ${res.status}`);
		const data = await res.json();
		if (data.error) throw new Error(data.error.message || "gateway error");
		return data.choices?.[0]?.message?.content ?? "";
	} finally {
		clearTimeout(t);
	}
}

async function runJob(job) {
	const qs = questions(job.brand, job.category);
	const results = [];
	for (const [model, label] of ENGINES) {
		for (const { kind, judge, q } of qs) {
			let answer = "";
			let error = null;
			try {
				answer = await ask(model, q, `probe-${job.id.slice(0, 8)}-${label}-${kind}`);
			} catch (e) {
				error = String(e.message || e);
			}
			results.push({
				engine: label,
				model,
				kind,
				question: q,
				excerpt: answer.slice(0, 400),
				...(error ? { error } : judgeAnswer(judge, job.brand, answer)),
			});
			console.log(`  ${label} · ${kind} → ${error ?? results.at(-1).verdict}`);
		}
	}
	const ok = results.some((r) => !r.error);
	await fetch(`${SERVER}/api/worker/result?token=${TOKEN}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ id: job.id, results, failed: !ok }),
	});
}

async function next() {
	const res = await fetch(`${SERVER}/api/worker/next?token=${TOKEN}`);
	if (res.status !== 200) return null;
	return res.json();
}

const once = process.argv[2] === "once";
console.log(`probe-worker → ${SERVER} · 网关 ${GATEWAY} · 引擎 ${ENGINES.map((e) => e[1]).join("/")}`);
for (;;) {
	try {
		const job = await next();
		if (job) {
			console.log(`任务 ${job.id.slice(0, 8)}：${job.brand} / ${job.category}`);
			await runJob(job);
			if (once) break;
		} else if (once) {
			console.log("队列为空");
			break;
		}
	} catch (e) {
		console.error("轮询失败：", String(e.message || e));
	}
	await new Promise((r) => setTimeout(r, 10e3));
}
