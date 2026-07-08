import { Controller, Get, Headers, Post, Query } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  CatalogDeltaQueryDto,
  CatalogDeltaResponseDto,
  CatalogReindexResponseDto,
  CatalogSearchQueryDto,
  CatalogSearchResponseDto,
} from './catalog.dto';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @ApiOperation({
    summary: 'Search storefront catalog with optional Meilisearch acceleration',
    description:
      'Postgres remains source of truth. If Meilisearch is configured but unavailable, this endpoint falls back to Postgres.',
  })
  @ApiOkResponse({ type: CatalogSearchResponseDto })
  @Get('products')
  search(@Query() query: CatalogSearchQueryDto) {
    return this.catalog.search(query);
  }

  @ApiOperation({
    summary: 'Delta-sync storefront/POS catalog changes since a previous cursor',
    description:
      'Returns changed active products and removed archived products. Stock-count changes are included via DeviceUnit.updatedAt.',
  })
  @ApiOkResponse({ type: CatalogDeltaResponseDto })
  @Get('products/delta')
  delta(@Query() query: CatalogDeltaQueryDto) {
    return this.catalog.delta(query);
  }

  @ApiOperation({
    summary: 'Rebuild the Meilisearch products index',
    description:
      'Disabled until SEARCH_ADMIN_TOKEN is configured; pass it as x-maintenance-token.',
  })
  @ApiOkResponse({ type: CatalogReindexResponseDto })
  @ApiForbiddenResponse({ description: 'Missing or invalid maintenance token.' })
  @ApiUnprocessableEntityResponse({ description: 'Meilisearch is not configured.' })
  @Post('search/reindex')
  reindex(@Headers('x-maintenance-token') maintenanceToken?: string) {
    return this.catalog.reindex(maintenanceToken);
  }
}
