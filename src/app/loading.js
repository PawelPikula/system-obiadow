export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-500" />
        <p className="text-slate-500 text-sm font-medium">Ładowanie…</p>
      </div>
    </div>
  );
}
