import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { B2BQuoteStatus } from '@prisma/client';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import {
  CreateB2BQuoteDto,
  ListB2BQuotesQueryDto,
  UpdateB2BQuoteDto,
  UpsertBusinessProfileDto,
} from './b2b.dto';
import { B2BService } from './b2b.service';

@ApiTags('b2b')
@ApiBearerAuth()
@Controller('b2b')
export class B2BController {
  constructor(private readonly b2b: B2BService) {}

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Current customer business buyer profile' })
  profile(@CurrentUser() user: AuthPrincipal) {
    return this.b2b.profile(this.customerId(user));
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Business profile saved.' })
  upsertProfile(@CurrentUser() user: AuthPrincipal, @Body() dto: UpsertBusinessProfileDto) {
    return this.b2b.upsertProfile(this.customerId(user), dto);
  }

  @Get('quotes/mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthPrincipal) {
    return this.b2b.mine(this.customerId(user));
  }

  @Post('quotes')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiCreatedResponse({ description: 'Wholesale quote request created and ledgered.' })
  request(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateB2BQuoteDto) {
    return this.b2b.request(this.customerId(user), dto);
  }

  @Patch('quotes/:id/accept')
  @UseGuards(JwtAuthGuard)
  accept(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.b2b.accept(id, this.customerId(user));
  }

  @Get('quotes')
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('b2b', 'read')
  list(@Query() query: ListB2BQuotesQueryDto) {
    return this.b2b.list(query.status as B2BQuoteStatus | undefined);
  }

  @Patch('quotes/:id')
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('b2b', 'update')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateB2BQuoteDto,
  ) {
    return this.b2b.update(id, dto, user.customerId);
  }

  private customerId(user: AuthPrincipal) {
    if (user.typ !== 'customer') throw new ForbiddenException('Требуется customer JWT');
    return user.customerId;
  }
}
