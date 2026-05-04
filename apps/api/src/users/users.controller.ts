import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { toUserResponseDto, UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Get('me')
  me(@Req() request: {
    user: UserResponseDto;
  },
  ) {
    return toUserResponseDto(request.user);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  async findAll() {
    const users = await this.usersService.findAll();

    return users.map(toUserResponseDto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  async findById(@Param('id') id: string) {
    const user = await this.usersService.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return toUserResponseDto(user);
  }
}
