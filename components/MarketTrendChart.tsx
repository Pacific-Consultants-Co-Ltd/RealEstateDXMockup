"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatPercent, formatYenPerM2 } from "@/lib/formatters";
import type { PublicLandPricePoint } from "@/lib/types";

interface MarketTrendChartProps {
  points: PublicLandPricePoint[];
}

export default function MarketTrendChart({ points }: MarketTrendChartProps) {
  const chartData = [...points]
    .sort((a, b) => a.year - b.year)
    .reduce<Array<{ year: number; point: string; price: number; growth: number }>>((items, point) => {
      const existing = items.find((item) => item.year === point.year);
      if (existing) {
        existing.price = Math.round((existing.price + point.pricePerM2) / 2);
        existing.growth = Number(((existing.growth + point.yearOnYearChangeRate) / 2).toFixed(2));
        return items;
      }

      items.push({
        year: point.year,
        point: point.standardLotNumber || point.pointId,
        price: point.pricePerM2,
        growth: point.yearOnYearChangeRate
      });
      return items;
    }, []);

  return (
    <section className="panel chart-panel">
      <div className="section-heading">
        <span>公示地価トレンド</span>
        <small>価格 / 変動率</small>
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer height={220} width="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 4, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="#e1e7e4" strokeDasharray="3 3" />
            <XAxis dataKey="year" fontSize={12} tickLine={false} />
            <YAxis fontSize={12} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}千`} yAxisId="price" />
            <YAxis
              fontSize={12}
              orientation="right"
              tickFormatter={(value) => `${value}%`}
              width={34}
              yAxisId="growth"
            />
            <Tooltip
              formatter={(value, name) => {
                if (name === "価格（円/㎡）") {
                  return [formatYenPerM2(Number(value)), name];
                }

                return [formatPercent(Number(value)), name];
              }}
              labelFormatter={(label) => `${label}年`}
            />
            <Bar dataKey="price" fill="#376d67" name="価格（円/㎡）" radius={[4, 4, 0, 0]} yAxisId="price" />
            <Line
              dataKey="growth"
              dot={{ r: 3 }}
              name="対前年変動率（%）"
              stroke="#d26a2e"
              strokeWidth={2}
              type="monotone"
              yAxisId="growth"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="trend-table">
        {chartData.map((point) => (
          <div key={point.year}>
            <span>{point.year}年</span>
            <span>{point.point}</span>
            <span>{formatYenPerM2(point.price)}</span>
            <span>{formatPercent(point.growth)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
