import { Module } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { ShiftsController } from './shifts.controller';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';

@Module({
  imports: [StaffAuthModule, AuthzModule],
  providers: [ShiftsService],
  controllers: [ShiftsController],
  exports: [ShiftsService],
})
export class ShiftsModule {}
