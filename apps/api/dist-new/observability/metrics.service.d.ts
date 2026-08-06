export declare class MetricsService {
    private readonly startedAt;
    private readonly requests;
    recordRequest(method: string, route: string, statusCode: number, durationMs: number): void;
    snapshot(): {
        startedAt: string;
        uptimeSeconds: number;
        requestsTotal: number;
        errors5xxTotal: number;
    };
    renderPrometheus(): string;
    private normalizeRoute;
    private escapeLabel;
}
