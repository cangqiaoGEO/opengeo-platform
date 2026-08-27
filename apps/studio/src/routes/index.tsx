import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { factBases } from "@workspace/studio/schema";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { count, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

/**
 * M0 acceptance screen: proves the three things the scaffold exists to prove —
 * the platform session is readable here, the platform's own tables are readable
 * here, and Studio's tables are readable here. It gets replaced by the real
 * dashboard in M1.
 */
const getOverview = createServerFn({ method: "GET" }).handler(async () => {
	const rows = await db.select({ id: brands.id, name: brands.name, website: brands.website }).from(brands);
	const withCounts = await Promise.all(
		rows.map(async (brand) => {
			const [promptCount] = await db.select({ value: count() }).from(prompts).where(eq(prompts.brandId, brand.id));
			const [factBase] = await db.select().from(factBases).where(eq(factBases.brandId, brand.id));
			return {
				...brand,
				prompts: promptCount?.value ?? 0,
				hasFactBase: Boolean(factBase),
			};
		}),
	);
	return withCounts;
});

export const Route = createFileRoute("/")({
	loader: async () => ({ session: await getSession(), brands: await getOverview() }),
	component: Home,
});

function Home() {
	const { session, brands: rows } = Route.useLoaderData();

	return (
		<main className="mx-auto max-w-3xl px-6 py-16">
			<header className="mb-10">
				<p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">OpenGEO</p>
				<h1 className="mt-2 text-3xl font-semibold tracking-tight">Studio</h1>
				<p className="text-muted-foreground mt-3 text-sm">
					内容生产与投放。可见度监测在{" "}
					<a className="underline underline-offset-4" href="http://localhost:3000/app">
						平台
					</a>
					。
				</p>
			</header>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="text-base">登录状态</CardTitle>
					<CardDescription>Studio 读取平台的会话，不维护自己的账号体系</CardDescription>
				</CardHeader>
				<CardContent>
					{session ? (
						<div className="flex items-center gap-3 text-sm">
							<Badge>已登录</Badge>
							<span>{session.user.email}</span>
						</div>
					) : (
						<div className="flex items-center gap-3 text-sm">
							<Badge variant="secondary">未登录</Badge>
							<a className="underline underline-offset-4" href="http://localhost:3000/auth/login">
								去平台登录
							</a>
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">品牌</CardTitle>
					<CardDescription>直接读平台的表，不经过 API</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{rows.length === 0 ? (
						<p className="text-muted-foreground text-sm">平台里还没有品牌。</p>
					) : (
						rows.map((brand) => (
							<div key={brand.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
								<div>
									<p className="text-sm font-medium">{brand.name}</p>
									<p className="text-muted-foreground text-xs">{brand.website}</p>
								</div>
								<div className="flex items-center gap-2">
									<Badge variant="outline">{brand.prompts} 个追踪问题</Badge>
									<Badge variant={brand.hasFactBase ? "default" : "secondary"}>
										{brand.hasFactBase ? "已建事实库" : "未建事实库"}
									</Badge>
								</div>
							</div>
						))
					)}
				</CardContent>
			</Card>
		</main>
	);
}
