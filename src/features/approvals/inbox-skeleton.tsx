/** Loading shape of the three-pane inbox (design.md §3: skeletons, never spinners on lists). */
export function InboxSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading messages">
      <div className="skeleton h-11 w-80" />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)] xl:h-[calc(100dvh-220px)] xl:min-h-[560px]">
        <div className="card flex flex-col gap-4 p-3.5">
          <div className="skeleton h-11 rounded-xl" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 px-1">
              <div className="skeleton size-9 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="skeleton h-4 w-1/2" />
                <div className="skeleton h-4 w-5/6" />
              </div>
            </div>
          ))}
        </div>
        <div className="card hidden min-h-[560px] lg:block" />
      </div>
    </div>
  );
}
