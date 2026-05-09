import { Folder } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";

type PathCardProps = {
  path: string;
  onChange: () => void;
};

export function PathCard({ onChange, path }: PathCardProps) {
  const t = useTranslations("pages.setup.path");
  const common = useTranslations("globalControls.buttons");

  return (
    <div className="flex items-center gap-(--space-5) rounded-(--r-sm) border border-(--line) bg-(--bg-1) px-(--space-6) py-(--space-5)">
      <Folder aria-hidden="true" className="h-(--space-8) w-(--space-8) text-(--blue)" />
      <div className="min-w-0 flex-1">
        <strong className="block truncate font-mono text-[12.5px] font-medium text-(--text)">{path}</strong>
        <span className="block text-[11px] text-(--text-3)">{t("willBeCreated")}</span>
      </div>
      <Button onClick={onChange} size="small" variant="ghost">
        {common("change")}
      </Button>
    </div>
  );
}
