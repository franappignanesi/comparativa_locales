"use client";

import { useEffect, useState } from "react";
import { DEFAULT_REGION, REGIONS, type RegionId } from "@/lib/regions";

export function RegionSelector({ value, onChange }: { value?: RegionId; onChange?: (region: RegionId) => void }) {
  const [region, setRegion] = useState<RegionId>(value ?? DEFAULT_REGION);
  const current = REGIONS.find((item) => item.id === region) ?? REGIONS[0];

  useEffect(() => {
    if (value) {
      setRegion(value);
      return;
    }
    const saved = window.localStorage.getItem("glitchprice-region") as RegionId | null;
    if (saved && REGIONS.some((item) => item.id === saved)) setRegion(saved);
  }, [value]);

  function selectRegion(nextRegion: RegionId) {
    setRegion(nextRegion);
    window.localStorage.setItem("glitchprice-region", nextRegion);
    window.dispatchEvent(new CustomEvent("glitchprice-region-change", { detail: nextRegion }));
    onChange?.(nextRegion);
  }

  return (
    <div className="regionSelector">
      <button className="regionButton" aria-label={`Region: ${current.label}`} title={`Region: ${current.label}`}>
        <img src={current.flagSrc} alt="" />
      </button>
      <div className="regionMenu" role="menu">
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
      </div>
    </div>
  );
}
