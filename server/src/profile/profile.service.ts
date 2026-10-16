import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { invalidateUserInfo } from '../common/user-cache';

@Injectable()
export class ProfileService {
  async getProfile(userId: string) {
    const user = await db.select().from(users).where(eq(users.id, userId));
    if (!user.length) throw new NotFoundException('User not found');
    // Never send the password hash to the browser.
    const { passwordHash, ...safe } = user[0];
    void passwordHash;
    return safe;
  }

  // Use 'any' for file type to avoid type issues
  async updateAvatar(userId: string, file: any): Promise<string> {
    const relativePath = `/uploads/${file.filename}`;
    await db
      .update(users)
      .set({ avatar: relativePath })
      .where(eq(users.id, userId));
    invalidateUserInfo(userId);
    return relativePath;
  }
}
