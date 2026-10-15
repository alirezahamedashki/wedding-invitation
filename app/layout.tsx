import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "علیرضا و آتوسا — جشن عقد",
  description: "دعوتنامه دیجیتال جشن عقد علیرضا و آتوسا — سه‌شنبه ۲۸ مهر ۱۴۰۵، عمارت عقد شب‌های رویایی کرج.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='30' fill='%2317392f'/%3E%3Ctext x='32' y='42' font-family='Georgia' font-size='30' fill='%23d9b878' text-anchor='middle'%3EA%3C/text%3E%3C/svg%3E",
  },
  openGraph: {
    title: "علیرضا و آتوسا — جشن عقد",
    description: "با افتخار و شادی شما را به جشن عقدمان دعوت می‌کنیم — ۲۸ مهر ۱۴۰۵.",
    type: "website",
    locale: "fa_IR",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#17362c",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <link rel="preload" href="/fonts/Vazirmatn.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/IranNastaliq.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" href="/calla-hand-envelope.webp" as="image" type="image/webp" />
        <link rel="preload" href="/images/bouquet-1200.webp" as="image" type="image/webp" />
      </head>
      <body>{children}</body>
    </html>
  );
}
