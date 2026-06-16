"use client";

import { X } from "lucide-react";

import DataSourceBadge from "@/components/DataSourceBadge";
import { formatM2, formatTsubo, formatYen, formatYenPerTsubo } from "@/lib/formatters";
import type { ComparableCase } from "@/lib/types";

interface CaseDetailDrawerProps {
  comparable: ComparableCase | null;
  onClose: () => void;
}

export default function CaseDetailDrawer({ comparable, onClose }: CaseDetailDrawerProps) {
  if (!comparable) {
    return null;
  }

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside aria-modal="true" className="detail-drawer" role="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <DataSourceBadge source={comparable.source} />
            <h2>{comparable.address}</h2>
          </div>
          <button aria-label="閉じる" className="icon-button" type="button" onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <dl className="detail-grid">
          <div>
            <dt>物件番号</dt>
            <dd>{comparable.propertyNumber || "-"}</dd>
          </div>
          <div>
            <dt>物件種目</dt>
            <dd>{comparable.propertyType || "-"}</dd>
          </div>
          <div>
            <dt>土地面積</dt>
            <dd>
              {formatTsubo(comparable.landAreaTsubo)} / {formatM2(comparable.landAreaM2)}
            </dd>
          </div>
          <div>
            <dt>価格</dt>
            <dd>{comparable.priceTotalDisplay || formatYen(comparable.priceTotalYen)}</dd>
          </div>
          <div>
            <dt>坪単価</dt>
            <dd>{formatYenPerTsubo(comparable.unitPricePerTsubo)}</dd>
          </div>
          <div>
            <dt>用途地域</dt>
            <dd>{comparable.zoning || "-"}</dd>
          </div>
          <div>
            <dt>沿線駅</dt>
            <dd>{comparable.nearestStation || "-"}</dd>
          </div>
          <div>
            <dt>交通</dt>
            <dd>{comparable.access || "-"}</dd>
          </div>
          <div>
            <dt>接道</dt>
            <dd>{comparable.roadCondition || "-"}</dd>
          </div>
          <div>
            <dt>成約年月日</dt>
            <dd>{comparable.transactionDate || "-"}</dd>
          </div>
        </dl>

      </aside>
    </div>
  );
}
