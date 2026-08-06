import { GiftcardsService } from './giftcards.service';
import { IssueGiftCardDto } from './giftcards.dto';
import { AuthPrincipal } from '../auth/jwt.strategy';
export declare class GiftcardsController {
    private readonly giftcards;
    constructor(giftcards: GiftcardsService);
    issue(user: AuthPrincipal, dto: IssueGiftCardDto, idempotencyKey: string | undefined): Promise<import("./giftcards.service").GiftCardView>;
    get(code: string): Promise<import("./giftcards.service").GiftCardView>;
}
