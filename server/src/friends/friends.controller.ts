import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FriendsService } from './friends.service';

@Controller('friends')
@UseGuards(AuthGuard('jwt'))
export class FriendsController {
  constructor(private friendsService: FriendsService) {}

  @Get()
  getFriends(@Request() req) {
    return this.friendsService.getFriends(req.user.userId);
  }

  @Get('requests')
  getPendingRequests(@Request() req) {
    return this.friendsService.getPendingRequests(req.user.userId);
  }

  @Post('request/:userId')
  sendRequest(@Request() req, @Param('userId') targetId: string) {
    return this.friendsService.sendRequest(req.user.userId, targetId);
  }

  @Put('accept/:userId')
  acceptRequest(@Request() req, @Param('userId') friendId: string) {
    return this.friendsService.acceptRequest(req.user.userId, friendId);
  }

  @Put('block/:userId')
  blockUser(@Request() req, @Param('userId') targetId: string) {
    return this.friendsService.blockUser(req.user.userId, targetId);
  }

  @Delete(':userId')
  removeFriend(@Request() req, @Param('userId') friendId: string) {
    return this.friendsService.blockUser(req.user.userId, friendId); // same as block
  }
}
