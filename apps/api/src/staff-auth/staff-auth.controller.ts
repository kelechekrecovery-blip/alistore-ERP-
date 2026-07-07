import { Body, Controller, Post } from '@nestjs/common';
import { StaffAuthService } from './staff-auth.service';
import { StaffLoginDto } from './staff-auth.dto';

@Controller('staff-auth')
export class StaffAuthController {
  constructor(private readonly staffAuth: StaffAuthService) {}

  /** Staff login → { accessToken, role }. */
  @Post('login')
  login(@Body() dto: StaffLoginDto) {
    return this.staffAuth.login(dto.username, dto.password);
  }
}
