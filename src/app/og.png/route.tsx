import { ImageResponse } from "next/og";

const size = {
  width: 1200,
  height: 630,
};

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          background: "#f7f8fb",
          color: "#101827",
          display: "flex",
          flexDirection: "column",
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          height: "100%",
          justifyContent: "space-between",
          padding: 64,
          width: "100%",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: 24 }}>
          <div
            style={{
              alignItems: "center",
              background: "#104c3f",
              borderRadius: 24,
              display: "flex",
              height: 96,
              justifyContent: "center",
              width: 96,
            }}
          >
            <svg
              fill="none"
              height="58"
              viewBox="0 0 24 24"
              width="58"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10 12v-1M10 18v-2M10 7V6M14 2v4a2 2 0 0 0 2 2h4M15.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v16a2 2 0 0 0 .274 1.01"
                stroke="#ffffff"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
              <circle
                cx="10"
                cy="20"
                r="2"
                stroke="#ffffff"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                color: "#28735f",
                fontSize: 30,
                fontWeight: 700,
                lineHeight: 1.2,
              }}
            >
              Garmin AI Export
            </div>
            <div
              style={{
                color: "#5b6472",
                fontSize: 24,
                lineHeight: 1.35,
                marginTop: 6,
              }}
            >
              Browser-only Garmin CSV converter
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <h1
            style={{
              color: "#101827",
              fontSize: 70,
              fontWeight: 760,
              letterSpacing: 0,
              lineHeight: 1.05,
              margin: 0,
              maxWidth: 960,
            }}
          >
            Garmin Connect ZIP to AI-ready CSV
          </h1>
          <p
            style={{
              color: "#475467",
              fontSize: 34,
              lineHeight: 1.35,
              margin: 0,
              maxWidth: 940,
            }}
          >
            Convert activities, sleep, daily health, and laps for ChatGPT,
            Gemini, and Claude.
          </p>
        </div>

        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: 18,
          }}
        >
          {["Garmin ZIP", "CSV bundle", "AI analysis"].map((item, index) => (
            <div
              key={item}
              style={{ alignItems: "center", display: "flex", gap: 18 }}
            >
              <div
                style={{
                  alignItems: "center",
                  background: index === 1 ? "#eef3fa" : "#eaf7ef",
                  border: "2px solid #d8dee8",
                  borderRadius: 14,
                  color: index === 1 ? "#24527a" : "#28735f",
                  display: "flex",
                  fontSize: 28,
                  fontWeight: 700,
                  height: 72,
                  justifyContent: "center",
                  padding: "0 28px",
                }}
              >
                {item}
              </div>
              {index < 2 ? (
                <div
                  style={{
                    color: "#8b95a1",
                    fontSize: 34,
                    fontWeight: 700,
                  }}
                >
                  -&gt;
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
