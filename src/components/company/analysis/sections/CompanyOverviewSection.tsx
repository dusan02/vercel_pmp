interface CompanyOverviewSectionProps {
  companyName: string;
  description: string | null | undefined;
  headquarters: string | null | undefined;
  employees: number | null | undefined;
  websiteUrl: string | null | undefined;
}

export function CompanyOverviewSection({
  companyName,
  description,
  headquarters,
  employees,
  websiteUrl,
}: CompanyOverviewSectionProps) {
  // Render when ANY field exists — previously a missing headquarters hid
  // employees and website even when they were present.
  if (!description && !headquarters && employees == null && !websiteUrl) return null;

  // Normalize scheme-less URLs (DB may store "www.example.com")
  const websiteHref = websiteUrl
    ? (websiteUrl.startsWith('http://') || websiteUrl.startsWith('https://') ? websiteUrl : `https://${websiteUrl}`)
    : null;

  const metaLine = (headquarters || employees != null || websiteHref) && (
    <p className={`${description ? 'mt-2' : 'mt-1'} text-xs text-gray-500 dark:text-gray-400`}>
      {headquarters && <>Headquarters: {headquarters}</>}
      {employees != null && <>{headquarters && ' · '}Employees: {employees.toLocaleString('en-US')}</>}
      {websiteHref && (
        <>
          {(headquarters || employees != null) && ' · '}
          <a
            href={websiteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Website ↗
          </a>
        </>
      )}
    </p>
  );

  // Compact strip: first sentence always visible, the rest + company facts
  // behind a native <details> toggle — content stays in SSR HTML for SEO
  // while the section no longer eats vertical space before the metrics.
  const firstSentence = description?.match(/^[^.!?]+[.!?]/)?.[0].trim() ?? null;
  const rest = firstSentence && description ? description.slice(firstSentence.length).trim() : (description ?? '');
  const expandable = !!rest || !!metaLine;

  return (
    <section className="mb-6 lg:mb-0" aria-label="Company overview">
      <details className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 px-4 py-3">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              About {companyName}
            </h2>
            {expandable && (
              <svg
                className="w-4 h-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </span>
          {description && (
            <span className="mt-1 block text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {firstSentence ?? description}
              {rest && <span className="text-blue-600 dark:text-blue-400 group-open:hidden"> Show more</span>}
            </span>
          )}
        </summary>
        {expandable && (
          <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            {rest && <p className="mt-1">{rest}</p>}
            {metaLine}
          </div>
        )}
      </details>
    </section>
  );
}
