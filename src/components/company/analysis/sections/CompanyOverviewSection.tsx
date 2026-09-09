interface CompanyOverviewSectionProps {
  description: string | null | undefined;
  headquarters: string | null | undefined;
  employees: number | null | undefined;
  websiteUrl: string | null | undefined;
}

export function CompanyOverviewSection({
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

  return (
    <section className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Company Overview</h2>
      {description && (
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{description}</p>
      )}
      {(headquarters || employees != null || websiteHref) && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {headquarters && <>Headquarters: {headquarters}</>}
          {employees != null && <>{headquarters && ' · '}Employees: {employees.toLocaleString('en-US')}</>}
          {websiteHref && (
            <>
              {' · '}
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
      )}
    </section>
  );
}
