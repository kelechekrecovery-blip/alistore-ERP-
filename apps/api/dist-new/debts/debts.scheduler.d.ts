import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DebtsService } from './debts.service';
import { AlerterService } from '../observability/alerter.service';
export declare class DebtsReminderScheduler implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly debts;
    private readonly alerter;
    private readonly logger;
    private boss?;
    constructor(config: ConfigService, debts: DebtsService, alerter: AlerterService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
