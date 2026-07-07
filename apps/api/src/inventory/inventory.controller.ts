import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CountDto, MovementDto, TransferDto } from './inventory.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { requireActiveStaff } from '../auth/staff-principal';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly staffAuth: StaffAuthService,
  ) {}

  @ApiOperation({
    summary: 'Stock write-off / adjustment — always approval-gated (202 { approvalId })',
  })
  @ApiAcceptedResponse({ description: 'Movement parked for approval; not yet applied.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown product.' })
  @Post('movements')
  @HttpCode(202)
  async movement(@CurrentUser() user: AuthPrincipal, @Body() dto: MovementDto) {
    return this.inventory.movement(dto, await requireActiveStaff(user, this.staffAuth));
  }

  @ApiOperation({ summary: 'Transfer an in_stock unit to another branch (stock.moved)' })
  @ApiCreatedResponse({ description: 'Unit moved; movement + ledger event written.' })
  @ApiConflictResponse({ description: 'Unit not in stock (sold/reserved).' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown unit or same location.' })
  @Post('transfer')
  async transfer(@CurrentUser() user: AuthPrincipal, @Body() dto: TransferDto) {
    return this.inventory.transfer(dto, await requireActiveStaff(user, this.staffAuth));
  }

  @ApiOperation({ summary: 'Take inventory for a product at a location (inventory.counted)' })
  @ApiCreatedResponse({ description: 'Count recorded with counted/expected/diff.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown product.' })
  @Post('count')
  async count(@CurrentUser() user: AuthPrincipal, @Body() dto: CountDto) {
    return this.inventory.count(dto, await requireActiveStaff(user, this.staffAuth));
  }
}
