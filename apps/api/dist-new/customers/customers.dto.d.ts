export declare class UpsertCustomerDto {
    phone: string;
    name?: string;
}
export declare class SetConsentDto {
    consent: boolean;
    actor?: string;
}
export declare class CreateCustomerAddressDto {
    title: string;
    text: string;
    comment?: string;
    isPrimary?: boolean;
}
export declare class UpdateCustomerAddressDto {
    title?: string;
    text?: string;
    comment?: string;
    isPrimary?: boolean;
}
export declare class UpdateCustomerSettingsDto {
    name?: string;
    consent?: boolean;
    push?: boolean;
    whatsapp?: boolean;
    service?: boolean;
    promos?: boolean;
}
