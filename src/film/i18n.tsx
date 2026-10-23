// The film's text helpers as its carried-over screens (pages/Keep.tsx, components/VoiceBox.tsx) call them, answered
// from the manager's own i18next vocabulary (src/i18n/{en,es}/film.js). Same names and shape as dfc-game-film's
// app/src/i18n.tsx, so those screens run unchanged.
import { useMemo } from "react";
import { useT } from "../i18n/I18nContext";
import type { EventType, Text } from "./schema";

export type Lang = "en" | "es";
export type Key = string;

export function useI18n() {
  const { t: base, locale: current, setLocale } = useT();
  return useMemo(() => {
    const lang: Lang = current === "es" ? "es" : "en";
    return {
      lang,
      setLang: (l: Lang) => setLocale(l),
      t: (k: Key, vars?: Record<string, string | number>): string => String(base(`film.${k}`, vars)),
      tx: (text: Text) => text[lang] || text.en,
      ev: (y: EventType): string => String(base(`filmEvents.${y}`, y)),
      halfRef: (s: string) => (lang === "es" ? s.replace(/\b([12])H\b/g, "$1.ª") : s),
      locale: lang === "es" ? "es-US" : "en-GB",
    };
  }, [base, current, setLocale]);
}

export function formatDate(iso: string, locale: string, style: "long" | "short" = "long") {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(
    locale,
    style === "long"
      ? { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }
      : { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" },
  ).format(dt);
}
