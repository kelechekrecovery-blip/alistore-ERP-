import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogDeltaQueryDto, CatalogDeltaResponseDto, CatalogProductDto, CatalogReindexResponseDto, CatalogSearchQueryDto, CatalogSearchResponseDto } from './catalog.dto';
export declare class CatalogService {
    private readonly prisma;
    private readonly config;
    private readonly settings?;
    private meiliClientPromise?;
    constructor(prisma: PrismaService, config: ConfigService, settings?: SettingsService | undefined);
    search(query: CatalogSearchQueryDto): Promise<CatalogSearchResponseDto>;
    delta(query: CatalogDeltaQueryDto): Promise<CatalogDeltaResponseDto>;
    categories(): Promise<Array<{
        category: string;
        count: number;
    }>>;
    product(id: string): Promise<{
        product: CatalogProductDto;
        variants: CatalogProductDto[];
        related: CatalogProductDto[];
    }>;
    curated(ids: string[]): Promise<CatalogProductDto[]>;
    reindex(maintenanceToken?: string): Promise<CatalogReindexResponseDto>;
    private searchMeili;
    private searchPostgres;
    private sourceOfTruthWhere;
    private normalizeQuery;
    private toCatalogProduct;
    private installmentQrs;
    private installmentPlans;
    private enrichOffers;
    private enrichSellers;
    private enrichReviews;
    private orderBy;
    private compareProducts;
    private stockCountInclude;
    private directAvailability;
    private requireMeiliClient;
    private assertMaintenanceToken;
    private meiliHost;
    private indexName;
    private quoteMeiliFilterValue;
}
