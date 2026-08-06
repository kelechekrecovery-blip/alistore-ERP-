import { CatalogDeltaQueryDto, CatalogDeltaResponseDto, CatalogReindexResponseDto, CatalogSearchQueryDto, CatalogSearchResponseDto } from './catalog.dto';
import { CatalogService } from './catalog.service';
export declare class CatalogController {
    private readonly catalog;
    constructor(catalog: CatalogService);
    search(query: CatalogSearchQueryDto): Promise<CatalogSearchResponseDto>;
    delta(query: CatalogDeltaQueryDto): Promise<CatalogDeltaResponseDto>;
    categories(): Promise<{
        category: string;
        count: number;
    }[]>;
    product(id: string): Promise<{
        product: import("./catalog.dto").CatalogProductDto;
        variants: import("./catalog.dto").CatalogProductDto[];
        related: import("./catalog.dto").CatalogProductDto[];
    }>;
    reindex(maintenanceToken?: string): Promise<CatalogReindexResponseDto>;
}
