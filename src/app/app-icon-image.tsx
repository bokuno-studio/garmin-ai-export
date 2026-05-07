import { ImageResponse } from "next/og";

const ICON_BACKGROUND = "#104c3f";
const ICON_FOREGROUND = "#ffffff";

export function createAppIconResponse(size: { width: number; height: number }) {
  const iconSize = Math.round(size.width * 0.62);

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: ICON_BACKGROUND,
          borderRadius: "20%",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <svg
          fill="none"
          height={iconSize}
          viewBox="0 0 24 24"
          width={iconSize}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M10 12v-1"
            stroke={ICON_FOREGROUND}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          <path
            d="M10 18v-2"
            stroke={ICON_FOREGROUND}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          <path
            d="M10 7V6"
            stroke={ICON_FOREGROUND}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          <path
            d="M14 2v4a2 2 0 0 0 2 2h4"
            stroke={ICON_FOREGROUND}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          <path
            d="M15.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v16a2 2 0 0 0 .274 1.01"
            stroke={ICON_FOREGROUND}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          <circle
            cx="10"
            cy="20"
            r="2"
            stroke={ICON_FOREGROUND}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </div>
    ),
    size,
  );
}
