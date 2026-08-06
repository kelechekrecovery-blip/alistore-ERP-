import { MediaService } from './media.service';
export declare class MediaController {
    private readonly media;
    constructor(media: MediaService);
    upload(file?: Express.Multer.File): Promise<import("./media.service").IngestedImage>;
}
