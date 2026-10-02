"use client";

import { Leaf } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

const LEAVES = [
  { left: "6%", duration: "29s", delay: "-7s", size: 21, drift: "46px" },
  { left: "23%", duration: "33s", delay: "-24s", size: 16, drift: "-38px" },
  { left: "42%", duration: "26s", delay: "-13s", size: 25, drift: "55px" },
  { left: "62%", duration: "31s", delay: "-3s", size: 18, drift: "-44px" },
  { left: "81%", duration: "35s", delay: "-19s", size: 23, drift: "34px" },
  { left: "94%", duration: "28s", delay: "-10s", size: 17, drift: "-52px" }
];
const FOREGROUND_LEAVES = [
  { left: "17%", duration: "32s", delay: "-18s", size: 28, drift: "-54px" },
  { left: "57%", duration: "27s", delay: "-5s", size: 24, drift: "62px" },
  { left: "89%", duration: "36s", delay: "-27s", size: 31, drift: "-38px" }
];

export function AutumnLeaves() {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const update = () => setPaused(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return <>{[false, true].map(foreground => <div key={String(foreground)}
    className={`autumnLeaves${foreground ? " autumnLeavesForeground" : ""}`} aria-hidden="true" data-paused={paused}>
    {(foreground ? FOREGROUND_LEAVES : LEAVES).map((leaf, index) => <span className="autumnFallingLeaf" key={index} style={{
      "--leaf-left": leaf.left, "--leaf-duration": leaf.duration, "--leaf-opacity": foreground ? ".13" : ".23",
      "--leaf-delay": leaf.delay, "--leaf-drift": leaf.drift
    } as CSSProperties}><span className="autumnLeafSway"><Leaf size={leaf.size} strokeWidth={1.3} /></span></span>)}
  </div>)}</>;
}
