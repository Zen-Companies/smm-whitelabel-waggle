/** Loading shape of the three-pane inbox (design.md §3: skeletons, never spinners on lists). */
export function InboxSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading messages">
      <div className="skeleton h-11 w-80" />
      <div className="grid gap-5 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)] xl:grid-cols-[minmax(240px,320px)_minmax(0,1fr)_minmax(240px,300px)]">
        <div className="flex flex-col gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 px-3">
              <div className="skeleton size-9 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="skeleton h-4 w-1/2" />
                <div className="skeleton h-4 w-5/6" />
              </div>
            </div>
          ))}
        </div>
        <div className="skeleton hidden h-[560px] rounded-xl lg:block" />
        <div className="skeleton hidden h-64 rounded-xl xl:block" />
      </div>
    </div>
  );
}
