import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceSlaService } from './service-sla.service';
import { AlerterService } from '../observability/alerter.service';
export declare class ServiceSlaScheduler implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly sla;
    private readonly alerter;
    private readonly logger;
    private boss?;
    private queue?;
    private worker?;
    private redis?;
    constructor(config: ConfigService, sla: ServiceSlaService, alerter: AlerterService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private startBullMq;
    private runSweep;
}
