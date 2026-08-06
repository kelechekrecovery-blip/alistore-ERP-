export type BootstrapEnvReader = (name: string) => string | undefined;
export declare function isStaffBootstrapAvailable(env: BootstrapEnvReader): boolean;
