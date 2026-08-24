import type { ComponentPropsWithoutRef } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { cn } from "@workspace/ui/lib/utils";
import { DEFAULT_APP_ICON, DEFAULT_APP_NAME } from "@workspace/config/constants";
import type { ClientConfig } from "@workspace/config/types";

interface LogoProps extends ComponentPropsWithoutRef<"div"> {
	iconClassName?: string;
	textClassName?: string;
}

/** Whether the default OpenGEO wordmark renders (vs custom whitelabel branding). */
export function usesWordmarkFont(branding: { icon?: string; name?: string } | undefined) {
	const hasCustomBranding =
		Boolean(branding?.icon && branding?.name) &&
		(branding?.icon !== DEFAULT_APP_ICON || branding?.name !== DEFAULT_APP_NAME);
	return !hasCustomBranding;
}

export function Logo({ className, iconClassName, textClassName, ...props }: LogoProps) {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const branding = context.clientConfig?.branding;

	if (usesWordmarkFont(branding)) {
		return (
			<div {...props} className={cn("flex items-center gap-2", className)}>
				<span className={cn("text-2xl font-bold tracking-tight text-[#0E6B5B]", textClassName)}>OpenGEO</span>
			</div>
		);
	}

	return (
		<div {...props} className={cn("flex items-center gap-2", className)}>
			{branding?.icon && (
				<img
					src={branding.icon}
					alt={`${branding.name} logo`}
					className={cn("size-5", iconClassName)}
					fetchPriority="low"
				/>
			)}
			<span className={cn("text-base font-semibold", textClassName)}>{branding?.name}</span>
		</div>
	);
}
