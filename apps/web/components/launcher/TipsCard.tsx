import { useTranslations } from "next-intl";

export function TipsCard() {
  const t = useTranslations("pages.launcher.tips");

  return (
    <section className="rounded-(--r) border border-(--line) bg-(--bg-2) p-(--space-7)">
      <h3 className="vc-type-eyebrow mb-(--space-4) text-(--text-2)">{t("title")}</h3>
      <ul className="m-0 list-disc space-y-1.5 pl-(--space-6) text-xs leading-relaxed text-(--text-2)">
        <li>{t("folder")}</li>
        <li>{t("rerecord")}</li>
        <li>{t("phase2")}</li>
      </ul>
    </section>
  );
}
