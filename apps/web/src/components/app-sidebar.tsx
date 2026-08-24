import * as React from "react";
import { Link, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import {
	IconDashboard,
	IconChartBar,
	IconSpeakerphone,
	IconSitemap,
	IconTarget,
	IconLink,
	IconBuilding,
	IconBuildings,
	IconListDetails,
	IconCpu,
	IconTable,
	IconReport,
	IconTimeline,
	IconTool,
	IconUsers,
	IconCreditCard,
} from "@tabler/icons-react";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import { NavMain, type NavGroup } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { NavAppInfo } from "@/components/nav-app-info";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useTranslation } from "react-i18next";
import { DemoModePill } from "@/components/demo-mode-pill";
import { Logo } from "@/components/logo";
import type { BrandWithPrompts } from "@workspace/lib/db/schema";

/**
 * How much of the app the shell around this page can reach:
 *  - "brand":   a brand's own pages, plus admin for those who have it
 *  - "admin":   the admin section only (there is no brand in scope)
 *  - "account": nothing — the page is a gate the user has to clear first, so the
 *               only things worth offering are who they are and how to leave
 */
export type SidebarScope = "brand" | "admin" | "account";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
	isAdmin?: boolean;
	hasReportAccess?: boolean;
	scope?: SidebarScope;
	/** Brand data from route loader — avoids a separate client-side fetch */
	brand?: BrandWithPrompts | null;
}

export function AppSidebar({
	isAdmin = false,
	hasReportAccess = false,
	scope = "brand",
	brand,
	...props
}: AppSidebarProps) {
	const { setOpenMobile } = useSidebar();
	const { t } = useTranslation();
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	// Reports are disabled entirely in cloud; hide the nav entry there.
	const reportsEnabled = context.clientConfig?.features.reportGeneration ?? true;

	// A gate page offers no destinations: every link would either 404 or bounce
	// the user straight back to the gate.
	const showAdminSection = scope !== "account" && (isAdmin || (hasReportAccess && reportsEnabled));

	const groups: NavGroup[] = [];

	// Dashboard section - only show if we have a brand context
	if (scope === "brand") {
		const dashboardItems = [
			{
				title: t("nav.overview"),
				url: "/",
				icon: IconDashboard,
			},
		];

		// Only show Visibility and Citations if the brand is onboarded
		if (brand?.onboarded) {
			dashboardItems.push(
				{
					title: t("nav.visibility"),
					url: "/visibility",
					icon: IconChartBar,
				},
				{
					title: t("nav.shareOfVoice"),
					url: "/share-of-voice",
					icon: IconSpeakerphone,
				},
				{
					title: t("nav.queryFanOut"),
					url: "/query-fan-out",
					icon: IconSitemap,
				},
				{
					title: t("nav.citations"),
					url: "/citations",
					icon: IconLink,
				},
				{
					title: t("nav.opportunities"),
					url: "/opportunities",
					icon: IconTarget,
				},
			);
		}

		groups.push({
			label: t("nav.dashboard"),
			items: dashboardItems,
		});

		// Settings section - only show if onboarded
		if (brand?.onboarded) {
			groups.push({
				label: t("nav.settings"),
				items: [
					{
						title: t("nav.brand"),
						url: "/settings/brand",
						icon: IconBuilding,
					},
					{
						title: t("nav.competitors"),
						url: "/settings/competitors",
						icon: IconBuildings,
					},
					{
						title: t("nav.prompts"),
						url: "/settings/prompts",
						icon: IconListDetails,
					},
					{
						title: t("nav.llms"),
						url: "/settings/llms",
						icon: IconCpu,
					},
					...(context.clientConfig?.features.teamInvites
						? [{ title: t("nav.team"), url: "/settings/members", icon: IconUsers }]
						: []),
					...(context.clientConfig?.features.billing
						? [{ title: t("nav.billing"), url: "/settings/billing", icon: IconCreditCard }]
						: []),
				],
			});
		}
	}

	// Admin section
	if (showAdminSection) {
		const reportsItem = {
			title: t("nav.reports"),
			url: "/reports",
			icon: IconReport,
			absolute: true,
		};
		const adminItems = isAdmin
			? [
					{
						title: t("nav.brands"),
						url: "/admin",
						icon: IconTable,
						absolute: true,
					},
					...(reportsEnabled ? [reportsItem] : []),
					{
						title: t("nav.workflows"),
						url: "/admin/workflows",
						icon: IconTimeline,
						absolute: true,
					},
					{
						title: t("nav.tools"),
						url: "/admin/tools",
						icon: IconTool,
						absolute: true,
					},
				]
			: [reportsItem];

		groups.push({
			label: t("nav.admin"),
			items: adminItems,
		});
	}

	const brandmark = (
		<>
			<Logo iconClassName="!size-5" />
			<div className="ml-auto group-data-[collapsible=icon]:hidden">
				<DemoModePill />
			</div>
		</>
	);

	return (
		<Sidebar variant="inset" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						{/* On a gate page the mark still says whose product this is, but it
						    leads nowhere — /app would redirect right back here. */}
						{scope === "account" ? (
							<div className="flex items-center gap-2 p-2">{brandmark}</div>
						) : (
							<SidebarMenuButton size="lg" render={<Link to="/app" onClick={() => setOpenMobile(false)} />}>
								{brandmark}
							</SidebarMenuButton>
						)}
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain groups={groups} />
			</SidebarContent>
			<SidebarFooter>
				<div className="mx-2 flex justify-end"><LanguageSwitcher /></div>
				<NavUser canSwitchBrand={scope !== "account"} />
				<NavAppInfo />
			</SidebarFooter>
		</Sidebar>
	);
}
