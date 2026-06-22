// Kiosk layout — no sidebar, no header, forced dark fullscreen.
// Root app/layout.tsx already provides ThemeProvider + AuthProvider.

export default function CultivationDisplayLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="dark min-h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden">
      {children}
    </div>
  )
}
