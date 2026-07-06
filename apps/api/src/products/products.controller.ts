import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ChangePriceDto, DeleteProductDto } from './products.dto';

const SYSTEM_ACTOR = 'system';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @ApiOperation({ summary: 'Get a product' })
  @ApiNotFoundResponse({ description: 'Product does not exist.' })
  @Get(':id')
  async get(@Param('id') id: string) {
    const product = await this.products.get(id);
    if (!product) throw new NotFoundException(`Товар ${id} не найден`);
    return product;
  }

  @ApiOperation({
    summary: 'Change price — applies within ±15%, else parks approval ({ approvalId })',
  })
  @ApiParam({ name: 'id', description: 'Product id' })
  @ApiOkResponse({ description: 'Applied, or parked for approval (see body).' })
  @Patch(':id/price')
  changePrice(@Param('id') id: string, @Body() dto: ChangePriceDto) {
    return this.products.changePrice(id, dto.price, dto.reason, dto.requester ?? SYSTEM_ACTOR);
  }

  @ApiOperation({ summary: 'Delete a product — always approval-gated → soft-delete (202)' })
  @ApiParam({ name: 'id', description: 'Product id' })
  @ApiAcceptedResponse({ description: 'Delete parked for approval; not yet archived.' })
  @Delete(':id')
  @HttpCode(202)
  remove(@Param('id') id: string, @Body() dto: DeleteProductDto) {
    return this.products.archive(id, dto.reason, dto.requester ?? SYSTEM_ACTOR);
  }
}
