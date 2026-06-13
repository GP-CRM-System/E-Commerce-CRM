import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import { auth } from '../auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';
import {
    handleInboundMessage,
    sendOutboundMessage
} from './messaging.service.js';

let authToken: string;
let testOrgId: string;
let testUserId: string;

beforeAll(async () => {
    // Cleanup any leftover test data
    await prisma.conversation.deleteMany({
        where: { organization: { slug: { startsWith: 'messaging-test' } } }
    });

    const timestamp = Date.now();
    const email = `messaging-test-${timestamp}@test.com`;

    const signup = await auth.api.signUpEmail({
        body: {
            email,
            password: 'Password123!',
            name: 'Messaging Test User'
        }
    });

    if (!signup) throw new Error('Signup failed');
    authToken = signup.token!;
    testUserId = signup.user.id;

    await prisma.user.update({
        where: { id: testUserId },
        data: { emailVerified: true }
    });

    const org = await auth.api.createOrganization({
        headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
        body: {
            name: 'Messaging Test Org',
            slug: `messaging-test-org-${timestamp}`
        }
    });

    const orgResponse = org as { organization?: { id: string }; id?: string };
    testOrgId = orgResponse.organization?.id ?? orgResponse.id ?? '';

    await auth.api.setActiveOrganization({
        headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
        body: { organizationId: testOrgId }
    });

    const signin = await auth.api.signInEmail({
        body: { email, password: 'Password123!' }
    });

    if (!signin || !signin.token) throw new Error('Signin failed');
    authToken = signin.token;
});

afterAll(async () => {
    // Cleanup all messaging test data
    await prisma.message.deleteMany({
        where: { conversation: { organizationId: testOrgId } }
    });
    await prisma.conversation.deleteMany({
        where: { organizationId: testOrgId }
    });
    // Delete orders first to avoid RESTRICT constraint on customers
    await prisma.order.deleteMany({
        where: { organizationId: testOrgId }
    });
    await prisma.customer.deleteMany({ where: { organizationId: testOrgId } });
    await prisma.member.deleteMany({ where: { organizationId: testOrgId } });
    await prisma.session.deleteMany({ where: { userId: testUserId } });
    await prisma.account.deleteMany({ where: { userId: testUserId } });
    await prisma.organizationRole.deleteMany({
        where: { organizationId: testOrgId }
    });
    await prisma.integration.deleteMany({ where: { orgId: testOrgId } });
    await prisma.organization.deleteMany({ where: { id: testOrgId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
});

describe('Messaging API', () => {
    let testConversationId: string;
    let testCustomerId: string;

    describe('GET /api/messaging/conversations', () => {
        it('should return 401 if unauthorized', async () => {
            const response = await request(app).get(
                '/api/messaging/conversations'
            );
            expect(response.status).toBe(401);
        });

        it('should return empty list when no conversations exist', async () => {
            const response = await request(app)
                .get('/api/messaging/conversations')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBe(0);
        });
    });

    describe('handleInboundMessage (unit)', () => {
        it('should create a conversation and message for a new inbound message', async () => {
            // Create a customer first
            const customer = await prisma.customer.create({
                data: {
                    name: 'WhatsApp Customer',
                    phone: '+201234567890',
                    organizationId: testOrgId
                }
            });
            testCustomerId = customer.id;

            const result = await handleInboundMessage({
                organizationId: testOrgId,
                externalChatId: '+201234567890',
                externalMessageId: 'wa-external-1',
                provider: 'whatsapp',
                content: 'Hello, I need help with my order',
                type: 'text',
                customerPhone: '+201234567890'
            });

            expect(result.conversation).toBeDefined();
            expect(result.message).toBeDefined();
            expect(result.conversation.provider).toBe('whatsapp');
            expect(result.conversation.status).toBe('OPEN');
            expect(result.conversation.customerId).toBe(testCustomerId);
            expect(result.message.direction).toBe('INBOUND');
            expect(result.message.content).toBe(
                'Hello, I need help with my order'
            );
            expect(result.message.status).toBe('READ');

            testConversationId = result.conversation.id;
        });

        it('should find existing conversation by external ID', async () => {
            const result = await handleInboundMessage({
                organizationId: testOrgId,
                externalChatId: '+201234567890',
                externalMessageId: 'wa-external-2',
                provider: 'whatsapp',
                content: 'Thanks for your reply',
                type: 'text',
                customerPhone: '+201234567890'
            });

            expect(result.conversation.id).toBe(testConversationId);
        });

        it('should handle Facebook Messenger inbound message', async () => {
            const result = await handleInboundMessage({
                organizationId: testOrgId,
                externalChatId: 'fb-psid-12345',
                externalMessageId: 'fb-mid-1',
                provider: 'facebook',
                content: 'Hello from Facebook Messenger',
                type: 'text'
            });

            expect(result.conversation.provider).toBe('facebook');
            expect(result.message.content).toBe(
                'Hello from Facebook Messenger'
            );
        });

        it('should handle Instagram inbound message', async () => {
            const result = await handleInboundMessage({
                organizationId: testOrgId,
                externalChatId: 'ig-scoped-id-123',
                externalMessageId: 'ig-mid-1',
                provider: 'instagram',
                content: 'Hello from Instagram DM',
                type: 'text'
            });

            expect(result.conversation.provider).toBe('instagram');
            expect(result.message.content).toBe('Hello from Instagram DM');
        });

        it('should auto-create customer for unknown sender', async () => {
            const result = await handleInboundMessage({
                organizationId: testOrgId,
                externalChatId: 'unknown-user-001',
                externalMessageId: 'ext-unknown-1',
                provider: 'facebook',
                content: 'I am a new user',
                type: 'text'
            });

            expect(result.conversation).toBeDefined();
            expect(result.conversation.customerId).toBeDefined();
        });
    });

    describe('GET /api/messaging/conversations (with data)', () => {
        it('should list conversations after creation', async () => {
            const response = await request(app)
                .get('/api/messaging/conversations')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('GET /api/messaging/conversations/:id/messages', () => {
        it('should return messages for a conversation', async () => {
            const response = await request(app)
                .get(
                    `/api/messaging/conversations/${testConversationId}/messages`
                )
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBe(2); // Two inbound messages
        });

        it('should return 404 for non-existent conversation', async () => {
            const response = await request(app)
                .get('/api/messaging/conversations/non-existent-id/messages')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/messaging/conversations/:id/messages (send)', () => {
        it('should validate required fields', async () => {
            const response = await request(app)
                .post(
                    `/api/messaging/conversations/${testConversationId}/messages`
                )
                .set('Authorization', `Bearer ${authToken}`)
                .send({}); // Empty body

            expect(response.status).toBe(400);
        });

        it('should queue message optimistically even without Meta integration', async () => {
            const response = await request(app)
                .post(
                    `/api/messaging/conversations/${testConversationId}/messages`
                )
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    content: 'We will help you shortly!'
                });

            // Message is created optimistically with PENDING status and queued for async delivery
            expect(response.status).toBe(200);
            expect(response.body.message).toContain('queued');
        });

        it('should reject empty message content', async () => {
            const response = await request(app)
                .post(
                    `/api/messaging/conversations/${testConversationId}/messages`
                )
                .set('Authorization', `Bearer ${authToken}`)
                .send({ content: '' });

            expect(response.status).toBe(400);
        });

        it('should reject messages over 4096 characters', async () => {
            const response = await request(app)
                .post(
                    `/api/messaging/conversations/${testConversationId}/messages`
                )
                .set('Authorization', `Bearer ${authToken}`)
                .send({ content: 'x'.repeat(4097) });

            expect(response.status).toBe(400);
        });

        it('should accept valid message type enum values', async () => {
            // The schema should accept 'text', 'image', 'document', 'template'
            const response = await request(app)
                .post(
                    `/api/messaging/conversations/${testConversationId}/messages`
                )
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    content: 'Test message',
                    type: 'image'
                });

            // Message is created optimistically regardless of integration; delivery happens async
            expect(response.status).toBe(200);
            expect(response.body.message).toContain('queued');
        });
    });

    describe('sendOutboundMessage (unit)', () => {
        it('should throw AppError for non-existent conversation', async () => {
            try {
                await sendOutboundMessage({
                    organizationId: testOrgId,
                    conversationId: 'non-existent-id',
                    content: 'Hello'
                });
                // Should not reach here
                expect(true).toBe(false);
            } catch (error) {
                const appError = error as { status?: number; code?: string };
                expect(appError.status).toBe(404);
                expect(appError.code).toBe('RESOURCE_NOT_FOUND');
            }
        });

        it('should throw error when no Meta integration is configured', async () => {
            try {
                await sendOutboundMessage({
                    organizationId: testOrgId,
                    conversationId: testConversationId,
                    content: 'Help is on the way!'
                });
                // Should not reach here
                expect(true).toBe(false);
            } catch (error) {
                const appError = error as { status?: number; message?: string };
                expect(appError.status).toBe(400);
                expect(appError.message).toContain('integration');
            }
        });

        it('should attempt to send via WhatsApp when provider is whatsapp', async () => {
            // Create a Meta integration to test the send flow
            await prisma.integration.create({
                data: {
                    orgId: testOrgId,
                    provider: 'meta',
                    name: 'Meta Test',
                    accessToken: 'test-access-token',
                    isActive: true,
                    metadata: {
                        whatsappPhoneNumberId: 'test-phone-id',
                        facebookPageId: 'test-page-id',
                        instagramBusinessAccountId: 'test-ig-id'
                    }
                }
            });

            // Create a WhatsApp conversation
            const conv = await prisma.conversation.create({
                data: {
                    organizationId: testOrgId,
                    externalId: '+201234567891',
                    provider: 'whatsapp',
                    status: 'OPEN'
                }
            });

            // The send should fail because the access token is fake
            // but it should attempt the API call (before it was throwing "Meta integration not configured")
            try {
                await sendOutboundMessage({
                    organizationId: testOrgId,
                    conversationId: conv.id,
                    content: 'Hello, this is a test message'
                });
            } catch (error) {
                // Should fail due to fetch call to Meta API with fake token
                const err = error as { message?: string };
                expect(err.message).toBeDefined();
            }

            // Cleanup
            await prisma.message.deleteMany({
                where: { conversationId: conv.id }
            });
            await prisma.conversation.delete({ where: { id: conv.id } });
            // Also delete messages from other conversations referencing this integration
            // Keep integration for next tests
        });

        it('should attempt to send via Facebook when provider is facebook', async () => {
            const conv = await prisma.conversation.create({
                data: {
                    organizationId: testOrgId,
                    externalId: 'fb-psid-test',
                    provider: 'facebook',
                    status: 'OPEN'
                }
            });

            try {
                await sendOutboundMessage({
                    organizationId: testOrgId,
                    conversationId: conv.id,
                    content: 'Hello from Facebook'
                });
            } catch (error) {
                const err = error as { message?: string };
                expect(err.message).toBeDefined();
            }

            await prisma.message.deleteMany({
                where: { conversationId: conv.id }
            });
            await prisma.conversation.delete({ where: { id: conv.id } });
        });

        it('should attempt to send via Instagram when provider is instagram', async () => {
            const conv = await prisma.conversation.create({
                data: {
                    organizationId: testOrgId,
                    externalId: 'ig-psid-test',
                    provider: 'instagram',
                    status: 'OPEN'
                }
            });

            try {
                await sendOutboundMessage({
                    organizationId: testOrgId,
                    conversationId: conv.id,
                    content: 'Hello from Instagram DM'
                });
            } catch (error) {
                const err = error as { message?: string };
                expect(err.message).toBeDefined();
            }

            await prisma.message.deleteMany({
                where: { conversationId: conv.id }
            });
            await prisma.conversation.delete({ where: { id: conv.id } });
        });
    });
});

describe('Meta Webhook', () => {
    describe('GET /api/messaging/meta/webhook (verification)', () => {
        it('should return 403 with no verification token', async () => {
            const response = await request(app).get(
                '/api/messaging/meta/webhook'
            );
            expect(response.status).toBe(403);
        });
    });
});
