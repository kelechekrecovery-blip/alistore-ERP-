import { OtpSender } from './otp-sender';
export type OtpEnvReader = (name: string) => string | undefined;
export declare function selectOtpSender(env: OtpEnvReader): OtpSender;
