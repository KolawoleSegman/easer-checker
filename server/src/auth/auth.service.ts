import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async register(dto: RegisterDto) {
    // Check if email already exists
    const existingEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, dto.email));
    if (existingEmail.length > 0) {
      throw new ConflictException('Email already registered');
    }

    // Check if username already exists
    const existingUsername = await db
      .select()
      .from(users)
      .where(eq(users.username, dto.username));
    if (existingUsername.length > 0) {
      throw new ConflictException('Username already taken');
    }

    const hash = await bcrypt.hash(dto.password, 10);
    const newUser = await db
      .insert(users)
      .values({
        email: dto.email,
        username: dto.username,
        passwordHash: hash,
      })
      .returning();

    const user = newUser[0];
    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return {
      access_token: token,
      user: { id: user.id, email: user.email, username: user.username },
    };
  }

  async login(dto: LoginDto) {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, dto.email));
    if (user.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(dto.password, user[0].passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const token = this.jwtService.sign({
      sub: user[0].id,
      email: user[0].email,
    });
    return {
      access_token: token,
      user: {
        id: user[0].id,
        email: user[0].email,
        username: user[0].username,
      },
    };
  }
}
