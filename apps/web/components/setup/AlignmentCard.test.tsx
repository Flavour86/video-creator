import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import type { SetupAlignmentState } from "@vc/shared-schemas";
import { dictionaries } from "@/lib/i18n/messages";
import { AlignmentCard } from "./AlignmentCard";

function renderCard(status: SetupAlignmentState) {
  return render(
    <NextIntlClientProvider locale="en" messages={dictionaries.en} timeZone="UTC">
      <AlignmentCard
        alignment={{
          status,
          hash: "8a3f2c1df91c",
          device: "cuda · fp16",
          model: "large-v3",
          audio_duration: 942,
          cache_hit: status === "aligned",
        }}
        onRun={vi.fn()}
        transcript={{ path: "transcript.txt", sentence_count: 164, state: "parsed" }}
        voice={{ path: "voice.wav", duration: 942, sample_rate: 48000, channels: 2, codec: "pcm_s16le", state: "copied" }}
      />
    </NextIntlClientProvider>,
  );
}

describe("AlignmentCard", () => {
  test.each([
    ["pending", "ready", "bg-(--amber)"],
    ["running", "bg-(--blue)"],
    ["aligned", "succeeded", "bg-(--green)"],
    ["failed", "bg-(--red)"],
  ] as const)("switches tag variant for %s", (status, expectedLabelOrClass, maybeExpectedClass) => {
    const expectedLabel = maybeExpectedClass ? expectedLabelOrClass : status;
    const expectedClass = maybeExpectedClass ?? expectedLabelOrClass;
    renderCard(status);
    expect(screen.getAllByText(expectedLabel)[0]?.className).toContain(expectedClass);
  });

  test("does not show fake zero-count checks before inputs are detected", () => {
    render(
      <NextIntlClientProvider locale="en" messages={dictionaries.en} timeZone="UTC">
        <AlignmentCard
          alignment={{
            status: "pending",
            hash: "",
            device: "cuda 路 fp16",
            model: "large-v3",
            audio_duration: 0,
            cache_hit: false,
          }}
          onRun={vi.fn()}
          transcript={null}
          voice={null}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Transcript not detected yet")).toBeInTheDocument();
    expect(screen.getByText("Audio file not detected yet")).toBeInTheDocument();
    expect(screen.queryByText("Transcript readable 路 0 sentences")).not.toBeInTheDocument();
  });

  test("renders correction summary after successful alignment", () => {
    render(
      <NextIntlClientProvider locale="en" messages={dictionaries.en} timeZone="UTC">
        <AlignmentCard
          alignment={{
            status: "aligned",
            hash: "abc123",
            device: "cuda fp16",
            model: "large-v3",
            audio_duration: 120,
            cache_hit: false,
          }}
          correctionsApplied={7}
          onRun={vi.fn()}
          transcript={{ path: "transcript.txt", sentence_count: 5, state: "parsed" }}
          voice={{ path: "voice.wav", duration: 120, sample_rate: 48000, channels: 2, codec: "pcm_s16le", state: "copied" }}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Corrections applied: 7")).toBeInTheDocument();
  });

  test("renders alignment error details when failed", () => {
    render(
      <NextIntlClientProvider locale="en" messages={dictionaries.en} timeZone="UTC">
        <AlignmentCard
          alignment={{
            status: "failed",
            hash: "abc123",
            device: "cuda fp16",
            model: "large-v3",
            audio_duration: 120,
            cache_hit: false,
            error: "Transcript text does not match audio.",
          }}
          onRun={vi.fn()}
          transcript={{ path: "transcript.txt", sentence_count: 5, state: "parsed" }}
          voice={{ path: "voice.wav", duration: 120, sample_rate: 48000, channels: 2, codec: "pcm_s16le", state: "copied" }}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Transcript text does not match audio.")).toBeInTheDocument();
  });

  test("renders readiness guidance when alignment is not runnable yet", () => {
    render(
      <NextIntlClientProvider locale="en" messages={dictionaries.en} timeZone="UTC">
        <AlignmentCard
          alignment={{
            status: "pending",
            hash: "abc123",
            device: "cuda fp16",
            model: "large-v3",
            audio_duration: 120,
            cache_hit: false,
            error: "Generate subtitles successfully before running alignment.",
          }}
          onRun={vi.fn()}
          transcript={{ path: "transcript.txt", sentence_count: 5, state: "parsed" }}
          voice={{ path: "voice.wav", duration: 120, sample_rate: 48000, channels: 2, codec: "pcm_s16le", state: "copied" }}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Generate subtitles successfully before running alignment.")).toBeInTheDocument();
  });
});
