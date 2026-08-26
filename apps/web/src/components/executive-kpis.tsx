import { Card } from "@workspace/ui/components/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

/**
 * The four numbers to hand someone who has thirty seconds: how visible the
 * brand is, how that compares to competitors, how much evidence sits behind
 * those two, and how wide the observation net is.
 *
 * Every value here is measured — the count of runs actually executed, the
 * visibility actually observed. Nothing is projected or extrapolated, which is
 * the line between this strip and the "estimated exposure" numbers competitors
 * put on the same real estate.
 */

interface TrendPoint {
	value: number | null;
}

interface ExecutiveKpisProps {
	visibility: number | null;
	visibilityTrend: TrendPoint[];
	shareOfVoice: number | null;
	sovTrend: TrendPoint[];
	totalRuns: number;
	totalPrompts: number;
	engineCount: number;
	isLoading?: boolean;
}

/** A bare trend line: no axes, no grid — shape only, with the latest point marked. */
function Sparkline({ points, className }: { points: TrendPoint[]; className?: string }) {
	const values = points.map((p) => p.value).filter((v): v is number => v !== null);
	if (values.length < 2) return <div className="h-7" aria-hidden="true" />;

	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = max - min || 1;
	const stepX = 100 / (values.length - 1);
	const coords = values.map((v, i) => [i * stepX, 26 - ((v - min) / span) * 22] as const);
	const path = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
	const [lastX, lastY] = coords[coords.length - 1]!;

	return (
		<svg
			viewBox="0 0 100 28"
			preserveAspectRatio="none"
			className={`h-7 w-full ${className ?? ""}`}
			role="img"
			aria-hidden="true"
		>
			<polyline points={path} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
			<circle cx={lastX} cy={lastY} r="2" fill="currentColor" vectorEffect="non-scaling-stroke" />
		</svg>
	);
}

function KpiCard({
	label,
	hint,
	value,
	suffix,
	sub,
	trend,
	isLoading,
}: {
	label: string;
	hint: string;
	value: string;
	suffix?: string;
	sub?: string;
	trend?: TrendPoint[];
	isLoading?: boolean;
}) {
	return (
		<Card className="shadow-none gap-2 py-4 px-4">
			<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
				<span>{label}</span>
				<Tooltip>
					<TooltipTrigger
						render={
							<button type="button" className="inline-flex" aria-label={hint}>
								<IconInfoCircle className="size-3.5" />
							</button>
						}
					/>
					<TooltipContent className="max-w-64">{hint}</TooltipContent>
				</Tooltip>
			</div>
			<div className="font-semibold text-3xl tabular-nums leading-none">
				{isLoading ? <span className="text-muted-foreground">—</span> : value}
				{!isLoading && suffix && <span className="ml-0.5 font-normal text-muted-foreground text-base">{suffix}</span>}
			</div>
			{trend ? <Sparkline points={trend} className="text-primary" /> : <div className="h-7" aria-hidden="true" />}
			{sub && <div className="text-muted-foreground text-xs">{sub}</div>}
		</Card>
	);
}

export function ExecutiveKpis({
	visibility,
	visibilityTrend,
	shareOfVoice,
	sovTrend,
	totalRuns,
	totalPrompts,
	engineCount,
	isLoading,
}: ExecutiveKpisProps) {
	const { t } = useTranslation();
	const pct = (v: number | null) => (v === null ? "—" : String(Math.round(v)));

	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<KpiCard
				label={t("kpis.visibility.label")}
				hint={t("kpis.visibility.hint")}
				value={pct(visibility)}
				suffix={visibility === null ? undefined : "%"}
				trend={visibilityTrend}
				isLoading={isLoading}
			/>
			<KpiCard
				label={t("kpis.shareOfVoice.label")}
				hint={t("kpis.shareOfVoice.hint")}
				value={pct(shareOfVoice)}
				suffix={shareOfVoice === null ? undefined : "%"}
				trend={sovTrend}
				isLoading={isLoading}
			/>
			<KpiCard
				label={t("kpis.runs.label")}
				hint={t("kpis.runs.hint")}
				value={totalRuns.toLocaleString()}
				sub={t("kpis.runs.sub", { count: totalPrompts })}
				isLoading={isLoading}
			/>
			<KpiCard
				label={t("kpis.engines.label")}
				hint={t("kpis.engines.hint")}
				value={String(engineCount)}
				sub={t("kpis.engines.sub")}
				isLoading={isLoading}
			/>
		</div>
	);
}
