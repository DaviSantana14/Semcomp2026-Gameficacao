import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ActionsService } from './actions.service';
import { toActionResponseDto } from './dto/action-response.dto';
import { CreateActionDto } from './dto/create-action.dto';

@Controller('actions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  async create(@Body() createActionDto: CreateActionDto) {
    const action = await this.actionsService.create(createActionDto);

    return toActionResponseDto(action);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  async findAll() {
    const actions = await this.actionsService.findAll();

    return actions.map(toActionResponseDto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  async findById(@Param('id') id: string) {
    const action = await this.actionsService.findById(id);

    if (!action) {
      throw new NotFoundException('Action not found');
    }

    return toActionResponseDto(action);
  }
}
