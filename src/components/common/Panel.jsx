/**
 * A titled section container. `Panel.Header` is optional — a panel with no
 * title is just the surface.
 */
export default function Panel({ title, description, icon: Icon, actions, children, className = "", bodyClassName = "" }) {
  const hasHeader = title || actions;

  return (
    <section className={`panel ${className}`}>
      {hasHeader && (
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon && <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            <div className="min-w-0">
              {title && <h2 className="font-display text-sm font-semibold">{title}</h2>}
              {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}

      <div className={`p-5 sm:p-6 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
