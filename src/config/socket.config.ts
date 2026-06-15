import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from '@redis/client';
import { auth } from '../api/auth/auth.js';
import prisma from './prisma.config.js';
import { env } from './env.config.js';
import logger from '../utils/logger.util.js';

interface SessionData {
    user: { id: string; [key: string]: unknown };
    activeOrganizationId?: string | null;
    role?: string;
    [key: string]: unknown;
}

let io: Server | null = null;
const onlineUsers = new Map<string, string>(); // Map<userId, orgId> to track active users

export async function initSocket(server: HttpServer) {
    io = new Server(server, {
        cors: {
            origin: process.env.CORS_ORIGIN?.split(',') || [
                'http://localhost:5173'
            ],
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    // 1. Setup Redis Adapter for multi-instance scalability
    if (env.redisUrl) {
        try {
            const isTLS = env.redisUrl.startsWith('rediss://');
            const pubClient = createClient({
                url: env.redisUrl,
                socket: isTLS
                    ? { tls: true, rejectUnauthorized: false }
                    : undefined
            });
            const subClient = pubClient.duplicate();

            await Promise.all([pubClient.connect(), subClient.connect()]);
            io.adapter(createAdapter(pubClient, subClient));
            logger.info(
                '[Socket] Redis adapter connected and applied successfully'
            );
        } catch (err) {
            logger.error(
                { err },
                '[Socket] Failed to apply Redis adapter, falling back to local memory adapter'
            );
        }
    }

    // 2. Authentication Middleware using Better Auth sessions
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            const headers = new Headers();
            if (token) {
                headers.set('authorization', token);
            }
            if (socket.handshake.headers.cookie) {
                headers.set('cookie', socket.handshake.headers.cookie);
            }

            const session = await auth.api.getSession({
                headers: headers
            });

            if (!session) {
                logger.warn(
                    '[Socket] Connection rejected: No valid session found'
                );
                return next(new Error('Authentication failed'));
            }

            const activeOrganizationId = (session as SessionData)
                .activeOrganizationId;
            if (!activeOrganizationId) {
                logger.warn(
                    '[Socket] Connection rejected: No active organization in session'
                );
                return next(new Error('No active organization selected'));
            }

            socket.data.user = session.user;
            socket.data.role = (session as SessionData).role || 'member';
            socket.data.organizationId = activeOrganizationId;
            next();
        } catch (err) {
            logger.error({ err }, '[Socket] Handshake validation failed');
            next(new Error('Authentication error'));
        }
    });

    // 3. Connection Events & Rooms Setup
    io.on('connection', (socket) => {
        const orgId = socket.data.organizationId;
        const userId = socket.data.user.id;

        socket.join(`org_${orgId}`);
        onlineUsers.set(userId, orgId);

        // Update database user presence
        prisma.user
            .update({
                where: { id: userId },
                data: { isOnline: true, lastSeen: new Date() }
            })
            .catch((err) =>
                logger.error(
                    { err },
                    `[Socket] Failed to update user ${userId} presence on connect`
                )
            );

        // Broadcast presence online to organization
        io?.to(`org_${orgId}`).emit('presence:update', {
            userId,
            status: 'online'
        });

        logger.info(`[Socket] User ${userId} logged into room org_${orgId}`);

        // Provide online users list
        socket.on('presence:get_online', (callback) => {
            const list: string[] = [];
            onlineUsers.forEach((value, key) => {
                if (value === orgId) {
                    list.push(key);
                }
            });
            callback(list);
        });

        // JOIN specific conversation with access checks
        socket.on('join_conversation', async ({ conversationId }, callback) => {
            try {
                const conversation = await prisma.conversation.findFirst({
                    where: { id: conversationId, organizationId: orgId }
                });

                if (!conversation) {
                    return callback?.({
                        success: false,
                        error: 'Conversation not found'
                    });
                }

                // Root/Admin can view any. Regular agents can view if unassigned or assigned to them.
                const isAuthorized =
                    socket.data.role === 'root' ||
                    socket.data.role === 'admin' ||
                    conversation.assignedAgentId === null ||
                    conversation.assignedAgentId === userId;

                if (!isAuthorized) {
                    return callback?.({
                        success: false,
                        error: 'Access denied: not assigned to this conversation'
                    });
                }

                socket.join(`conversation_${conversationId}`);
                logger.debug(
                    `[Socket] User ${userId} joined room conversation_${conversationId}`
                );
                callback?.({ success: true });
            } catch (err) {
                logger.error(
                    { err, conversationId },
                    'Error joining conversation room'
                );
                callback?.({ success: false, error: 'Internal server error' });
            }
        });

        // LEAVE specific conversation
        socket.on('leave_conversation', ({ conversationId }) => {
            socket.leave(`conversation_${conversationId}`);
            logger.debug(
                `[Socket] User ${userId} left room conversation_${conversationId}`
            );
        });

        // Typing Status triggers
        socket.on('typing:status', async ({ conversationId, isTyping }) => {
            // Validate conversation belongs to user's org
            const conversation = await prisma.conversation.findFirst({
                where: { id: conversationId, organizationId: orgId },
                select: { id: true }
            });

            if (conversation) {
                socket
                    .to(`conversation_${conversationId}`)
                    .emit('typing:status', {
                        conversationId,
                        userId,
                        isTyping
                    });
            }
        });

        // Upload Progress events
        socket.on(
            'upload:progress',
            async ({ conversationId, messageId, progress }) => {
                // Validate conversation belongs to user's org
                const conversation = await prisma.conversation.findFirst({
                    where: { id: conversationId, organizationId: orgId },
                    select: { id: true }
                });

                if (conversation) {
                    socket
                        .to(`conversation_${conversationId}`)
                        .emit('upload:progress', {
                            conversationId,
                            messageId,
                            progress
                        });
                }
            }
        );

        // Disconnect presence tracking
        socket.on('disconnect', () => {
            onlineUsers.delete(userId);

            // Update database user presence
            prisma.user
                .update({
                    where: { id: userId },
                    data: { isOnline: false, lastSeen: new Date() }
                })
                .catch((err) =>
                    logger.error(
                        { err },
                        `[Socket] Failed to update user ${userId} presence on disconnect`
                    )
                );

            io?.to(`org_${orgId}`).emit('presence:update', {
                userId,
                status: 'offline',
                lastSeen: new Date().toISOString()
            });
            logger.info(
                `[Socket] User ${userId} disconnected from org_${orgId}`
            );
        });
    });

    return io;
}

export function getIO() {
    return io;
}

export function emitToOrg(
    orgId: string,
    event: string,
    data: Record<string, unknown>
) {
    if (!io) {
        logger.warn(
            `[Socket] Cannot emit event "${event}" to "org_${orgId}": socket server not initialized`
        );
        return;
    }

    logger.info(
        `[Socket] Emitting event "${event}" to organization room "org_${orgId}"`
    );

    const conversation = data?.conversation as
        | { assignedAgentId?: string }
        | undefined;
    if (conversation) {
        const assignedAgentId = conversation.assignedAgentId;
        const orgRoom = `org_${orgId}`;
        const socketsInRoom = io.sockets.adapter.rooms.get(orgRoom);

        if (socketsInRoom) {
            for (const socketId of socketsInRoom) {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    const userId = socket.data.user?.id;
                    const role = socket.data.role?.toLowerCase();
                    const isManager = [
                        'root',
                        'admin',
                        'owner',
                        'manager'
                    ].includes(role);
                    const isAssigned =
                        assignedAgentId && userId === assignedAgentId;

                    if (isManager || isAssigned) {
                        socket.emit(event, data);
                    }
                }
            }
        }
    } else {
        io.to(`org_${orgId}`).emit(event, data);
    }
}

export function emitToConversation(
    conversationId: string,
    event: string,
    data: unknown
) {
    if (io) {
        logger.info(
            `[Socket] Emitting event "${event}" to conversation room "conversation_${conversationId}"`
        );
        io.to(`conversation_${conversationId}`).emit(event, data);
    } else {
        logger.warn(
            `[Socket] Cannot emit event "${event}" to conversation room "conversation_${conversationId}": socket server not initialized`
        );
    }
}
