export type ProductionPreflightStatus = 'ready' | 'missing' | 'unsafe';
export interface ProductionPreflightCheck {
    id: string;
    area: string;
    title: string;
    status: ProductionPreflightStatus;
    blocking: boolean;
    requiredEnv: string[];
    configuredEnv: string[];
    missingEnv: string[];
    note: string;
}
export interface ProductionPreflightReport {
    status: 'ready' | 'blocked';
    generatedAt: string;
    summary: {
        ready: number;
        missing: number;
        unsafe: number;
        blockingRemaining: number;
    };
    checks: ProductionPreflightCheck[];
    nextActions: string[];
}
type EnvReader = (name: string) => string | undefined;
export declare function buildProductionPreflightReport(env: EnvReader, now?: Date): ProductionPreflightReport;
export declare function assertProductionRuntimeReady(env: EnvReader): void;
export {};
