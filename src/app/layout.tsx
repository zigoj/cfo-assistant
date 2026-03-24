import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CFO Assistant — Month-End Management Packs in 2 Minutes",
  description:
    "Upload your bank statement and P&L. Get a complete management pack — P&L summary, cash-flow, KPIs, and GL bridge — instantly.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://cfoassistant.com"),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
