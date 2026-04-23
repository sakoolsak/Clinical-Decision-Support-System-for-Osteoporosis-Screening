"use client";

type Props = {
  riskScore: number;
  label?: string;
  probability?: number;
};

export default function RiskGauge({ riskScore, label, probability }: Props) {
  const clamped = Math.max(0, Math.min(100, riskScore));
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;

  let color = "#22c55e";
  if (clamped >= 70) color = "#ef4444";
  else if (clamped >= 40) color = "#f59e0b";

  return (
    <div className="risk-gauge">
      <svg viewBox="0 0 220 220" width="100%" height="100%">
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.4" />
          </linearGradient>
          <filter id="gaugeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx="110" cy="110" r={radius} fill="none" stroke="#1e293b" strokeWidth="14" />
        <circle
          cx="110"
          cy="110"
          r={radius}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth="14"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={circumference / 4}
          strokeLinecap="round"
          transform="rotate(-90 110 110)"
          filter="url(#gaugeGlow)"
        />
        <text
          x="110"
          y="100"
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize="14"
          letterSpacing="2"
        >
          RISK SCORE
        </text>
        <text
          x="110"
          y="135"
          textAnchor="middle"
          fill="#f8fafc"
          fontSize="42"
          fontWeight="700"
        >
          {clamped.toFixed(1)}
        </text>
        <text x="110" y="160" textAnchor="middle" fill="#94a3b8" fontSize="12">
          of 100
        </text>
      </svg>

      <div className="risk-meta">
        <span className="risk-label" style={{ color }}>
          {label || "—"}
        </span>
        {typeof probability === "number" && (
          <span className="risk-prob">Probability {probability.toFixed(3)}</span>
        )}
      </div>
    </div>
  );
}
