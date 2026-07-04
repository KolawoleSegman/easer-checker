import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { db } from '../db';
import { friendships, users } from '../db/schema';
import { eq, and, or } from 'drizzle-orm';

@Injectable()
export class FriendsService {
  async getFriends(userId: string) {
    // get accepted friends (status ACCEPTED)
    const friends = await db
      .select({
        userId: friendships.friendId,
        username: users.username,
      })
      .from(friendships)
      .innerJoin(users, eq(friendships.friendId, users.id))
      .where(
        and(eq(friendships.userId, userId), eq(friendships.status, 'ACCEPTED')),
      );
    // also get reverse direction
    const reverse = await db
      .select({
        userId: friendships.userId,
        username: users.username,
      })
      .from(friendships)
      .innerJoin(users, eq(friendships.userId, users.id))
      .where(
        and(
          eq(friendships.friendId, userId),
          eq(friendships.status, 'ACCEPTED'),
        ),
      );
    return [...friends, ...reverse];
  }

  async getPendingRequests(userId: string) {
    // received friend requests
    return db
      .select({
        id: friendships.id,
        userId: friendships.userId,
        username: users.username,
      })
      .from(friendships)
      .innerJoin(users, eq(friendships.userId, users.id))
      .where(
        and(
          eq(friendships.friendId, userId),
          eq(friendships.status, 'PENDING'),
        ),
      );
  }

  async sendRequest(senderId: string, targetId: string) {
    if (senderId === targetId)
      throw new ConflictException('Cannot friend yourself');
    const existing = await db
      .select()
      .from(friendships)
      .where(
        or(
          and(
            eq(friendships.userId, senderId),
            eq(friendships.friendId, targetId),
          ),
          and(
            eq(friendships.userId, targetId),
            eq(friendships.friendId, senderId),
          ),
        ),
      );
    if (existing.length)
      throw new ConflictException('Friendship already exists');
    await db.insert(friendships).values({
      userId: senderId,
      friendId: targetId,
      status: 'PENDING',
    });
    return { message: 'Request sent' };
  }

  async acceptRequest(userId: string, friendId: string) {
    const updated = await db
      .update(friendships)
      .set({ status: 'ACCEPTED' })
      .where(
        and(eq(friendships.userId, friendId), eq(friendships.friendId, userId)),
      )
      .returning();
    if (!updated.length) throw new NotFoundException('Request not found');
    return { message: 'Friend added' };
  }

  async blockUser(userId: string, targetId: string) {
    // delete or set status BLOCKED
    await db
      .update(friendships)
      .set({ status: 'BLOCKED' })
      .where(
        or(
          and(
            eq(friendships.userId, userId),
            eq(friendships.friendId, targetId),
          ),
          and(
            eq(friendships.userId, targetId),
            eq(friendships.friendId, userId),
          ),
        ),
      );
    return { message: 'Blocked' };
  }
}
