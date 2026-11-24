"use client";

/** The list's filters: a plain GET form that applies as soon as a choice changes. */
export function FilterForm({ children }: { children: React.ReactNode }) {
  return (
    <form
      role="search"
      action="/admin/customers"
      className="flex flex-wrap items-end gap-x-3 gap-y-3"
      onChange={(e) => {
        if (e.target instanceof HTMLSelectElement) e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
