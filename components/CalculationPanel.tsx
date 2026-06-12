import { Gauge, TrendingUp } from "lucide-react";

import { formatPercent, formatYen, formatYenPerTsubo } from "@/lib/formatters";
import type { ValuationResult } from "@/lib/types";

interface CalculationPanelProps {
  result: ValuationResult;
  growthRatePercent: number;
  adjustmentPercent: number;
}

export default function CalculationPanel({ result, growthRatePercent, adjustmentPercent }: CalculationPanelProps) {
  const cards = [
    {
      label: "グロス相場",
      value: formatYen(result.grossMarketPrice),
      sub: `${result.selectedCount}件選択`
    },
    {
      label: "単価相場",
      value: formatYenPerTsubo(result.averageTsuboUnitPrice),
      sub: "選択事例平均"
    },
    {
      label: "上昇率",
      value: formatPercent(growthRatePercent),
      sub: `倍率 ${result.growthMultiplier.toFixed(3)}`
    },
    {
      label: "要因調整",
      value: formatPercent(adjustmentPercent),
      sub: formatYen(result.adjustmentAmount)
    },
    {
      label: "査定金額",
      value: formatYen(result.appraisalAmount),
      sub: "市場上昇率反映"
    },
    {
      label: "入札額",
      value: formatYen(result.bidAmount),
      sub: "調整後",
      tone: "highlight"
    }
  ];

  return (
    <section className="panel calculation-panel">
      <div className="section-heading">
        <span>入札シミュレーション</span>
        <small>選択 {result.selectedCount}件</small>
      </div>

      <div className="calc-summary">
        <Gauge aria-hidden="true" size={20} />
        <div>
          <strong>{formatYen(result.bidAmount)}</strong>
          <span>概算入札額</span>
        </div>
      </div>

      <div className="kpi-grid">
        {cards.map((card) => (
          <div className={`kpi-card ${card.tone ?? ""}`} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.sub}</small>
          </div>
        ))}
      </div>

      <div className="formula-box">
        <TrendingUp aria-hidden="true" size={18} />
        <div>
          <p>用地坪数 × 坪単価相場 × 上昇率 = 査定額</p>
          <p>査定額 × 格差修正 = 入札額</p>
        </div>
      </div>
    </section>
  );
}
