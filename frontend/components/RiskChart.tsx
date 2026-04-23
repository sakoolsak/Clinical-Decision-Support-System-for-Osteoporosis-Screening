"use client";

type Props = {
  riskScore: number;
};

export default function RiskChart({ riskScore }: Props) {
  const width = Math.max(4, Math.min(100, riskScore));
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 700 }}>Risk Score: {riskScore}%</div>
      <div style={{ width: "100%", height: 12, background: "#e5e7eb", borderRadius: 999 }}>
        <div
          style={{
            width: `${width}%`,
            height: "100%",
            borderRadius: 999,
            background: riskScore >= 70 ? "#dc2626" : riskScore >= 40 ? "#f59e0b" : "#16a34a"
          }}
        />
      </div>
    </div>
  );
}
