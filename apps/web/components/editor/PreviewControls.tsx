import { Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, SegmentedControl } from "@/components/ui";

type PreviewControlsProps = {
  fitMode: string;
  layerCount: number;
  onLayers: () => void;
  onSetFitMode: (value: string) => void;
  onSetResolution: (value: string) => void;
  resolution: string;
};

export function PreviewControls({ fitMode, layerCount, onLayers, onSetFitMode, onSetResolution, resolution }: PreviewControlsProps) {
  const t = useTranslations("pages.editor");
  return (
    <div className="flex items-center justify-between border-t border-(--line) px-4 py-2">
      <div className="flex gap-2">
        <SegmentedControl
          ariaLabel={t("resolution")}
          items={["1080p", "720p", "9:16"].map((value) => ({ label: value, value }))}
          onValueChange={onSetResolution}
          value={resolution}
        />
        <SegmentedControl
          ariaLabel={t("fitMode")}
          items={[
            { label: t("fit"), value: "fit" },
            { label: t("actual"), value: "actual" },
          ]}
          onValueChange={onSetFitMode}
          value={fitMode}
        />
      </div>
      <Button onClick={onLayers} size="extra-small" variant="ghost">
        <Layers aria-hidden="true" className="h-4 w-4" />
        {t("layersButton", { count: layerCount })}
      </Button>
    </div>
  );
}
