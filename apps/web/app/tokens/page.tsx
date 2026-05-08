"use client";

import type { ReactNode } from "react";
import { Play, Settings, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageChrome } from "@/components/app-shell/PageChrome";
import {
  Button,
  Checkbox,
  Field,
  IconButton,
  Kbd,
  LayerChip,
  NumberInput,
  SearchInput,
  SegmentedControl,
  Select,
  StatusTag,
  Surface,
  TextInput,
} from "@/components/ui";

type TokenItem = {
  description: string;
  name: string;
  value?: string;
};

type TypeSample = TokenItem & {
  className: string;
  sample: string;
};

const colorTokens: TokenItem[] = [
  { name: "--bg-0", description: "App canvas" },
  { name: "--bg-1", description: "Default panel surface" },
  { name: "--bg-2", description: "Raised panel/card surface" },
  { name: "--bg-3", description: "Inputs and inset fills" },
  { name: "--bg-4", description: "Hover surface" },
  { name: "--bg-5", description: "Active surface" },
  { name: "--text", description: "Primary text" },
  { name: "--text-2", description: "Secondary text" },
  { name: "--text-3", description: "Labels and tertiary text" },
  { name: "--text-4", description: "Disabled text and hints" },
  { name: "--line", description: "Default border" },
  { name: "--line-soft", description: "Inner dividers" },
  { name: "--amber", description: "Primary accent, current time, playhead, render emphasis" },
  { name: "--blue", description: "Info state" },
  { name: "--green", description: "Ready, aligned, cached, healthy runtime" },
  { name: "--red", description: "Error, missing asset, destructive action" },
  { name: "--violet", description: "Picture-in-picture layer semantics" },
];

const typeSamples: TypeSample[] = [
  { name: "Display / screen title", value: "32px / 700 / sans", description: "Screen title", className: "vc-type-display", sample: "Project Library" },
  { name: "H2 / modal title", value: "24px / 700 / sans", description: "Dialog or page group", className: "vc-type-h2", sample: "Render Settings" },
  { name: "Section/control title", value: "16px / 600 / sans", description: "Panel heading", className: "vc-type-section", sample: "Runtime" },
  { name: "Body", value: "13px / 400 / sans", description: "Dense UI copy", className: "vc-type-body", sample: "Local project actions stay on this device." },
  { name: "Caption", value: "11px / 500 / sans", description: "Compact labels", className: "vc-type-caption", sample: "aligned" },
  { name: "Eyebrow / label", value: "11px / 600 / sans", description: "Short uppercase labels", className: "vc-type-eyebrow", sample: "Workspace" },
  { name: "Mono timecode", value: "13px / 500 / mono", description: "Timecodes and counters", className: "vc-type-mono-timecode", sample: "00:01:24.120" },
  { name: "Mono metadata", value: "10.5px / 400 / mono", description: "Paths and versions", className: "vc-type-mono-meta", sample: "E:/video-projects/tokyo/project.json" },
];

const spacingTokens: TokenItem[] = [
  { name: "--space-1", value: "4px", description: "Hairline gaps" },
  { name: "--space-2", value: "6px", description: "Tight icon/text gap" },
  { name: "--space-3", value: "8px", description: "Compact control padding" },
  { name: "--space-4", value: "10px", description: "Toolbar rhythm" },
  { name: "--space-5", value: "12px", description: "Default button padding" },
  { name: "--space-6", value: "14px", description: "Panel interior rhythm" },
  { name: "--space-7", value: "16px", description: "List and card spacing" },
  { name: "--space-8", value: "20px", description: "Page section spacing" },
  { name: "--space-9", value: "24px", description: "Large panel gaps" },
  { name: "--space-10", value: "32px", description: "Footer reserve and broad rhythm" },
  { name: "--space-11", value: "40px", description: "Wide layout spacing" },
  { name: "--space-12", value: "56px", description: "Maximum global gap" },
];

const radiusTokens: TokenItem[] = [
  { name: "--r-sm", value: "4px", description: "Compact controls" },
  { name: "--r", value: "6px", description: "Default cards and buttons" },
  { name: "--r-md", value: "10px", description: "Large panels" },
  { name: "--r-lg", value: "14px", description: "Special large surfaces" },
  { name: "--r-pill", value: "999px", description: "Tags, status badges, round icon controls" },
];

const shadowTokens: TokenItem[] = [
  { name: "--shadow-1", description: "Raised inline surface" },
  { name: "--shadow-2", description: "Modal and popover elevation" },
];

const cinemaTokens: TokenItem[] = [
  { name: "--cinema-aspect-landscape", value: "16 / 9", description: "Landscape preview canvas" },
  { name: "--cinema-aspect-portrait", value: "9 / 16", description: "Portrait preview canvas" },
  { name: "--cinema-final-width", value: "1920px", description: "Final render width" },
  { name: "--cinema-final-height", value: "1080px", description: "Final render height" },
  { name: "--cinema-final-fps", value: "30", description: "Final frame rate" },
  { name: "--cinema-final-range", value: "sdr", description: "Final dynamic range" },
  { name: "--cinema-final-color-space", value: "bt709", description: "Final color space" },
  { name: "--cinema-draft-width", value: "1280px", description: "Draft render width" },
  { name: "--cinema-draft-height", value: "720px", description: "Draft render height" },
  { name: "--cinema-draft-fps", value: "30", description: "Draft frame rate" },
  { name: "--cinema-preview-fit", value: "contain", description: "Preview fit mode" },
  { name: "--cinema-subtitle-safe-x", value: "8%", description: "Subtitle horizontal safe area" },
  { name: "--cinema-subtitle-safe-y", value: "10%", description: "Subtitle vertical safe area" },
  { name: "--cinema-watermark-safe-x", value: "5%", description: "Watermark horizontal safe area" },
  { name: "--cinema-watermark-safe-y", value: "5%", description: "Watermark vertical safe area" },
  { name: "--cinema-pip-inset-x", value: "4%", description: "Picture-in-picture horizontal inset" },
  { name: "--cinema-pip-inset-y", value: "4%", description: "Picture-in-picture vertical inset" },
  { name: "--cinema-pip-min-scale", value: "0.22", description: "Picture-in-picture minimum scale" },
  { name: "--cinema-pip-max-scale", value: "0.36", description: "Picture-in-picture maximum scale" },
  { name: "--cinema-timeline-track-height", value: "28px", description: "Timeline track height" },
  { name: "--cinema-timeline-layer-height", value: "36px", description: "Timeline layer height" },
  { name: "--cinema-playhead-width", value: "2px", description: "Timeline playhead width" },
  { name: "--cinema-clip-radius", value: "var(--r)", description: "Timeline clip radius" },
];

export default function TokensPage() {
  const t = useTranslations("pages.tokens");

  return (
    <PageChrome className="gap-(--space-8)">
      <header className="grid gap-(--space-2)">
        <p className="vc-type-eyebrow text-(--text-3)">{t("eyebrow")}</p>
        <h1 className="vc-type-display text-(--text)">{t("title")}</h1>
        <p className="vc-type-body max-w-[76ch] text-(--text-2)">{t("summary")}</p>
      </header>

      <TokenSection
        description={t("descriptions.colors")}
        id="colors"
        title={t("sections.colors")}
      >
        <div className="grid gap-(--space-3) md:grid-cols-2 xl:grid-cols-3">
          {colorTokens.map((token) => (
            <TokenRow key={token.name} token={token}>
              <span
                aria-hidden="true"
                className="h-(--space-9) w-(--space-9) shrink-0 rounded-(--r-sm) border border-(--line)"
                style={{ background: `var(${token.name})` }}
              />
            </TokenRow>
          ))}
        </div>
      </TokenSection>

      <TokenSection description={t("descriptions.type")} id="type" title={t("sections.type")}>
        <div className="grid gap-(--space-3) xl:grid-cols-2">
          <Surface className="grid gap-(--space-3)" padding="small" tone="raised">
            <p className="vc-type-eyebrow text-(--text-3)">Font families</p>
            <p className="vc-type-body text-(--text)">Inter Tight / system sans</p>
            <p className="vc-type-mono-timecode">JetBrains Mono / system mono</p>
          </Surface>
          {typeSamples.map((sample) => (
            <Surface className="grid gap-(--space-2)" key={sample.name} padding="small">
              <p className={sample.className}>{sample.sample}</p>
              <TokenMeta token={sample} />
            </Surface>
          ))}
        </div>
      </TokenSection>

      <TokenSection description={t("descriptions.spacing")} id="spacing" title={t("sections.spacing")}>
        <div className="grid gap-(--space-2)">
          {spacingTokens.map((token) => (
            <TokenRow key={token.name} token={token}>
              <span
                aria-hidden="true"
                className="block h-(--space-3) rounded-(--r-pill) bg-(--amber)"
                style={{ width: `var(${token.name})` }}
              />
            </TokenRow>
          ))}
        </div>
      </TokenSection>

      <TokenSection description={t("descriptions.radii")} id="radii" title={t("sections.radii")}>
        <div className="grid gap-(--space-3) md:grid-cols-2 xl:grid-cols-5">
          {radiusTokens.map((token) => (
            <Surface className="grid min-h-28 gap-(--space-3)" key={token.name} padding="small">
              <span
                aria-hidden="true"
                className="h-(--space-10) border border-(--line) bg-(--bg-4)"
                style={{ borderRadius: `var(${token.name})` }}
              />
              <TokenMeta token={token} />
            </Surface>
          ))}
        </div>
      </TokenSection>

      <TokenSection description={t("descriptions.shadows")} id="shadows" title={t("sections.shadows")}>
        <div className="grid gap-(--space-3) md:grid-cols-2">
          {shadowTokens.map((token) => (
            <Surface
              className="grid min-h-28 gap-(--space-3)"
              key={token.name}
              padding="small"
              style={{ boxShadow: `var(${token.name})` }}
            >
              <TokenMeta token={token} />
            </Surface>
          ))}
        </div>
      </TokenSection>

      <TokenSection description={t("descriptions.cinema")} id="cinema" title={t("sections.cinema")}>
        <div className="grid gap-(--space-3) xl:grid-cols-[minmax(320px,0.8fr)_1fr]">
          <div className="grid gap-(--space-3)">
            <Surface className="vc-cinema-landscape relative overflow-hidden bg-(--bg-2)" padding="none">
              <div className="absolute inset-[var(--cinema-subtitle-safe-y)_var(--cinema-subtitle-safe-x)] border border-dashed border-(--amber)" />
              <div className="absolute bottom-(--space-5) left-1/2 h-(--space-3) w-1/2 -translate-x-1/2 rounded-(--r-pill) bg-(--bg-5)" />
              <div className="absolute right-[var(--cinema-pip-inset-x)] top-[var(--cinema-pip-inset-y)] aspect-video w-[28%] rounded-(--cinema-clip-radius) border border-(--violet) bg-(--bg-4)" />
              <div className="absolute bottom-0 left-1/2 top-0 w-[var(--cinema-playhead-width)] bg-(--amber)" />
            </Surface>
            <Surface className="grid gap-px overflow-hidden bg-(--line)" padding="none">
              <div className="h-[var(--cinema-timeline-track-height)] bg-(--bg-2)" />
              <div className="h-[var(--cinema-timeline-layer-height)] rounded-(--cinema-clip-radius) bg-(--amber)" />
            </Surface>
          </div>
          <div className="grid gap-(--space-2) md:grid-cols-2">
            {cinemaTokens.map((token) => (
              <TokenRow key={token.name} token={token} />
            ))}
          </div>
        </div>
      </TokenSection>

      <TokenSection description={t("descriptions.components")} id="components" title={t("sections.components")}>
        <div className="grid gap-(--space-4) xl:grid-cols-2">
          <Surface className="grid gap-(--space-3)" padding="small" tone="raised">
            <p className="vc-type-eyebrow text-(--text-3)">Buttons</p>
            <div className="flex flex-wrap gap-(--space-2)">
              <Button variant="primary">Open folder</Button>
              <Button variant="render">Render draft</Button>
              <Button variant="default">Save</Button>
              <Button variant="ghost" size="small">Cancel</Button>
              <Button variant="danger" size="extra-small">Delete</Button>
              <IconButton icon={Settings} label="Settings" />
              <IconButton icon={Play} label="Preview" variant="default" />
              <IconButton icon={Trash2} label="Remove" variant="danger" />
            </div>
          </Surface>

          <Surface className="grid gap-(--space-3)" padding="small" tone="raised">
            <p className="vc-type-eyebrow text-(--text-3)">Status and mode</p>
            <SegmentedControl
              ariaLabel="Mode sample"
              items={[
                { label: "Fit", value: "fit" },
                { label: "Actual", value: "actual" },
                { label: "Final", value: "final" },
              ]}
              onValueChange={() => undefined}
              value="fit"
            />
            <div className="flex flex-wrap gap-(--space-2)">
              <StatusTag variant="idle">idle</StatusTag>
              <StatusTag variant="cached">cached</StatusTag>
              <StatusTag variant="aligned">aligned</StatusTag>
              <StatusTag variant="composing">composing</StatusTag>
              <StatusTag variant="missing-asset">missing asset</StatusTag>
              <StatusTag variant="ready">ready</StatusTag>
            </div>
          </Surface>

          <Surface className="grid gap-(--space-3)" padding="small" tone="raised">
            <p className="vc-type-eyebrow text-(--text-3)">Forms</p>
            <div className="grid gap-(--space-3) md:grid-cols-2">
              <Field htmlFor="token-project" label="Project path" hint="Local folders stay on this workstation.">
                <TextInput id="token-project" defaultValue="E:/video-projects/tokyo" />
              </Field>
              <Field htmlFor="token-search" label="Search media">
                <SearchInput id="token-search" placeholder="voice.wav" />
              </Field>
              <Field htmlFor="token-preset" label="Preset">
                <Select id="token-preset" defaultValue="draft">
                  <option value="draft">Draft 720p</option>
                  <option value="final">Final 1080p</option>
                </Select>
              </Field>
              <Field htmlFor="token-duration" label="Duration">
                <NumberInput id="token-duration" defaultValue={42} />
              </Field>
            </div>
            <label className="vc-type-body inline-flex items-center gap-(--space-2) text-(--text-2)">
              <Checkbox defaultChecked />
              Keep assignments after re-recording
            </label>
          </Surface>

          <Surface className="grid gap-(--space-3)" padding="small" tone="raised">
            <p className="vc-type-eyebrow text-(--text-3)">Keyboard and layers</p>
            <div className="flex flex-wrap gap-(--space-2)">
              <Kbd>cmd K</Kbd>
              <Kbd>cmd F</Kbd>
              <Kbd>Esc</Kbd>
            </div>
            <div className="flex flex-wrap gap-(--space-2)">
              <LayerChip label="Background" variant="background" zIndex={0} />
              <LayerChip label="Foreground" variant="foreground" zIndex={20} />
              <LayerChip label="PiP" variant="pip" zIndex={40} />
              <LayerChip label="Subtitles" variant="subtitles" zIndex={60} />
            </div>
          </Surface>
        </div>
      </TokenSection>
    </PageChrome>
  );
}

function TokenSection({
  children,
  description,
  id,
  title,
}: {
  children: ReactNode;
  description: string;
  id: string;
  title: string;
}) {
  return (
    <section className="grid gap-(--space-4)" aria-labelledby={`tokens-${id}`}>
      <div className="grid gap-(--space-1)">
        <h2 className="vc-type-h2 text-(--text)" id={`tokens-${id}`}>
          {title}
        </h2>
        <p className="vc-type-body max-w-[80ch] text-(--text-2)">{description}</p>
      </div>
      {children}
    </section>
  );
}

function TokenRow({ children, token }: { children?: ReactNode; token: TokenItem }) {
  return (
    <Surface className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-(--space-3)" padding="small">
      {children}
      <TokenMeta token={token} />
    </Surface>
  );
}

function TokenMeta({ token }: { token: TokenItem }) {
  return (
    <div className="min-w-0">
      <p className="vc-type-mono-timecode truncate text-(--text)">{token.name}</p>
      {token.value ? <p className="vc-type-mono-meta text-(--text-3)">{token.value}</p> : null}
      <p className="vc-type-caption text-(--text-3)">{token.description}</p>
    </div>
  );
}
