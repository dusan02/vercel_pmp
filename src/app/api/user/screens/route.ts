import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isValidScreenParams } from '@/lib/utils/screener';

export const runtime = 'nodejs';

const MAX_SCREENS = 3;

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const screens = await prisma.savedScreen.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, params: true, createdAt: true },
    });
    return NextResponse.json(screens);
}

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json().catch(() => null) as { name?: unknown; params?: unknown } | null;
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        const params = typeof body?.params === 'string' ? body.params : '';

        if (name.length < 1 || name.length > 40) {
            return NextResponse.json({ error: 'Name must be 1-40 characters' }, { status: 400 });
        }
        if (!isValidScreenParams(params)) {
            return NextResponse.json({ error: 'Invalid filter params' }, { status: 400 });
        }

        const count = await prisma.savedScreen.count({ where: { userId: session.user.id } });
        if (count >= MAX_SCREENS) {
            return NextResponse.json({ error: `Maximum ${MAX_SCREENS} saved screens` }, { status: 409 });
        }

        const screen = await prisma.savedScreen.create({
            data: { userId: session.user.id, name, params },
            select: { id: true, name: true, params: true, createdAt: true },
        });
        return NextResponse.json(screen, { status: 201 });
    } catch (error) {
        console.error('Error saving screen:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const id = req.nextUrl.searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'id required' }, { status: 400 });
        }
        // userId in the where clause enforces ownership — deleteMany never
        // removes another user's screen.
        const result = await prisma.savedScreen.deleteMany({
            where: { id, userId: session.user.id },
        });
        if (result.count === 0) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting screen:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
