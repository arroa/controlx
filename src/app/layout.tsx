import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { PwaRegister } from "@/components/pwa-register";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isDevBypassEnabled } from "@/lib/dev-flags";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#11131a",
  // Android Chrome: el layout se achica con el teclado (dialogs no quedan tapados).
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "ControlX | Centro de comando",
  description:
    "Orquestación, ejecución y gobierno de eventos operativos críticos.",
  applicationName: "ControlX",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ControlX",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const content = <TooltipProvider>{children}</TooltipProvider>;
  const bypass = isDevBypassEnabled();

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full`}
    >
      <body className="min-h-full bg-background text-foreground antialiased">
        <PwaRegister />
        {bypass ? (
          content
        ) : (
          <ClerkProvider appearance={{ theme: shadcn }}>{content}</ClerkProvider>
        )}
      </body>
    </html>
  );
}
