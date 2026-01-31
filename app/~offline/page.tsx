export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-900 text-zinc-100">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">You&apos;re offline</h1>
        <p className="text-lg text-zinc-400">
          Please check your internet connection and try again.
        </p>
      </div>
    </div>
  );
}
