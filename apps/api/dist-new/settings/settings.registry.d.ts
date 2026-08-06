export type SettingGroup = 'discounts' | 'payroll' | 'warranty' | 'tradein' | 'loyalty' | 'credit' | 'legal';
export interface SettingDefinition {
    key: string;
    label: string;
    group: SettingGroup;
    kind: 'int' | 'percent' | 'bps' | 'url' | 'text';
    fallback: number | string;
    min: number;
    max: number;
    unit: string;
    hint: string;
    source: string;
}
export declare function isTextSetting(definition: SettingDefinition): boolean;
export declare const SETTINGS: readonly SettingDefinition[];
export declare function settingDefinition(key: string): SettingDefinition;
export declare function parseSettingText(definition: SettingDefinition, raw: string): string;
export declare function parseSettingValue(definition: SettingDefinition, raw: string): number;
