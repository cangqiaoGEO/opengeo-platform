import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import zhCN from "../locales/zh-CN.json";

export const SUPPORTED_LANGUAGES = [
	{ code: "en", label: "English" },
	{ code: "zh-CN", label: "中文" },
] as const;

export const LANGUAGE_STORAGE_KEY = "opengeo.lang";

/**
 * SSR renders English; the stored preference is applied after hydration
 * (see applyStoredLanguage) so server and client markup agree. The brief
 * English flash for zh users is the accepted v1 trade-off — avoiding it
 * needs a cookie read on the server.
 */
i18n.use(initReactI18next).init({
	resources: {
		en: { translation: en },
		"zh-CN": { translation: zhCN },
	},
	lng: "en",
	fallbackLng: "en",
	interpolation: { escapeValue: false },
	returnEmptyString: false,
});

export function applyStoredLanguage(): void {
	if (typeof window === "undefined") return;
	const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
	if (stored && stored !== i18n.language && SUPPORTED_LANGUAGES.some((l) => l.code === stored)) {
		void i18n.changeLanguage(stored);
	}
	document.documentElement.lang = i18n.language;
	i18n.on("languageChanged", (lng) => {
		document.documentElement.lang = lng;
	});
}

export function setLanguage(code: string): void {
	void i18n.changeLanguage(code);
	if (typeof window !== "undefined") window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
}

export default i18n;
