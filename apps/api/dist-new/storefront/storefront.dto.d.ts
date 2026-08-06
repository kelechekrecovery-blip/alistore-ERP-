export declare class StorefrontBenefitDto {
    title: string;
    body: string;
}
export declare class CreateStorefrontContentDto {
    heroEyebrow: string;
    heroTitle: string;
    heroBody: string;
    heroCtaLabel: string;
    heroCtaHref: string;
    heroImageUrl?: string;
    financingText?: string;
    aboutTitle: string;
    aboutBody: string;
    deliveryTitle: string;
    deliveryBody: string;
    contactPhone?: string;
    supportHours?: string;
    benefits: StorefrontBenefitDto[];
    featuredTitle: string;
    featuredProductIds: string[];
}
export declare class ScheduleStorefrontContentDto {
    startsAt: string;
    endsAt?: string;
}
