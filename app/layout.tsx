import type { Metadata } from "next";
import type { ReactNode } from "react";
import "leaflet/dist/leaflet.css";
import "./globals.css";

// 不動産査定支援

export const metadata: Metadata = {
  title: "まちしるべPRO（仮）",
  description: "まちしるべPRO（仮） 用地取得査定ダッシュボード",
  icons: {
    icon: "/logo.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
