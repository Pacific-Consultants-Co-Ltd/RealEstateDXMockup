import { Building2, ShieldCheck, Server } from "lucide-react";

export default function Header() {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-mark">
          <img alt="" aria-hidden="true" className="brand-logo" src="/logo.svg" />
        </div>
        <div className="header-title-group">
          <h1>不動産DXモック</h1>
        </div>
      </div>
      <div aria-label="運用ステータス" className="header-meta">
        <span>
          <Building2 aria-hidden="true" size={15} />
          Panasonic Homes
        </span>
        <span>
          <Server aria-hidden="true" size={15} />
          AWS想定
        </span>
        <strong>
          <ShieldCheck aria-hidden="true" size={15} />
          CONFIDENTIAL
        </strong>
      </div>
    </header>
  );
}
