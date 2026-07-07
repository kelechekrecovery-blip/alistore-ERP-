import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CourierService } from './courier.service';
import { CreateRunDto, FailDeliveryDto, HandoverDto } from './courier.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';

@ApiTags('courier')
@ApiBearerAuth()
@Controller('courier')
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
export class CourierController {
  constructor(private readonly courier: CourierService) {}

  @ApiOperation({ summary: 'Get a courier run' })
  @ApiParam({ name: 'id', description: 'Courier run id' })
  @ApiOkResponse({ description: 'Run found.' })
  @ApiNotFoundResponse({ description: 'Run does not exist.' })
  @Get('runs/:id')
  @RequirePermission('courier', 'read')
  async getRun(@Param('id') id: string) {
    const run = await this.courier.getRun(id);
    if (!run) throw new NotFoundException(`Курьерский рейс ${id} не найден`);
    return run;
  }

  @ApiOperation({ summary: 'Assign a courier run with its COD total (delivery.assigned)' })
  @ApiCreatedResponse({ description: 'Run created.' })
  @Post('runs')
  @RequirePermission('courier', 'assign')
  createRun(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateRunDto) {
    return this.courier.createRun(dto, user.customerId);
  }

  @ApiOperation({
    summary: 'Courier hands over collected COD with reconciliation (cash.handover)',
  })
  @ApiOkResponse({ description: 'COD reconciled; run marked handed over.' })
  @ApiConflictResponse({ description: 'COD already handed over.' })
  @ApiUnprocessableEntityResponse({
    description: 'Unknown run, or a discrepancy with no reason (invariant #4).',
  })
  @Post('handover')
  @RequirePermission('courier', 'handover')
  handover(@CurrentUser() user: AuthPrincipal, @Body() dto: HandoverDto) {
    return this.courier.handover(dto, user.customerId);
  }
}
