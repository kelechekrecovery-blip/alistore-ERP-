import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OwnerAlertsService } from './owner-alerts.service';
import { AlerterService } from '../observability/alerter.service';
export declare class OwnerAlertsScheduler implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly alerts;
    private readonly alerter;
    private readonly logger;
    private boss?;
    constructor(config: ConfigService, alerts: OwnerAlertsService, alerter: AlerterService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
