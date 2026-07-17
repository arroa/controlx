import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
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

export const metadata: Metadata = {
  title: "ControlX | Centro de comando",
  description:
    "Orquestación, ejecución y gobierno de eventos operativos críticos.",
  applicationName: "ControlX",
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
        {bypass ? (
          content
        ) : (
          <ClerkProvider appearance={{ theme: shadcn }}>{content}</ClerkProvider>
        )}
      </body>
    </html>
  );
}
