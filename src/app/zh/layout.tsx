import SetHtmlLang from './SetHtmlLang';

// Zh subtree layout — the root layout hardcodes <html lang="en"> and nested
// layouts can't re-render the html tag, so correct the lang attribute
// client-side for Googlebot's post-render DOM and assistive tech.
export default function ZhLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SetHtmlLang lang="zh-CN" />
      {children}
    </>
  );
}
