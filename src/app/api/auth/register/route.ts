import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/src/lib/db';
import { users } from '@/src/lib/db/schema';
import { eq, or } from 'drizzle-orm';
import { z } from 'zod';

const registerSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = registerSchema.parse(body);

    // Check if user exists
    const [existing] = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.email, validated.email),
          eq(users.username, validated.username)
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: { code: 'USER_EXISTS', message: 'Email o username già registrato' } },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(validated.password, 12);

    const [newUser] = await db
      .insert(users)
      .values({
        username: validated.username,
        email: validated.email,
        password: hashedPassword,
        firstName: validated.firstName || null,
        lastName: validated.lastName || null,
      })
      .returning();

    return NextResponse.json({
      data: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Dati non validi', details: error.errors } },
        { status: 400 }
      );
    }
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Errore durante la registrazione' } },
      { status: 500 }
    );
  }
}
