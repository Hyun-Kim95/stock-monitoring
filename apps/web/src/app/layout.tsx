import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "주식 모니터링",
  description: "국내 주식 관심종목 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-dvh bg-background font-sans text-foreground">
        <Script id="theme-init" strategy="beforeInteractive">
          {`(() => {
            try {
              const v = localStorage.getItem("sm-theme");
              const dark = v !== "light";
              document.documentElement.classList.toggle("dark", dark);
            } catch {
              document.documentElement.classList.add("dark");
            }
          })();`}
        </Script>
        {children}
      </body>
    </html>
  );
}
