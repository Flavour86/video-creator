import { Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, SegmentedControl } from "@/components/ui";

type PreviewControlsProps = {
  layerCount: number;
  onLayers: () => void;
  onSetResolution: (value: string) => void;
  resolution: string;
  layersOpen: boolean;
};

export function PreviewControls({ layerCount, onLayers, onSetResolution, resolution, layersOpen }: PreviewControlsProps) {
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
      </div>
      <Button
        aria-controls="editor-layers-popover"
        aria-expanded={layersOpen}
        data-editor-layers-trigger="true"
        onClick={onLayers}
        size="extra-small"
        variant="ghost"
      >
        <Layers aria-hidden="true" className="h-4 w-4" />
        {t("layersButton", { count: layerCount })}
      </Button>
    </div>
  );
}
