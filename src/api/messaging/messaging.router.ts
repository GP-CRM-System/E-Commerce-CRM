import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as messagingController from './messaging.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { paginationSchema } from '../../utils/pagination.util.js';
import {
    sendMessageSchema,
    startConversationSchema,
    createUploadSessionSchema
} from './messaging.schemas.js';
import metaWebhookRouter from './meta-webhook.router.js';

const router = Router();

// Webhook routes (Public/Signature verified)
router.use('/', metaWebhookRouter);

// API routes (Protected)
router
    .route('/conversations')
    .get(
        requirePermission('conversations:read'),
        validateRequest(paginationSchema, 'query'),
        messagingController.listConversations
    )
    .post(
        requirePermission('conversations:write'),
        validateRequest(startConversationSchema, 'body'),
        messagingController.startConversation
    );

router
    .route('/conversations/:id/messages')
    .get(
        requirePermission('conversations:read'),
        validateRequest(paginationSchema, 'query'),
        messagingController.getConversationMessages
    )
    .post(
        requirePermission('conversations:write'),
        validateRequest(sendMessageSchema, 'body'),
        messagingController.sendMessage
    );

router
    .route('/conversations/:id/assign')
    .post(
        requirePermission('conversations:write'),
        messagingController.assignConversation
    );

router
    .route('/conversations/:id/read')
    .post(
        requirePermission('conversations:write'),
        messagingController.markConversationAsRead
    );

router
    .route('/conversations/:id/messages/upload-session')
    .post(
        requirePermission('conversations:write'),
        validateRequest(createUploadSessionSchema, 'body'),
        messagingController.createUploadSession
    );

router
    .route('/messages/:messageId/complete-upload')
    .post(
        requirePermission('conversations:write'),
        messagingController.completeUpload
    );

router
    .route('/messages/:messageId')
    .delete(
        requirePermission('conversations:write'),
        messagingController.deleteMessage
    );

export default router;
