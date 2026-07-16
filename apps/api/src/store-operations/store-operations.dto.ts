import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

const CHECKLIST_TYPES = ['opening', 'closing'] as const;
const INCIDENT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

export class StoreOperationsQueryDto {
  @ApiPropertyOptional({ example: 'BISHKEK-1' })
  @IsOptional() @IsString() @MaxLength(80)
  point?: string;

  @ApiPropertyOptional({ example: '2026-07-17' })
  @IsOptional() @IsISO8601({ strict: true })
  date?: string;

  @ApiPropertyOptional({ enum: ['open', 'investigating', 'resolved'] })
  @IsOptional() @IsIn(['open', 'investigating', 'resolved'])
  status?: 'open' | 'investigating' | 'resolved';
}

export class CreateStoreChecklistDto {
  @ApiProperty({ example: 'BISHKEK-1' })
  @IsString() @MaxLength(80)
  point!: string;

  @ApiProperty({ enum: CHECKLIST_TYPES })
  @IsIn(CHECKLIST_TYPES)
  type!: (typeof CHECKLIST_TYPES)[number];

  @ApiProperty({ example: '2026-07-17' })
  @IsISO8601({ strict: true })
  businessDate!: string;
}

export class UpdateChecklistItemDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  checked!: boolean;

  @ApiPropertyOptional({ example: 'Терминал прошёл утренний тест' })
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class CreateStoreIncidentDto {
  @ApiProperty({ example: 'BISHKEK-1' })
  @IsString() @MaxLength(80)
  point!: string;

  @ApiProperty({ example: '2026-07-17' })
  @IsISO8601({ strict: true })
  businessDate!: string;

  @ApiProperty({ example: 'cash' })
  @IsString() @MaxLength(80)
  category!: string;

  @ApiProperty({ enum: INCIDENT_SEVERITIES })
  @IsIn(INCIDENT_SEVERITIES)
  severity!: (typeof INCIDENT_SEVERITIES)[number];

  @ApiProperty({ example: 'Не работает терминал на кассе 2' })
  @IsString() @MaxLength(160)
  title!: string;

  @ApiProperty({ example: 'Платёжный терминал не выходит в сеть после перезапуска.' })
  @IsString() @MaxLength(2000)
  description!: string;
}

export class ResolveStoreIncidentDto {
  @ApiProperty({ example: 'Терминал заменён, повторный тест успешен.' })
  @IsString() @MaxLength(2000)
  resolution!: string;
}
