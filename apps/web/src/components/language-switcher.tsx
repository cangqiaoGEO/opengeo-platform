import { IconLanguage } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, setLanguage } from "@/lib/i18n";

/** Compact language toggle for the sidebar footer: cycles en ⇄ zh-CN. */
export function LanguageSwitcher() {
	const { i18n } = useTranslation();
	const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0];
	const next = SUPPORTED_LANGUAGES.find((l) => l.code !== current.code) ?? SUPPORTED_LANGUAGES[0];

	return (
		<button
			type="button"
			onClick={() => setLanguage(next.code)}
			title={next.label}
			className="text-muted-foreground hover:text-foreground inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors"
		>
			<IconLanguage className="size-4" />
			{next.label}
		</button>
	);
}
