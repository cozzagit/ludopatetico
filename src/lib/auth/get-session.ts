import { auth } from './index';

export async function getSession() {
  return await auth();
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !(session.user as any).isAdmin) {
    throw new Error('Forbidden');
  }
  return session;
}

export async function requirePremium() {
  const session = await auth();
  if (!session?.user || !(session.user as any).isPremium) {
    throw new Error('Premium required');
  }
  return session;
}
