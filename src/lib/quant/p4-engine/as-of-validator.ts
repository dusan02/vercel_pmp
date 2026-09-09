export class AsOfValidator {
    public static verifyGraph(targetTime: string, decisionGraph: any, path: string = "root"): string | null {
        if (decisionGraph === null || typeof decisionGraph !== 'object') {
            if (typeof decisionGraph === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(decisionGraph)) {
                // We found a timestamp. It MUST NOT be greater than targetTime
                if (decisionGraph > targetTime) {
                    return `[${path}] Timestamp ${decisionGraph} is > ${targetTime}`;
                }
            }
            return null;
        }

        // Special handling for objects that explicitly declare knownAt/eventTime
        if (decisionGraph.knownAt && decisionGraph.knownAt > targetTime) {
            return `[${path}.knownAt] Value ${decisionGraph.knownAt} > ${targetTime}`;
        }
        
        for (const key of Object.keys(decisionGraph)) {
            const violation = this.verifyGraph(targetTime, decisionGraph[key], `${path}.${key}`);
            if (violation) return violation;
        }

        return null;
    }
}
