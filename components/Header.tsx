import { Building2, FileText, ShieldCheck } from "lucide-react";

export default function Header() {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-mark">
          <img alt="" aria-hidden="true" className="brand-logo" src="/logo.svg" />
        </div>
        <div className="header-title-group">
          <h1>不動産査定支援</h1>
        </div>
      </div>
      <div aria-label="資料ステータス" className="header-meta">
        <span>
          <Building2 aria-hidden="true" size={15} />
          Panasonic Homes
        </span>
        <span>
          <FileText aria-hidden="true" size={15} />
          社内確認用
        </span>
        <strong>
          <ShieldCheck aria-hidden="true" size={15} />
          社外秘
        </strong>
      </div>
    </header>
  );
}
