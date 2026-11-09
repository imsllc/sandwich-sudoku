import React from "react";
import Svg, { Path, Circle, Line } from "react-native-svg";
export type IconName =
  | "sandwich"
  | "sun"
  | "moon"
  | "undo"
  | "erase"
  | "pencil"
  | "hint"
  | "solve"
  | "pause"
  | "play"
  | "plus"
  | "settings"
  | "help"
  | "close"
  | "check"
  | "restart";
export function Icon({
  name,
  color,
  size = 22,
}: {
  name: IconName;
  color: string;
  size?: number;
}) {
  const paths: Partial<Record<IconName, string>> = {
    sandwich: "M4 5h16v14H4ZM4 10h16M4 14h16M9 5v14M15 5v14",
    moon: "M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z",
    undo: "M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12",
    erase:
      "m4 15 8-10a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-7 8H9l-5-4a2 2 0 0 1 0-2Zm4-5 8 8M13 21h8",
    pencil: "m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 15Z",
    hint: "M9 18h6M10 22h4M8 14a6 6 0 1 1 8 0l-1 2H9Z",
    solve: "m4 12 5 5L20 5M14 17h7M17.5 13.5v7",
    play: "m9 5 11 7-11 7Z",
    plus: "M12 5v14M5 12h14",
    settings:
      "m9 3-.5 3-2 1.2L4 6l-2 3.5 2.5 1.8v2.4L2 15.5 4 19l2.5-1.2 2 1.2.5 3h4l.5-3 2-1.2L18 19l2-3.5-2.5-1.8v-2.4L20 9.5 18 6l-2.5 1.2-2-1.2L13 3ZM14.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z",
    close: "m6 6 12 12M6 18 18 6",
    check: "m5 12 4 4L19 6",
    restart: "M4 10a8 8 0 1 1 1 8M4 4v6h6",
  };
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] && <Path d={paths[name]} />}
      {name === "pause" && (
        <>
          <Line x1="8" x2="8" y1="5" y2="19" />
          <Line x1="16" x2="16" y1="5" y2="19" />
        </>
      )}
      {name === "help" && (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01" />
        </>
      )}
      {name === "sun" && (
        <>
          <Circle cx="12" cy="12" r="4" />
          <Path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" />
        </>
      )}
    </Svg>
  );
}
