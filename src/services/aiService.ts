export class AiService {
    /**
     * Generates a 1-sentence fundamental takeaway based on a data snapshot.
     */
    async generateInvestmentVerdict(dataSnapshot: any): Promise<string | null> {
        // English output — the site is EN-language; Slovak verdicts leaked into
        // the page UI, FAQ section and FAQPage JSON-LD (mixed-language SEO issue).
        // Descriptive, not advisory: interpret the data (incl. valuation vs the
        // company's own historical range) but never issue buy/sell conclusions.
        const prompt = `You are an experienced financial analyst. Based on the provided data, write ONE concise sentence in English summarizing the company's fundamental profile — its profitability, growth, financial health, and how the current valuation compares to its own historical range. Interpret the data, but do NOT give investment advice: no "attractive investment", "buy", "sell", "undervalued", or similar recommendation phrasing. Example tone: "Strong profitability and a healthy balance sheet, while the valuation trades above its historical range." Avoid clichés, be factual.\n\nDATA:\n${JSON.stringify(dataSnapshot, null, 2)}`;

        return this.callLLM(prompt);
    }

    /**
     * Call LLM (Gemini preferred, OpenAI fallback)
     */
    private async callLLM(prompt: string): Promise<string | null> {
        const geminiKey = process.env.GEMINI_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;

        if (geminiKey) {
            return this.callGemini(prompt, geminiKey);
        } else if (openaiKey) {
            return this.callOpenAI(prompt, openaiKey);
        }

        console.warn('⚠️ AiService: No LLM API key configured');
        return null;
    }

    private async callGemini(prompt: string, apiKey: string): Promise<string | null> {
        try {
            const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.15 }
                })
            });

            if (!response.ok) throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
            const data = await response.json();
            const usage = data.usageMetadata;
            if (usage) {
                // gemini-2.5-flash: $0.30/M input, $2.50/M output (incl. thinking)
                const cost = (usage.promptTokenCount * 0.30 + (usage.candidatesTokenCount + (usage.thoughtsTokenCount || 0)) * 2.50) / 1e6;
                console.log(`💰 AiService: Gemini usage in=${usage.promptTokenCount} out=${usage.candidatesTokenCount} think=${usage.thoughtsTokenCount || 0} est=$${cost.toFixed(5)}`);
            }
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            return text ? text.trim() : null;
        } catch (error) {
            console.error('AiService: Gemini error:', error);
            return null;
        }
    }

    private async callOpenAI(prompt: string, apiKey: string): Promise<string | null> {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert financial analyst.'
                        },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.15,
                })
            });

            if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
            const data = await response.json();
            const text = data.choices?.[0]?.message?.content;
            return text ? text.trim() : null;
        } catch (error) {
            console.error('AiService: OpenAI error:', error);
            return null;
        }
    }
}

export const aiService = new AiService();
