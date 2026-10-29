import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Med-RAG · Medical report analyser",
  description:
    "Ask questions about your medical report. Answers come only from the pages you upload.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body
        className="min-h-[100dvh] bg-(--background) text-(--foreground) antialiased"
        suppressHydrationWarning
      >
        <main className="flex h-[100dvh] w-full flex-col p-2 sm:p-3">
          <div className="content-glow flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-(--border) bg-(--background-secondary)">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
