import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ReturnsService } from './returns.service';
import { CreateReturnDto, ReturnStatusDto } from './returns.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';

@ApiTags('returns')
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @ApiOperation({ summary: 'List returns by status' })
  @ApiOkResponse({ description: 'Returns, newest first.' })
  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('returns', 'read')
  list(@Query('status') status?: string) {
    return this.returns.list(status);
  }

  @ApiOperation({ summary: 'Get a return' })
  @ApiNotFoundResponse({ description: 'Return does not exist.' })
  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('returns', 'read')
  async get(@Param('id') id: string) {
    const ret = await this.returns.get(id);
    if (!ret) throw new NotFoundException(`Возврат ${id} не найден`);
    return ret;
  }

  @ApiOperation({ summary: 'Open a return request (return.requested)' })
  @ApiCreatedResponse({ description: 'Return created.' })
  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateReturnDto) {
    if (user.typ !== 'customer') {
      throw new ForbiddenException('Требуется customer JWT');
    }
    return this.returns.request(dto.orderId, dto.reason, user.customerId, user.customerId);
  }

  @ApiOperation({ summary: 'Advance a return through its status machine' })
  @ApiOkResponse({ description: 'Return status updated.' })
  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('returns', 'transition')
  transition(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: ReturnStatusDto) {
    return this.returns.transition(id, dto.status, user.customerId);
  }
}
