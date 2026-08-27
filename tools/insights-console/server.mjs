#!/usr/bin/env node
/**
 * OpenGEO Console —— 零依赖本地控制台服务。
 *
 *   node console/server.mjs        # http://127.0.0.1:4700
 *
 * 只绑定 127.0.0.1；API Key 只从环境变量读取用于出站调用，
 * 任何接口都不回传凭证内容（/api/status 只报告是否已配置）。
 */

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { ENGINE_API_PROVIDER, getProvider, listProviders } from "../collectors/src/registry.mjs";
import { analyze } from "./lib/analyze.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.OPENGEO_CONSOLE_PORT ?? 4700);
const MIME = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml" };

async function readBody(req, limit = 2_000_000) {
	let size = 0;
	const chunks = [];
	for await (const chunk of req) {
		size += chunk.length;
		if (size > limit) throw new Error("请求体过大");
		chunks.push(chunk);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function json(res, status, data) {
	res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
	const url = new URL(req.url, `http://${req.headers.host}`);
	try {
		if (req.method === "GET" && url.pathname === "/api/status") {
			return json(res, 200, { providers: listProviders() });
		}
		if (req.method === "GET" && url.pathname === "/api/demo") {
			const demo = JSON.parse(await readFile(join(ROOT, "demo", "demo.json"), "utf8"));
			return json(res, 200, demo);
		}
		if (req.method === "POST" && url.pathname === "/api/analyze") {
			const body = await readBody(req);
			return json(res, 200, analyze(body));
		}
		if (req.method === "POST" && url.pathname === "/api/collect") {
			// 实测采集：API 通道需要对应环境变量；user_reported 无需任何配置
			const { engine, provider, queries = [], text, citations, surface } = await readBody(req);
			const providerId = provider ?? ENGINE_API_PROVIDER[engine];
			if (!providerId) return json(res, 400, { error: `引擎 ${engine} 无可用 provider` });
			const p = getProvider(providerId);
			if (!p.isConfigured()) return json(res, 400, { error: `${providerId} 未配置（缺环境变量），可改用「粘贴回答」通道` });
			const records = [];
			for (const q of queries) {
				records.push(
					providerId === "user_reported"
						? await p.run({ engine, prompt: q.prompt, queryId: q.query_id, text, citations, surface })
						: await p.run({ prompt: q.prompt, queryId: q.query_id, surface }),
				);
			}
			return json(res, 200, { records });
		}
		// 静态文件
		if (req.method === "GET") {
			const path = url.pathname === "/" ? "/index.html" : url.pathname;
			const file = normalize(join(ROOT, "public", path));
			if (!file.startsWith(join(ROOT, "public"))) return json(res, 403, { error: "forbidden" });
			try {
				const content = await readFile(file);
				res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
				return res.end(content);
			} catch {
				return json(res, 404, { error: "not found" });
			}
		}
		return json(res, 405, { error: "method not allowed" });
	} catch (error) {
		return json(res, 400, { error: String(error?.message ?? error) });
	}
});

server.listen(PORT, "127.0.0.1", () => {
	console.log(`OpenGEO Console → http://127.0.0.1:${PORT}`);
	console.log(`已配置的采集通道: ${listProviders().filter((p) => p.configured).map((p) => p.id).join(", ")}`);
});
