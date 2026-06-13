import { z } from 'zod';

export const MetaWebhookSchema = z.object({
    object: z.string(),
    entry: z.array(
        z.object({
            id: z.string(),
            time: z.number().optional(),
            changes: z.array(
                z.object({
                    value: z.object({
                        messaging_product: z.string().optional(),
                        metadata: z.object({
                            display_phone_number: z.string().optional(),
                            phone_number_id: z.string()
                        }).optional(),
                        contacts: z.array(
                            z.object({
                                profile: z.object({
                                    name: z.string()
                                }).optional(),
                                wa_id: z.string()
                            })
                        ).optional(),
                        messages: z.array(
                            z.object({
                                from: z.string(),
                                id: z.string(),
                                timestamp: z.string().optional(),
                                type: z.string(),
                                text: z.object({
                                    body: z.string()
                                }).optional(),
                                image: z.object({
                                    caption: z.string().optional(),
                                    mime_type: z.string().optional(),
                                    sha256: z.string().optional(),
                                    id: z.string()
                                }).optional(),
                                document: z.object({
                                    caption: z.string().optional(),
                                    filename: z.string().optional(),
                                    mime_type: z.string().optional(),
                                    sha256: z.string().optional(),
                                    id: z.string()
                                }).optional(),
                                video: z.object({
                                    caption: z.string().optional(),
                                    mime_type: z.string().optional(),
                                    sha256: z.string().optional(),
                                    id: z.string()
                                }).optional(),
                                audio: z.object({
                                    mime_type: z.string().optional(),
                                    sha256: z.string().optional(),
                                    id: z.string()
                                }).optional(),
                                button: z.object({
                                    text: z.string().optional(),
                                    payload: z.string().optional()
                                }).optional()
                            })
                        ).optional(),
                        statuses: z.array(
                            z.object({
                                id: z.string(),
                                status: z.enum(['sent', 'delivered', 'read', 'failed']),
                                timestamp: z.string().optional(),
                                recipient_id: z.string().optional(),
                                errors: z.array(
                                    z.object({
                                        code: z.number().optional(),
                                        title: z.string().optional(),
                                        message: z.string().optional(),
                                        error_data: z.any().optional()
                                    })
                                ).optional()
                            })
                        ).optional()
                    })
                })
            ).optional(),
            messaging: z.array(
                z.object({
                    sender: z.object({
                        id: z.string()
                    }),
                    recipient: z.object({
                        id: z.string()
                    }).optional(),
                    timestamp: z.number().optional(),
                    message: z.object({
                        mid: z.string(),
                        text: z.string().optional(),
                        is_echo: z.boolean().optional(),
                        is_deleted: z.boolean().optional(),
                        attachments: z.array(
                            z.object({
                                type: z.string().optional(),
                                payload: z.record(z.string(), z.any()).optional()
                            })
                        ).optional()
                    }).optional(),
                    delivery: z.object({
                        mids: z.array(z.string()).optional(),
                        watermark: z.number().optional()
                    }).optional(),
                    read: z.object({
                        watermark: z.number().optional()
                    }).optional()
                })
            ).optional()
        })
    ).optional()
});
