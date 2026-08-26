/**
 * Stories for the two trust-facing additions: the strip of measured headline
 * numbers, and the link that takes a reader from a stored observation to the
 * live engine. Both exist to be checked rather than believed, so the play
 * functions assert what a skeptical reader would: that the numbers rendered are
 * the numbers passed in, and that the link actually points at the right engine
 * carrying the right question.
 */
import type { Meta } from "@storybook/react";
import { expect, within } from "storybook/test";
import { ExecutiveKpis } from "@/components/executive-kpis";
import { VerifyOnPlatform } from "@/components/verify-on-platform";

const meta: Meta = { title: "Trust/Verify and KPIs" };
export default meta;

const trend = (values: (number | null)[]) => values.map((value) => ({ value }));

function Section({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<section className="mb-8">
			<h3 className="mb-2 font-medium text-muted-foreground text-sm">{label}</h3>
			{children}
		</section>
	);
}

/** The four headline numbers, in the three states a brand actually passes through. */
export const ExecutiveKpiStates = () => (
	<div className="p-6 space-y-2">
		<Section label="Measured — a brand with history">
			<ExecutiveKpis
				visibility={63}
				visibilityTrend={trend([41, 44, 52, 49, 58, 61, 63])}
				shareOfVoice={38}
				sovTrend={trend([22, 25, 31, 29, 35, 36, 38])}
				totalRuns={2832}
				totalPrompts={33}
				engineCount={12}
			/>
		</Section>
		<Section label="Nothing observed yet — em dashes, never a fabricated zero">
			<ExecutiveKpis
				visibility={null}
				visibilityTrend={[]}
				shareOfVoice={null}
				sovTrend={[]}
				totalRuns={0}
				totalPrompts={5}
				engineCount={4}
			/>
		</Section>
		<Section label="Loading">
			<ExecutiveKpis
				visibility={63}
				visibilityTrend={trend([41, 63])}
				shareOfVoice={38}
				sovTrend={trend([22, 38])}
				totalRuns={2832}
				totalPrompts={33}
				engineCount={12}
				isLoading
			/>
		</Section>
	</div>
);

ExecutiveKpiStates.play = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
	const canvas = within(canvasElement);

	// Measured values render exactly as given — no rounding surprises on the way out.
	await expect(canvas.getByText("63")).toBeInTheDocument();
	await expect(canvas.getByText("38")).toBeInTheDocument();
	await expect(canvas.getByText("2,832")).toBeInTheDocument();

	// An unmeasured metric shows an em dash. Two of them here (visibility + SoV in
	// the empty state) plus the loading row's four — what must never appear is a
	// "0%" standing in for "we have not observed this yet".
	const dashes = canvas.getAllByText("—");
	await expect(dashes.length).toBeGreaterThanOrEqual(2);

	// Sparklines are decorative: they carry no accessible name of their own.
	const svgs = canvasElement.querySelectorAll("svg[role='img']");
	await expect(svgs.length).toBeGreaterThan(0);
	for (const svg of svgs) await expect(svg).toHaveAttribute("aria-hidden", "true");
};

/** Verification links across engines that take the question and engines that cannot. */
export const VerifyLinks = () => {
	const prompt = "企业想给员工做 AI 培训，国内有哪些服务商值得考虑？";
	return (
		<div className="p-6 space-y-2">
			<Section label="Pre-fills the question (ChatGPT, 豆包, 夸克AI)">
				<div className="flex flex-wrap gap-2">
					<VerifyOnPlatform model="chatgpt" prompt={prompt} />
					<VerifyOnPlatform model="doubao" prompt={prompt} />
					<VerifyOnPlatform model="quark-ai" prompt={prompt} />
				</div>
			</Section>
			<Section label="Opens the product, question must be pasted (DeepSeek, 文心一言)">
				<div className="flex flex-wrap gap-2">
					<VerifyOnPlatform model="deepseek" prompt={prompt} />
					<VerifyOnPlatform model="ernie" prompt={prompt} />
				</div>
			</Section>
			<Section label="API-channel run — the link opens a different surface, and says so">
				<VerifyOnPlatform model="chatgpt" prompt={prompt} access="api" />
			</Section>
			<Section label="Unknown engine — renders nothing rather than a dead link">
				<div data-testid="unknown-slot">
					<VerifyOnPlatform model="some-future-engine" prompt={prompt} />
				</div>
			</Section>
		</div>
	);
};

VerifyLinks.play = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
	const canvas = within(canvasElement);

	const links = canvas.getAllByRole("link");
	await expect(links.length).toBe(6);

	// Every link opens safely in a new tab.
	for (const link of links) {
		await expect(link).toHaveAttribute("target", "_blank");
		await expect(link.getAttribute("rel") ?? "").toContain("noreferrer");
		await expect(link.getAttribute("href") ?? "").toMatch(/^https:\/\//);
	}

	const hrefs = links.map((l) => l.getAttribute("href") ?? "");

	// The question rides along where the engine accepts it, URL-encoded.
	const chatgpt = hrefs.find((h) => h.includes("chatgpt.com")) ?? "";
	await expect(chatgpt).toContain("?q=");
	await expect(chatgpt).toContain(encodeURIComponent("企业想给员工做 AI 培训"));

	// …and no query is faked onto an engine that cannot receive one.
	const deepseek = hrefs.find((h) => h.includes("chat.deepseek.com")) ?? "";
	await expect(deepseek).toBe("https://chat.deepseek.com/");

	// A model with no consumer surface renders no button at all.
	await expect(canvas.getByTestId("unknown-slot")).toBeEmptyDOMElement();
};
