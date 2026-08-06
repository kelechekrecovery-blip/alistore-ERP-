import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { Valuation } from './valuation';
import { AssessDto } from './valuation.dto';
export declare class ValuationService {
    private readonly prisma;
    private readonly settings;
    constructor(prisma: PrismaService, settings: SettingsService);
    assess(dto: AssessDto): Promise<Valuation>;
}
