import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as messagingService from './messaging.service.js';
import prisma from '../../config/prisma.config.js';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { getPagination } from '../../utils/pagination.util.js';
import { emitToConversation, emitToOrg } from '../../config/socket.config.js';
import {
    getSignedUploadUrl,
    getSignedDownloadUrl,
    deleteFromB2,
    isB2Configured
} from '../../config/b2.config.js';
import crypto from 'crypto';
import { signMessageMedia } from './messaging.service.js';

export const listConversations = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const { skip, take, page, limit } = getPagination(
            {
                page: (req.query.page as string) || '1',
                limit: (req.query.limit as string) || '20'
            },
            20
        );

        const [conversations, total] = await Promise.all([
            prisma.conversation.findMany({
                where: { organizationId },
                orderBy: { lastMessageAt: 'desc' },
                include: {
                    customer: { select: { name: true, email: true } },
                    messages: {
                        orderBy: { createdAt: 'desc' },
                        take: 1
                    }
                },
                take,
                skip
            }),
            prisma.conversation.count({ where: { organizationId } })
        ]);

        return ResponseHandler.paginated(
            res,
            conversations,
            'Conversations fetched successfully',
            page,
            limit,
            total
        );
    }
);

export const getConversationMessages = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const conversationId = req.params.id as string;

        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, organizationId }
        });

        if (!conversation) {
            return ResponseHandler.error(
                res,
                'Conversation not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        const { skip, take, page, limit } = getPagination(
            {
                page: (req.query.page as string) || '1',
                limit: (req.query.limit as string) || '50'
            },
            50
        );

        const [messages, total] = await Promise.all([
            prisma.message.findMany({
                where: { conversationId },
                orderBy: { createdAt: 'desc' },
                take,
                skip
            }),
            prisma.message.count({ where: { conversationId } })
        ]);

        // Reverse the array to maintain chronological order (oldest to newest) for client display
        messages.reverse();

        const signedMessages = await Promise.all(
            messages.map(signMessageMedia)
        );

        return ResponseHandler.paginated(
            res,
            signedMessages,
            'Messages fetched successfully',
            page,
            limit,
            total
        );
    }
);

export const sendMessage = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const conversationId = req.params.id as string;
        const { content, type, metadata } = req.body;

        if (!content) {
            return ResponseHandler.error(
                res,
                'Message content is required',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const message = await messagingService.sendOutboundMessage({
            organizationId,
            conversationId,
            content,
            type: type || 'text',
            metadata: metadata || {}
        });

        const signedMsg = await signMessageMedia(message);

        return ResponseHandler.success(
            res,
            'Message sent successfully',
            HttpStatus.OK,
            signedMsg
        );
    }
);

export const startConversation = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const {
            provider,
            recipientId,
            content,
            type,
            customerPhone,
            customerName,
            metadata
        } = req.body;

        const result = await messagingService.startConversation({
            organizationId,
            provider,
            recipientId,
            content,
            type,
            customerPhone,
            customerName,
            metadata
        });

        return ResponseHandler.success(
            res,
            'Conversation started and message sent',
            HttpStatus.CREATED,
            result
        );
    }
);

export const assignConversation = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const conversationId = req.params.id as string;
        const { assignedAgentId } = req.body;

        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, organizationId }
        });

        if (!conversation) {
            return ResponseHandler.error(
                res,
                'Conversation not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        if (assignedAgentId) {
            const member = await prisma.member.findFirst({
                where: { userId: assignedAgentId, organizationId }
            });
            if (!member) {
                return ResponseHandler.error(
                    res,
                    'Agent not found in this organization',
                    ErrorCode.RESOURCE_NOT_FOUND,
                    HttpStatus.BAD_REQUEST
                );
            }
        }

        const updated = await prisma.conversation.update({
            where: { id: conversationId },
            data: { assignedAgentId: assignedAgentId || null },
            include: {
                customer: { select: { name: true, email: true } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });

        emitToOrg(organizationId, 'conversation:assigned', {
            conversation: updated,
            assignedAgentId: assignedAgentId || null
        });

        return ResponseHandler.success(
            res,
            'Conversation assigned successfully',
            HttpStatus.OK,
            updated
        );
    }
);

export const createUploadSession = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const conversationId = req.params.id as string;
        const { fileName, mimeType, fileSize, type } = req.body;

        // 1. Verify conversation belongs to organization
        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, organizationId }
        });

        if (!conversation) {
            return ResponseHandler.error(
                res,
                'Conversation not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        // 2. Validate file type & extension to reject dangerous uploads
        const allowedExtensions: Record<string, string[]> = {
            image: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
            video: ['mp4', 'mov', 'webm'],
            audio: ['mp3', 'wav', 'm4a', 'ogg'],
            document: [
                'pdf',
                'doc',
                'docx',
                'xls',
                'xlsx',
                'ppt',
                'pptx',
                'txt',
                'zip',
                'rar',
                'csv'
            ]
        };

        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        if (!allowedExtensions[type]?.includes(ext)) {
            return ResponseHandler.error(
                res,
                `Invalid file extension .${ext} for type ${type}`,
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        // 3. Create optimistic PENDING message
        const message = await prisma.message.create({
            data: {
                conversationId,
                direction: 'OUTBOUND',
                content: `Pending upload: ${fileName}`,
                type: type,
                status: 'PENDING',
                metadata: {
                    fileName,
                    mimeType,
                    size: fileSize,
                    originalName: fileName
                }
            }
        });

        // 4. Generate S3/B2 storage key and presigned URL
        const uniqueId = crypto.randomUUID();
        const b2Key = `chat-${type}s/org_${organizationId}/conv_${conversationId}/msg_${message.id}/${uniqueId}.${ext}`;

        // Update database with the storageKey
        const updatedMessage = await prisma.message.update({
            where: { id: message.id },
            data: {
                metadata: {
                    fileName,
                    mimeType,
                    size: fileSize,
                    originalName: fileName,
                    storageKey: b2Key
                }
            }
        });

        // Generate the presigned upload URL
        const presignedResult = await getSignedUploadUrl(b2Key, mimeType);
        if (!presignedResult.success || !presignedResult.url) {
            // Clean up the created message on failure
            await prisma.message.delete({ where: { id: message.id } });
            return ResponseHandler.error(
                res,
                presignedResult.error || 'Failed to generate upload session',
                ErrorCode.SERVER_ERROR,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }

        // Emit message:created so other agents see the optimistic placeholder
        emitToConversation(conversationId, 'message:created', {
            message: updatedMessage
        });

        return ResponseHandler.success(
            res,
            'Upload session created successfully',
            HttpStatus.OK,
            {
                uploadUrl: presignedResult.url,
                message: updatedMessage
            }
        );
    }
);

export const completeUpload = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const messageId = req.params.messageId as string;

        // Find the message and verify organization access via conversation
        const message = await prisma.message.findUnique({
            where: { id: messageId },
            include: { conversation: true }
        });

        if (
            !message ||
            message.conversation.organizationId !== organizationId
        ) {
            return ResponseHandler.error(
                res,
                'Message not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        const metadata = (message.metadata as Record<string, unknown>) || {};
        if (!metadata.storageKey) {
            return ResponseHandler.error(
                res,
                'Invalid upload message',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        // 1. Generate the signed download URL to store or return
        const signedDownloadResult = await getSignedDownloadUrl(
            metadata.storageKey as string
        );
        if (!signedDownloadResult.success || !signedDownloadResult.url) {
            return ResponseHandler.error(
                res,
                'Failed to verify file upload',
                ErrorCode.SERVER_ERROR,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }

        // 2. Perform direct synchronous Meta API send using sendOutboundMessage
        const sentMessage = await messagingService.sendOutboundMessage({
            organizationId,
            conversationId: message.conversationId,
            content: signedDownloadResult.url,
            type: message.type,
            metadata,
            messageId
        });

        const signedMsg = await signMessageMedia(sentMessage);

        return ResponseHandler.success(
            res,
            'Upload completed and message sent',
            HttpStatus.OK,
            signedMsg
        );
    }
);

export const deleteMessage = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const messageId = req.params.messageId as string;

        const message = await prisma.message.findUnique({
            where: { id: messageId },
            include: { conversation: true }
        });

        if (
            !message ||
            message.conversation.organizationId !== organizationId
        ) {
            return ResponseHandler.error(
                res,
                'Message not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        // Delete S3/B2 file if key exists
        const metadata = (message.metadata as Record<string, unknown>) || {};
        if (metadata.storageKey && isB2Configured) {
            await deleteFromB2(metadata.storageKey as string);
        }

        // Delete from Database
        await prisma.message.delete({
            where: { id: messageId }
        });

        // Broadcast removal event to conversation room
        emitToConversation(message.conversationId, 'message:deleted', {
            conversationId: message.conversationId,
            messageId
        });

        return ResponseHandler.success(
            res,
            'Message deleted successfully',
            HttpStatus.OK
        );
    }
);

export const markConversationAsRead = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const conversationId = req.params.id as string;

        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, organizationId }
        });

        if (!conversation) {
            return ResponseHandler.error(
                res,
                'Conversation not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        const updated = await prisma.conversation.update({
            where: { id: conversationId },
            data: {
                unreadCount: 0,
                lastReadAt: new Date()
            },
            include: {
                customer: { select: { name: true, email: true } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });

        emitToOrg(organizationId, 'inbox:updated', {
            conversation: updated
        });

        emitToConversation(conversationId, 'conversation:read', {
            conversationId,
            unreadCount: 0
        });

        return ResponseHandler.success(
            res,
            'Conversation marked as read successfully',
            HttpStatus.OK,
            updated
        );
    }
);
