import { Module } from '@nestjs/common';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { AuthzModule } from '../authz/authz.module';
import { SettingsModule } from '../settings/settings.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';

@Module({ imports: [StaffAuthModule, AuthzModule, SettingsModule], controllers: [HrController], providers: [HrService], exports: [HrService] })
export class HrModule {}
