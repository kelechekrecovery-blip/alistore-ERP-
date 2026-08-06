import { I18nService } from 'nestjs-i18n';
export declare class I18nDemoController {
    private readonly i18n;
    constructor(i18n: I18nService);
    greeting(lang?: string): {
        lang: string;
        message: string;
    };
}
