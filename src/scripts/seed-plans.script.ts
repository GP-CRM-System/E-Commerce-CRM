import prisma from '../config/prisma.config.js';
import logger from '../utils/logger.util.js';
import { PLANS, assignFreePlanToOrganizations } from './plans.shared.js';

async function seedPlans() {
    logger.info('[PLANS] Upserting subscription plans...');

    for (const plan of PLANS) {
        const existing = await prisma.plan.findFirst({
            where: { name: plan.name }
        });
        if (existing) {
            await prisma.plan.update({
                where: { id: existing.id },
                data: plan
            });
        } else {
            await prisma.plan.create({ data: plan });
        }
    }

    logger.info(`[PLANS] Upserted ${PLANS.length} subscription plans\n`);
}

async function assignFreePlanToAllOrgs() {
    logger.info('[PLANS] Assigning Free plan to organizations without one...');

    const organizations = await prisma.organization.findMany({
        select: { id: true }
    });

    const { assigned, total } = await assignFreePlanToOrganizations(
        organizations.map((o) => o.id)
    );

    logger.info(
        `[PLANS] Assigned Free plan to ${assigned}/${total} organizations\n`
    );
}

async function main() {
    logger.info('[PLANS] PLAN SEED SCRIPT');
    const startTime = Date.now();

    await seedPlans();
    await assignFreePlanToAllOrgs();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`[PLANS] COMPLETED in ${duration}s`);
}

main()
    .catch((error) => {
        logger.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
