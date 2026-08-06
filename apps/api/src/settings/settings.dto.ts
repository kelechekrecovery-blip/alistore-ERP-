import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Потолок длины здесь — предохранитель транспорта, а не бизнес-правило.
 *
 * Стояло 120 символов, когда все параметры были числами. С появлением
 * ссылочных (QR, до 512) и текстовых (оферта, до 40 000) это стало жёстким
 * блокиратором: реальный текст договора не проходил валидацию и получал 400
 * ещё до бизнес-проверки — то есть фичу, которую я выкатил, нельзя было
 * использовать вовсе. Настоящие границы живут в реестре, на каждый ключ свои,
 * и проверяются `parseSettingText`/`parseSettingValue`.
 */
const MAX_TRANSPORT_LENGTH = 40_000;

export class SetSettingDto {
  /** Sent as text so one endpoint serves numbers, flags and strings alike. */
  @IsString() @IsNotEmpty() @MaxLength(MAX_TRANSPORT_LENGTH) value!: string;
}
