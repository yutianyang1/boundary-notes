"use client";

import { Check, ImagePlus, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  BACKGROUND_PRESETS,
  MAX_BLUR,
  MAX_DIM,
  type BackgroundFit,
  type TerminalAppearance,
} from "@/lib/terminal/appearance";

const FIT_OPTIONS: Array<{ value: BackgroundFit; label: string }> = [
  { value: "cover", label: "铺满" },
  { value: "contain", label: "完整" },
  { value: "tile", label: "平铺" },
];

type Props = {
  appearance: TerminalAppearance;
  hasImage: boolean;
  notice: string;
  onChange: (patch: Partial<TerminalAppearance>) => void;
  onPickImage: (file: File) => void;
  onRemoveImage: () => void;
  onReset: () => void;
  onClose: () => void;
};

/** 终端窗口右上角的背景设置面板，放在终端区域内，随窗口移动。 */
export function TerminalAppearancePanel({
  appearance,
  hasImage,
  notice,
  onChange,
  onPickImage,
  onRemoveImage,
  onReset,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isPreset = BACKGROUND_PRESETS.some((preset) => preset.color === appearance.color);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (panelRef.current?.contains(target) || target?.closest("[data-appearance-toggle]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="终端背景"
      tabIndex={-1}
      className="absolute top-3 right-3 z-30 max-h-[calc(100%-1.5rem)] w-72 overflow-y-auto rounded-lg border border-slate-700 bg-[#111827]/95 p-4 text-sm text-slate-100 shadow-2xl outline-none backdrop-blur"
      onContextMenu={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <p className="font-semibold">终端背景</p>
        <button type="button" aria-label="关闭背景设置" onClick={onClose} className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white">
          <X className="size-4" />
        </button>
      </div>

      <p className="mt-4 text-xs font-medium text-slate-400">颜色</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {BACKGROUND_PRESETS.map((preset) => {
          const selected = appearance.color === preset.color;
          return (
            <button
              key={preset.color}
              type="button"
              title={preset.name}
              aria-label={preset.name}
              aria-pressed={selected}
              onClick={() => onChange({ color: preset.color })}
              className={`grid size-7 place-items-center rounded-md border ${selected ? "border-indigo-300 ring-2 ring-indigo-400/60" : "border-white/15 hover:border-white/40"}`}
              style={{ backgroundColor: preset.color }}
            >
              {selected ? <Check className={`size-4 ${preset.color === "#f7f5ef" ? "text-slate-800" : "text-white"}`} /> : null}
            </button>
          );
        })}
        <label
          title="自定义颜色"
          className={`relative grid size-7 cursor-pointer place-items-center overflow-hidden rounded-md border ${!isPreset ? "border-indigo-300 ring-2 ring-indigo-400/60" : "border-white/15 hover:border-white/40"}`}
          style={{ background: isPreset ? "conic-gradient(#f87171, #facc15, #4ade80, #60a5fa, #c084fc, #f87171)" : appearance.color }}
        >
          <span className="sr-only">自定义颜色</span>
          <input
            type="color"
            value={appearance.color}
            onChange={(event) => onChange({ color: event.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>

      <p className="mt-5 text-xs font-medium text-slate-400">图片</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-white/15 hover:bg-white/10">
          <ImagePlus className="size-4" />{hasImage ? "更换图片" : "选择图片"}
        </button>
        {hasImage ? (
          <button type="button" aria-label="移除背景图片" title="移除背景图片" onClick={onRemoveImage} className="grid size-9 place-items-center rounded-md border border-white/15 text-slate-300 hover:bg-red-600 hover:text-white">
            <Trash2 className="size-4" />
          </button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onPickImage(file);
            event.target.value = "";
          }}
        />
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">{notice || "图片只保存在这个浏览器里，不会上传到服务器。"}</p>

      {hasImage ? (
        <>
          <div className="mt-4 grid grid-cols-3 rounded-md border border-white/15 p-0.5" role="radiogroup" aria-label="图片填充方式">
            {FIT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={appearance.fit === option.value}
                onClick={() => onChange({ fit: option.value })}
                className={`h-7 rounded text-xs ${appearance.fit === option.value ? "bg-indigo-500/80 font-semibold text-white" : "text-slate-300 hover:bg-white/10"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Slider label="遮罩暗度" unit="%" value={appearance.dim} max={MAX_DIM} onChange={(dim) => onChange({ dim })} />
          <Slider label="模糊" unit="px" value={appearance.blur} max={MAX_BLUR} onChange={(blur) => onChange({ blur })} />
        </>
      ) : null}

      <button type="button" onClick={onReset} className="mt-5 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
        <RotateCcw className="size-3.5" />恢复默认
      </button>
    </div>
  );
}

function Slider({ label, unit, value, max, onChange }: { label: string; unit: string; value: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="mt-4 block">
      <span className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="tabular-nums text-slate-300">{value}{unit}</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-indigo-400"
      />
    </label>
  );
}
