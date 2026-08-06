export type ReadinessStatus = 'ready' | 'missing' | 'manual_required' | 'optional';
export interface ExternalReadinessCheck {
    id: string;
    area: string;
    title: string;
    status: ReadinessStatus;
    blocking: boolean;
    requiredEnv: string[];
    optionalEnv: string[];
    configuredEnv: string[];
    missingEnv: string[];
    manualChecks: string[];
    note: string;
}
export interface ExternalReadinessReport {
    status: 'ready' | 'blocked';
    generatedAt: string;
    summary: {
        ready: number;
        missing: number;
        manualRequired: number;
        optional: number;
        blockingRemaining: number;
    };
    checks: ExternalReadinessCheck[];
    nextActions: string[];
}
type EnvReader = (name: string) => string | undefined;
export declare function buildExternalReadinessReport(env: EnvReader, now?: Date): ExternalReadinessReport;
export {};
