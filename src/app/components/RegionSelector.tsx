"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_REGION, REGIONS, type RegionId } from "@/lib/regions";

export function RegionSelector({ value, onChange }: { value?: RegionId; onChange?: (region: RegionId) => void }) {
  const [region, setRegion] = useState<RegionId>(value ?? DEFAULT_REGION);
  const [open, setOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const triggerPointerType = useRef("");
  const current = REGIONS.find((item) => item.id === region) ?? REGIONS[0];

  useEffect(() => {
    if (value) {
      setRegion(value);
      return;
    }
    const saved = window.localStorage.getItem("glitchprice-region") as RegionId | null;
    if (saved && REGIONS.some((item) => item.id === saved)) setRegion(saved);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!selectorRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function selectRegion(nextRegion: RegionId) {
    setOpen(false);
    setRegion(nextRegion);
    window.localStorage.setItem("glitchprice-region", nextRegion);
    window.dispatchEvent(new CustomEvent("glitchprice-region-change", { detail: nextRegion }));
    onChange?.(nextRegion);
  }

  return (
    <div className="regionSelector" ref={selectorRef} data-open={open}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setOpen(true); }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") setOpen(false); }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button ref={buttonRef} type="button" className="regionButton" aria-label={`Region: ${current.label}`} title={`Region: ${current.label}`}
        aria-expanded={open} aria-haspopup="menu"
        onPointerDown={(event) => { triggerPointerType.current = event.pointerType; }}
        onClick={(event) => setOpen((currentOpen) => event.detail !== 0 && triggerPointerType.current === "mouse" ? true : !currentOpen)}>
        <img src={current.flagSrc} alt="" />
      </button>
      {open && <div className="regionMenu" role="menu">
        {REGIONS.map((item) => (
          <button
            key={item.id}
            className={item.id === region ? "active" : ""}
            onClick={() => selectRegion(item.id)}
            role="menuitem"
            type="button"
          >
            <img src={item.flagSrc} alt="" />
            <strong>{item.label}</strong>
            <em>{item.currency}</em>
          </button>
        ))}
      </div>}
    </div>
  );
}
