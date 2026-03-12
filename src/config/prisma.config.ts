import { env } from "./env.config.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

let prisma: PrismaClient;

declare global {
	var prismaInstance: typeof prisma | undefined;
}

if (!global.prismaInstance) {
	const adapter = new PrismaPg({
		connectionString: env.databaseUrl
	});
	prisma = new PrismaClient({ adapter });
	global.prismaInstance = prisma;
} else {
	prisma = global.prismaInstance;
}

export default prisma;
