import { IconExternalLink } from "@tabler/icons-react";
import { verifyLinkFor } from "@workspace/config/verify-links";
import { buttonVariants } from "@workspace/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { useTranslation } from "react-i18next";

interface VerifyOnPlatformProps {
	model: string;
	prompt: string;
	/** API-channel runs observed a bare model, so the consumer link is a different surface. */
	access?: "api" | "scraped";
}

/**
 * Takes the reader from a stored observation to the live engine, so a
 * visibility claim can be checked rather than believed. Renders nothing when
 * the model has no consumer surface to point at — a dead link would cost more
 * trust than a missing button buys.
 */
export function VerifyOnPlatform({ model, prompt, access }: VerifyOnPlatformProps) {
	const { t } = useTranslation();
	const link = verifyLinkFor(model, prompt);
	if (!link) return null;

	const hint = link.prefillsPrompt
		? t("verify.tooltipPrefill", { platform: link.platform })
		: t("verify.tooltipPaste", { platform: link.platform });

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					// A link, not a button: it navigates. buttonVariants gives it button
					// styling without claiming button semantics.
					<a
						href={link.url}
						target="_blank"
						rel="noreferrer noopener"
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						<IconExternalLink className="size-3.5" aria-hidden="true" />
						{t("verify.button")}
					</a>
				}
			/>
			<TooltipContent className="max-w-72">
				<p>{hint}</p>
				<p className="mt-1 opacity-80">{t("verify.note")}</p>
				{access === "api" && <p className="mt-1 opacity-80">{t("verify.apiCaveat")}</p>}
			</TooltipContent>
		</Tooltip>
	);
}
