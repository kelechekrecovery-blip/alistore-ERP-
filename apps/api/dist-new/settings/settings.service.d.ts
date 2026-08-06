import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { type SettingDefinition } from './settings.registry';
export interface SettingView extends SettingDefinition {
    corrupted?: boolean;
    value: number | string;
    overridden: boolean;
    updatedBy: string | null;
    updatedAt: string | null;
}
export declare class SettingsService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    value(key: string): Promise<number>;
    text(key: string): Promise<string>;
    values(keys: readonly string[]): Promise<Record<string, number>>;
    list(): Promise<SettingView[]>;
    set(key: string, rawValue: string, actor: string): Promise<SettingView>;
}
