import { SettingsService } from './settings.service';
import { SetSettingDto } from './settings.dto';
import type { AuthPrincipal } from '../auth/jwt.strategy';
export declare class SettingsController {
    private readonly settings;
    constructor(settings: SettingsService);
    list(): Promise<import("./settings.service").SettingView[]>;
    set(user: AuthPrincipal, key: string, dto: SetSettingDto): Promise<import("./settings.service").SettingView>;
}
