import type { Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { ResponseHandler, HttpStatus } from '../../utils/response.util.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as tagService from './tags.service.js';
import type {
    CreateTagInput,
    UpdateTagInput,
    ListTagsInput
} from './tags.schemas.js';

export const createTag = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const data: CreateTagInput = req.body;

        const tag = await tagService.createTag(data, organizationId);

        ResponseHandler.success(
            res,
            'Tag created successfully',
            HttpStatus.CREATED,
            tag,
            req.url
        );
    }
);

export const listTags = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const { limit, offset, search } = req.query as unknown as ListTagsInput;

        const { tags, total } = await tagService.listTags(
            organizationId,
            limit,
            offset,
            search
        );

        ResponseHandler.paginated(
            res,
            tags,
            'Tags fetched successfully',
            limit > 0 ? Math.floor(offset / limit) + 1 : 1,
            limit,
            total,
            req.url
        );
    }
);

export const getTag = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const tagId = req.params.id as string;

        const tag = await tagService.getTagById(tagId, organizationId);

        ResponseHandler.success(
            res,
            'Tag fetched successfully',
            HttpStatus.OK,
            tag,
            req.url
        );
    }
);

export const updateTag = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const tagId = req.params.id as string;
        const data: UpdateTagInput = req.body;

        const tag = await tagService.updateTag(tagId, data, organizationId);

        ResponseHandler.success(
            res,
            'Tag updated successfully',
            HttpStatus.OK,
            tag,
            req.url
        );
    }
);

export const deleteTag = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const tagId = req.params.id as string;

        await tagService.deleteTag(tagId, organizationId);

        ResponseHandler.success(
            res,
            'Tag deleted successfully',
            HttpStatus.OK,
            null,
            req.url
        );
    }
);
