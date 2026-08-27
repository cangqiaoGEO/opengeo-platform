/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "OpenGEO Studio" },
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	component: RootDocument,
});

function RootDocument() {
	return (
		<html lang="zh-CN">
			<head>
				<HeadContent />
			</head>
			<body className="bg-background text-foreground min-h-screen antialiased">
				<Outlet />
				<Scripts />
			</body>
		</html>
	);
}
