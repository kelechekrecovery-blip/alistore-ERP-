import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { OutboxModule } from '../outbox/outbox.module';
import { StaffTasksController } from './staff-tasks.controller';
import { StaffTasksService } from './staff-tasks.service';

@Module({
  imports: [AuthModule, StaffAuthModule, AuthzModule, OutboxModule],
  controllers: [StaffTasksController],
  providers: [StaffTasksService],
})
export class StaffTasksModule {}
