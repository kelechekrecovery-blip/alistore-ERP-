import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { StoreOperationsController } from './store-operations.controller';
import { StoreOperationsService } from './store-operations.service';

@Module({ imports: [AuthzModule, StaffAuthModule], controllers: [StoreOperationsController], providers: [StoreOperationsService] })
export class StoreOperationsModule {}
