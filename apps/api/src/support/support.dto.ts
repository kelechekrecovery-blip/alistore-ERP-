import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const CHANNELS = ['web', 'app', 'whatsapp', 'telegram', 'call', 'store'] as const;
const TRANSITION_TARGETS = ['in_progress', 'waiting', 'resolved', 'closed'] as const;

export class OpenTicketDto {
  @ApiProperty({ example: 'clx_customer_001' })
  @IsString() customerId!: string;

  @ApiProperty({ enum: CHANNELS, example: 'whatsapp' })
  @IsIn(CHANNELS as unknown as string[]) channel!: (typeof CHANNELS)[number];

  @ApiProperty({ example: 'Не приходит чек на почту' })
  @IsString() subject!: string;

  @ApiPropertyOptional({ example: 'Оплатил заказ, чек не пришёл' })
  @IsOptional() @IsString() body?: string;

  @ApiPropertyOptional({ enum: ['normal', 'high', 'urgent'], example: 'normal' })
  @IsOptional() @IsIn(['normal', 'high', 'urgent']) priority?: string;

  @ApiPropertyOptional({ example: 'support_agent_1' })
  @IsOptional() @IsString() actor?: string;
}

export class OpenMineTicketDto {
  @ApiProperty({ example: 'app' })
  @IsIn(CHANNELS as unknown as string[]) channel!: (typeof CHANNELS)[number];

  @ApiProperty({ example: 'Не приходит чек на почту' })
  @IsString() subject!: string;

  @ApiPropertyOptional({ example: 'Оплатил заказ, чек не пришёл' })
  @IsOptional() @IsString() body?: string;

  @ApiPropertyOptional({ enum: ['normal', 'high', 'urgent'], example: 'normal' })
  @IsOptional() @IsIn(['normal', 'high', 'urgent']) priority?: string;
}

export class TicketTransitionDto {
  @ApiProperty({ enum: TRANSITION_TARGETS, example: 'in_progress' })
  @IsIn(TRANSITION_TARGETS as unknown as string[]) to!: (typeof TRANSITION_TARGETS)[number];

  @ApiPropertyOptional({ example: 'support_agent_1' })
  @IsOptional() @IsString() assignee?: string;

  @ApiPropertyOptional({ example: 'support_agent_1' })
  @IsOptional() @IsString() actor?: string;
}

export class EscalateTicketDto {
  @ApiPropertyOptional({ example: 'support_lead' })
  @IsOptional() @IsString() actor?: string;
}
