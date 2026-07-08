import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiAcceptedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import {
  ChangePriceDto,
  CreateProductDto,
  CreateProductReviewDto,
  DeleteProductDto,
  ProductListQueryDto,
  UpdateProductDto,
} from './products.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @ApiOperation({ summary: 'List products for staff management' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('products', 'read')
  @Get()
  list(@Query() query: ProductListQueryDto) {
    return this.products.list(query);
  }

  @ApiOperation({ summary: 'Create a product for the catalog' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('products', 'create')
  @Post()
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateProductDto) {
    return this.products.create(dto, user.customerId);
  }

  @ApiOperation({ summary: 'Get a product' })
  @ApiNotFoundResponse({ description: 'Product does not exist.' })
  @Get(':id')
  async get(@Param('id') id: string) {
    const product = await this.products.get(id);
    if (!product) throw new NotFoundException(`Товар ${id} не найден`);
    return product;
  }

  @ApiOperation({ summary: 'List product reviews and summary rating' })
  @ApiParam({ name: 'id', description: 'Product id' })
  @ApiOkResponse({ description: '{ productId, sku, count, avgRating, items[] }.' })
  @Get(':id/reviews')
  reviews(@Param('id') id: string) {
    return this.products.reviews(id);
  }

  @ApiOperation({ summary: 'Create a customer review for a purchased product' })
  @ApiParam({ name: 'id', description: 'Product id' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':id/reviews')
  createReview(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: CreateProductReviewDto) {
    return this.products.createReview(id, user, dto);
  }

  @ApiOperation({ summary: 'Update non-dangerous product fields (price uses /price)' })
  @ApiParam({ name: 'id', description: 'Product id' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('products', 'update')
  @Patch(':id')
  update(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto, user.customerId);
  }

  @ApiOperation({
    summary: 'Change price — applies within ±15%, else parks approval ({ approvalId })',
  })
  @ApiParam({ name: 'id', description: 'Product id' })
  @ApiOkResponse({ description: 'Applied, or parked for approval (see body).' })
  @Patch(':id/price')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('products', 'price')
  changePrice(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: ChangePriceDto) {
    return this.products.changePrice(id, dto.price, dto.reason, user.customerId);
  }

  @ApiOperation({ summary: 'Delete a product — always approval-gated → soft-delete (202)' })
  @ApiParam({ name: 'id', description: 'Product id' })
  @ApiAcceptedResponse({ description: 'Delete parked for approval; not yet archived.' })
  @Delete(':id')
  @HttpCode(202)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('products', 'archive')
  remove(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: DeleteProductDto) {
    return this.products.archive(id, dto.reason, user.customerId);
  }
}
