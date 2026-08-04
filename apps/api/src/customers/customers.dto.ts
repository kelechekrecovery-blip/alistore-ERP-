import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertCustomerDto {
  @ApiProperty({ example: '+996700123456', description: 'Phone in E.164 (KG)' })
  @IsString()
  @Matches(/^\+?[0-9]{9,15}$/, { message: 'phone must be 9–15 digits, optional +' })
  phone!: string;

  @ApiPropertyOptional({ example: 'Айбек' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class SetConsentDto {
  @ApiProperty({ example: true, description: 'Marketing consent — false stops all campaigns' })
  @IsBoolean()
  consent!: boolean;

  @ApiPropertyOptional({ example: 'customer', description: 'Who toggled it (customer/agent)' })
  @IsOptional()
  @IsString()
  actor?: string;
}

export class CreateCustomerAddressDto {
  @IsString() @MaxLength(40) title!: string;
  @IsString() @MaxLength(240) text!: string;
  @IsOptional() @IsString() @MaxLength(200) comment?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class UpdateCustomerAddressDto {
  @IsOptional() @IsString() @MaxLength(40) title?: string;
  @IsOptional() @IsString() @MaxLength(240) text?: string;
  @IsOptional() @IsString() @MaxLength(200) comment?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class UpdateCustomerSettingsDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() consent?: boolean;
  @IsOptional() @IsBoolean() push?: boolean;
  @IsOptional() @IsBoolean() whatsapp?: boolean;
  @IsOptional() @IsBoolean() service?: boolean;
  @IsOptional() @IsBoolean() promos?: boolean;
}
