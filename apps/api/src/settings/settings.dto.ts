import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SetSettingDto {
  /** Sent as text so one endpoint serves numbers, flags and strings alike. */
  @IsString() @IsNotEmpty() @MaxLength(120) value!: string;
}
