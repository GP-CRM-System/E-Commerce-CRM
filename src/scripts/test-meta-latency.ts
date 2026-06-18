import prisma from '../config/prisma.config.js';

async function run() {
    console.log('--- Searching for Customer 201015372301 across ALL Orgs ---');
    const conversations = await prisma.conversation.findMany({
        where: {
            OR: [
                { externalId: '201015372301' },
                { externalId: '+201015372301' }
            ]
        },
        include: {
            messages: {
                orderBy: { createdAt: 'desc' },
                take: 5
            }
        }
    });

    console.log(`Found ${conversations.length} conversations across all orgs.`);
    for (const c of conversations) {
        console.log(`\n- Conversation ID: ${c.id}`);
        console.log(`  Org ID: ${c.organizationId}`);
        console.log(`  Provider: ${c.provider}`);
        console.log(`  Messages Count in this Conv: ${c.messages.length}`);
        for (const m of c.messages) {
            console.log(`    * [${m.direction}] [Status: ${m.status}] ID: ${m.id}, Content: "${m.content.slice(0, 50)}"`);
        }
    }

    await prisma.$disconnect();
}
run();
