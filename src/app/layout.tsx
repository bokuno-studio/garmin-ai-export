import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

const SITE_URL = "https://garmin-ai-export.vercel.app";
const SITE_NAME = "Garmin AI Export";
const SITE_DESCRIPTION =
  "ガーミン (Garmin Connect) の活動・睡眠・心拍データをZIPからCSVに変換し、ChatGPT / Gemini / Claude で AI 分析できるようにします。Convert Garmin Connect exports into AI-ready CSV files for ChatGPT, Gemini, and Claude.";
const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-F3C99MVMDY";
const SHOULD_LOAD_GOOGLE_ANALYTICS = process.env.NODE_ENV === "production";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "Garmin",
    "Garmin Connect",
    "ガーミン",
    "CSV converter",
    "AI analysis",
    "ChatGPT",
    "Gemini",
    "Claude",
    "activity data",
    "sleep data",
    "health data",
  ],
  alternates: {
    canonical: SITE_URL,
  },
  manifest: "/manifest.json",
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Garmin AI Export converts Garmin Connect ZIP exports into AI-ready CSV files.",
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
};

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  url: SITE_URL,
  applicationCategory: "UtilityApplication",
  operatingSystem: "Any",
  description: SITE_DESCRIPTION,
  offers: {
    "@type": "Offer",
    price: "300",
    priceCurrency: "JPY",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f8fb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <script
          id="software-application-json-ld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(softwareApplicationJsonLd),
          }}
        />
        {children}
        {SHOULD_LOAD_GOOGLE_ANALYTICS ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        ) : null}
      </body>
    </html>
  );
}
