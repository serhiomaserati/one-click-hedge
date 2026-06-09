import { ImageResponse } from "next/og";

export const alt = "HedgeHub — AI risk co-pilot for Polymarket";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          padding: "84px",
        }}
      >
        {/* wordmark */}
        <div style={{ display: "flex", alignItems: "center", fontSize: 30, color: "#52525b" }}>
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 9999,
              background: "#10b981",
              marginRight: 14,
            }}
          />
          <div style={{ display: "flex" }}>HedgeHub</div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 38, color: "#71717a", marginBottom: 18 }}>
            AI risk co-pilot for Polymarket
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 88,
              fontWeight: 700,
              color: "#18181b",
              lineHeight: 1.05,
              letterSpacing: "-3px",
            }}
          >
            <div style={{ display: "flex" }}>Lock in your</div>
            <div style={{ display: "flex" }}>
              <div style={{ display: "flex" }}>Polymarket&nbsp;</div>
              <div style={{ display: "flex", color: "#10b981" }}>profits.</div>
            </div>
          </div>
        </div>

        {/* footer line */}
        <div style={{ display: "flex", fontSize: 28, color: "#71717a" }}>
          Hedge or take profit in one click — at live order-book prices.
        </div>
      </div>
    ),
    { ...size }
  );
}
