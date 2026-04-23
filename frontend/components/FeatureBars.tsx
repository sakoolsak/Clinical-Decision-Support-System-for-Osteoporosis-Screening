"use client";

type FactorMap = Record<string, number>;

type Props = {
  visualizationJson?: string | null;
};

const LABELS: Record<string, string> = {
  age_factor: "Age",
  bmd_factor: "Spine BMD",
  bmi_factor: "BMI",
  smoking_factor: "Smoking",
  steroid_factor: "Steroid Use",
  image_factor: "X-ray Intensity",
};

export default function FeatureBars({ visualizationJson }: Props) {
  let data: FactorMap = {};
  if (visualizationJson) {
    try {
      data = JSON.parse(visualizationJson);
    } catch {
      data = {};
    }
  }

  const items = Object.entries(data);
  const max = items.length ? Math.max(...items.map(([, v]) => Math.abs(Number(v) || 0))) : 1;

  return (
    <div className="feature-bars">
      <div className="feature-bars-head">
        <span>FEATURE CONTRIBUTION</span>
        <small>Hybrid Tabular + Image</small>
      </div>
      {items.length === 0 && <p className="muted">No prediction yet.</p>}
      <ul>
        {items.map(([key, raw]) => {
          const value = Number(raw) || 0;
          const pct = Math.min(100, (Math.abs(value) / (max || 1)) * 100);
          const barColor = value >= 0.1 ? "#ef4444" : value >= 0.05 ? "#f59e0b" : "#22c55e";
          return (
            <li key={key}>
              <div className="row-head">
                <span>{LABELS[key] || key}</span>
                <strong>{value.toFixed(3)}</strong>
              </div>
              <div className="row-track">
                <div
                  className="row-fill"
                  style={{ width: `${pct}%`, background: barColor }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
