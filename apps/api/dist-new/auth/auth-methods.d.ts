export type AuthMethodsEnvReader = (name: string) => string | undefined;
export interface AuthMethodState {
    enabled: boolean;
    registers: boolean;
}
export interface AppleMethodState extends AuthMethodState {
    clientId: string | null;
}
export interface GoogleMethodState extends AuthMethodState {
    clientId: string | null;
}
export interface TelegramMethodState extends AuthMethodState {
    botUsername: string | null;
}
export interface AuthMethodsView {
    phone: AuthMethodState;
    email: AuthMethodState;
    telegram: TelegramMethodState;
    apple: AppleMethodState;
    google: GoogleMethodState;
    recovery: {
        enabled: boolean;
    };
    anyLoginAvailable: boolean;
    registrationAvailable: boolean;
}
export declare function describeAuthMethods(env: AuthMethodsEnvReader): AuthMethodsView;
