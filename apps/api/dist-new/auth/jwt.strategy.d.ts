import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-jwt';
export interface JwtPayload {
    sub: string;
    phone?: string;
    typ: string;
    role?: string;
    point?: string;
    storePointId?: string;
}
export interface AuthPrincipal {
    customerId: string;
    phone?: string;
    typ: string;
    role?: string;
    point?: string;
    storePointId?: string;
}
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    constructor(config: ConfigService);
    validate(payload: JwtPayload): AuthPrincipal;
}
export {};
