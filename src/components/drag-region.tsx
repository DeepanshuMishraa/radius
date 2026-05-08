import type { CSSProperties } from "react";

export function DragRegion() {
  return (
    <div
      className="electrobun-webkit-app-region-drag fixed top-0 left-0 right-0 h-11 z-50"
      style={
        {
          appRegion: "drag",
          WebkitAppRegion: "drag",
        } as CSSProperties
      }
    />
  );
}
