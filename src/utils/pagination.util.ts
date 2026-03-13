export function getPagination(
    query: { page: string; limit: string },
    defaultLimit: number = 10
) {
    if (!query.page || !query.limit) {
        return { page: 1, limit: defaultLimit, skip: 0, take: defaultLimit };
    }
    const page = Number(query.page);
    const limit = Number(query.limit);
    if (isNaN(page) || isNaN(limit)) {
        return { page: 1, limit: defaultLimit, skip: 0, take: defaultLimit };
    }
    const skip = (page - 1) * limit;
    const take = limit;
    return { page, limit, skip, take };
}
