import { ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { AlerterService } from './alerter.service';
import { ErrorReporter } from './error-reporter';
export declare function isCriticalException(exception: unknown): boolean;
export declare class SentryExceptionFilter extends BaseExceptionFilter {
    private readonly reporter;
    private readonly alerter;
    constructor(reporter: ErrorReporter, alerter: AlerterService);
    catch(exception: unknown, host: ArgumentsHost): void;
}
