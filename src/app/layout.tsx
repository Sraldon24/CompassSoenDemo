import { CookieBanner } from "@/components/common/cookie-banner";
import { ACCENT_NO_FLASH_SCRIPT } from "@/components/providers/accent-picker";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnalyticsProvider } from "@/lib/analytics/client";
import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Meridian typography: Bricolage Grotesque (display), Hanken Grotesk (UI),
// JetBrains Mono (course codes + numerics).
const fontDisplay = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const fontUi = Hanken_Grotesk({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

const fontMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SOEN Compass",
    template: "%s — SOEN Compass",
  },
  description: "AI-powered degree planner for Concordia BEng Software Engineering students.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  icons: {
    icon: [
      { url: "/brand/favicon.svg", media: "(prefers-color-scheme: light)" },
      { url: "/brand/favicon-dark.svg", media: "(prefers-color-scheme: dark)" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html
      lang="en"
      className={`${fontDisplay.variable} ${fontUi.variable} ${fontMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the persisted accent before first paint (no color flash). */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: tiny static no-flash bootstrap */}
        <script dangerouslySetInnerHTML={{ __html: ACCENT_NO_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="compass-theme"
        >
          <AnalyticsProvider>
            <TooltipProvider delay={200}>{children}</TooltipProvider>
          </AnalyticsProvider>
          <CookieBanner />
          <Toaster richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
