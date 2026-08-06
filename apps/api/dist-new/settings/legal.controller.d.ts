import { SettingsService } from './settings.service';
export declare class LegalController {
    private readonly settings;
    constructor(settings: SettingsService);
    offer(): Promise<{
        text: string;
        published: boolean;
    }>;
}
