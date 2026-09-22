'use client';

import { useState } from 'react';

interface ShareButtonsProps {
  url: string;
  title: string;
  description?: string | undefined;
}

export default function ShareButtons({ url, title, description }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = encodeURIComponent(url);
  const shareTitle = encodeURIComponent(title);
  const shareDesc = encodeURIComponent(description || title);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-2" aria-label="Share this page">
      <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Share:</span>

      {/* X (Twitter) */}
      <a
        href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareTitle}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on X (Twitter)"
        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>

      {/* Bluesky */}
      <a
        href={`https://bsky.app/intent/compose?text=${shareTitle}%20${shareUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on Bluesky"
        className="p-1.5 rounded-lg text-gray-500 hover:text-sky-500 dark:text-gray-400 dark:hover:text-sky-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 11.388c-.907-1.761-3.372-5.044-5.665-6.662-2.197-1.55-3.034-1.283-3.647-1.036C2.054 3.921 2 4.931 2 5.391v.252c.008 1.057.324 4.097.9 5.275.577.929 2.631 2.34 3.679 2.571-2.63.447-5.507 1.334-6.579 4.678 1.923-2.03 4.118-3.131 6.23-3.447 4.51-.675 6.769 2.082 6.769 2.082s2.259-2.757 6.769-2.082c2.112.316 4.307 1.417 6.23 3.447-1.072-3.344-3.949-4.231-6.579-4.678 1.048-.231 3.102-1.642 3.679-2.571.576-1.178.892-4.218.9-5.275v-.252c0-.46-.054-1.47-.688-1.7-.613-.247-1.45-.514-3.647 1.036C17.372 6.344 12.907 9.627 12 11.388z" />
        </svg>
      </a>

      {/* LinkedIn */}
      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on LinkedIn"
        className="p-1.5 rounded-lg text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
        </svg>
      </a>

      {/* Copy link */}
      <button
        onClick={handleCopy}
        aria-label={copied ? 'Link copied!' : 'Copy link'}
        className={`p-1.5 rounded-lg transition-colors ${
          copied
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
      >
        {copied ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        )}
      </button>
    </div>
  );
}
