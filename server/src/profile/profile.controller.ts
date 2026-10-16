import {
  Controller,
  Post,
  Get,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { readFile, unlink } from 'fs/promises';
import { ProfileService } from './profile.service';
import { UPLOADS_DIR } from '../common/data-dir';

@Controller('profile')
@UseGuards(AuthGuard('jwt'))
export class ProfileController {
  constructor(private profileService: ProfileService) {}

  @Get()
  getProfile(@Request() req) {
    return this.profileService.getProfile(req.user.userId);
  }

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, callback) => {
        if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(file.originalname)) {
          return callback(
            new BadRequestException('Only image files are allowed!'),
            false,
          );
        }
        callback(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadAvatar(@Request() req, @UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    // Extension and client-provided MIME type are not trustworthy. Check the
    // actual file signature before allowing the image to be stored as an avatar.
    const bytes = await readFile(file.path);
    const isJpeg =
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;
    const isPng =
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isGif =
      bytes.length >= 6 &&
      ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'));
    const isWebp =
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!(isJpeg || isPng || isGif || isWebp)) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException('The uploaded file is not a valid JPEG, PNG, GIF, or WebP image.');
    }

    const avatarPath = await this.profileService.updateAvatar(
      req.user.userId,
      file,
    );
    return { avatar: avatarPath };
  }
}
