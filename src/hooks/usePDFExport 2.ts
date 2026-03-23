import { useState } from 'react';

export function usePDFExport(elementId: string, filenamePrefix: string) {
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const exportToPDF = async (ticker: string) => {
        setIsExporting(true);
        setError(null);

        // Allow React to re-render without the UI elements if needed, 
        // and let animations settle
        await new Promise((resolve) => setTimeout(resolve, 200));

        try {
            const jsPDF = (await import('jspdf')).default;
            const html2canvas = (await import('html2canvas')).default;

            const element = document.getElementById(elementId);
            if (!element) return;

            const originalBg = element.style.backgroundColor;
            // Force white background for the PDF capture
            element.style.backgroundColor = '#ffffff';

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                onclone: (document) => {
                    document.documentElement.classList.remove('dark'); // Force light theme in clone
                    const el = document.getElementById(elementId);
                    if (el) {
                        el.classList.remove('dark:bg-gray-900', 'bg-transparent');
                        el.classList.add('bg-white');
                        // Fix text colors for PDF readability
                        const textElements = el.querySelectorAll('*');
                        textElements.forEach((node) => {
                            if (node instanceof HTMLElement) {
                                if (node.classList.contains('text-white') || node.classList.contains('dark:text-white')) {
                                    node.style.color = '#111827'; // gray-900
                                }
                                node.classList.remove('dark:text-white', 'dark:text-gray-300', 'dark:text-gray-400', 'dark:text-gray-200');
                            }
                        });
                    }
                }
            });

            element.style.backgroundColor = originalBg;

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            let position = 0;
            const pageHeight = pdf.internal.pageSize.getHeight();

            // Header for PDF
            pdf.setFontSize(16);
            pdf.setTextColor(0, 0, 0);
            pdf.text('PreMarketPrice Analysis', 15, 15);

            pdf.setFontSize(10);
            pdf.setTextColor(100, 100, 100);
            pdf.text(`Ticker: ${ticker} | Generated: ${new Date().toLocaleString()}`, 15, 22);

            pdf.addImage(imgData, 'PNG', 0, 30, pdfWidth, pdfHeight);

            // Handle multi-page if content is too long
            let heightLeft = pdfHeight - (pageHeight - 30);
            while (heightLeft > 0) {
                position = heightLeft - pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
                heightLeft -= pageHeight;
            }

            pdf.save(`${filenamePrefix}_${ticker}_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (err) {
            console.error('Error generating PDF', err);
            setError('Failed to generate PDF report.');
        } finally {
            setIsExporting(false);
        }
    };

    return { isExporting, exportToPDF, error };
}
