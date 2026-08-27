import { createFileRoute, Link, Outlet, redirect, useMatchRoute } from "@tanstack/react-router";
import { cn } from "@workspace/ui/lib/utils";
import { FileText, Images, Layers, ListChecks, Wand2 } from "lucide-react";
import { getWorkspace } from "@/server/tenant";

/**
 * Studio has no login screen of its own: it reads the platform's session, so an
 * unauthenticated visitor is sent to the platform to sign in and comes back
 * with a cookie both apps accept.
 */
export const Route = createFileRoute("/_authed")({
	beforeLoad: async () => {
		try {
			return { workspace: await getWorkspace() };
		} catch {
			throw redirect({ href: `${platformUrl()}/auth/login` });
		}
	},
	loader: ({ context }) => context.workspace,
	component: StudioShell,
});

function platformUrl() {
	return import.meta.env.VITE_APP_URL ?? "http://localhost:3000";
}

/** The whole M1 nav, including the pages that do not exist yet — a disabled row
 *  says "this is coming" where a missing one just looks unfinished. */
const NAV = [
	{ to: "/facts" as const, label: "事实库", icon: Layers, ready: true },
	{ to: "/assets" as const, label: "素材库", icon: Images, ready: false },
	{ to: "/templates" as const, label: "指令模板", icon: FileText, ready: true },
	{ to: "/tasks" as const, label: "创作任务", icon: Wand2, ready: true },
	{ to: "/drafts" as const, label: "草稿", icon: ListChecks, ready: true },
];

function StudioShell() {
	const { user } = Route.useLoaderData();
	const matchRoute = useMatchRoute();

	return (
		<div className="flex min-h-screen">
			<aside className="bg-sidebar text-sidebar-foreground flex w-56 shrink-0 flex-col border-r">
				<div className="px-5 py-6">
					<p className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">OpenGEO</p>
					<p className="mt-1 text-lg font-semibold tracking-tight">Studio</p>
				</div>
				<nav className="flex-1 space-y-1 px-3">
					{NAV.map((item) => {
						const Icon = item.icon;
						if (!item.ready) {
							return (
								<span
									key={item.to}
									className="text-muted-foreground/60 flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm"
									title="待开发"
								>
									<Icon className="size-4" />
									{item.label}
								</span>
							);
						}
						const active = Boolean(matchRoute({ to: item.to as "/facts", fuzzy: true }));
						return (
							<Link
								key={item.to}
								to={item.to as "/facts"}
								search={{ brand: undefined }}
								className={cn(
									"flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
									active
										? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
										: "hover:bg-sidebar-accent/60",
								)}
							>
								<Icon className="size-4" />
								{item.label}
							</Link>
						);
					})}
				</nav>
				<div className="border-t px-5 py-4">
					<p className="truncate text-xs">{user.email}</p>
					<a className="text-muted-foreground text-xs underline underline-offset-4" href={`${platformUrl()}/app`}>
						去监测平台
					</a>
				</div>
			</aside>
			<main className="min-w-0 flex-1">
				<Outlet />
			</main>
		</div>
	);
}
