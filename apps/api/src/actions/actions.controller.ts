import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
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
import { HttpErrorResponseDto } from '../common/dto/http-error-response.dto';
import { ActionsService } from './actions.service';
import { ActionResponseDto, toActionResponseDto } from './dto/action-response.dto';
import { CreateActionDto } from './dto/create-action.dto';

@ApiTags('Actions')
@ApiBearerAuth('bearer')
@Controller('actions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Criar uma action pontuável (admin)' })
  @ApiBody({ type: CreateActionDto })
  @ApiCreatedResponse({ type: ActionResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Token ausente ou inválido.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 401,
      message: 'Autenticação necessária ou token inválido.',
      error: 'Unauthorized',
    },
  })
  @ApiForbiddenResponse({
    description: 'Acesso permitido apenas para admins.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 403,
      message: 'Você não tem permissão para acessar este recurso.',
      error: 'Forbidden',
    },
  })
  async create(@Body() createActionDto: CreateActionDto) {
    const action = await this.actionsService.create(createActionDto);

    return toActionResponseDto(action);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar actions (admin)' })
  @ApiOkResponse({ type: ActionResponseDto, isArray: true })
  @ApiUnauthorizedResponse({
    description: 'Token ausente ou inválido.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 401,
      message: 'Autenticação necessária ou token inválido.',
      error: 'Unauthorized',
    },
  })
  @ApiForbiddenResponse({
    description: 'Acesso permitido apenas para admins.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 403,
      message: 'Você não tem permissão para acessar este recurso.',
      error: 'Forbidden',
    },
  })
  async findAll() {
    const actions = await this.actionsService.findAll();

    return actions.map(toActionResponseDto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Buscar action por id (admin)' })
  @ApiOkResponse({ type: ActionResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Token ausente ou inválido.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 401,
      message: 'Autenticação necessária ou token inválido.',
      error: 'Unauthorized',
    },
  })
  @ApiForbiddenResponse({
    description: 'Acesso permitido apenas para admins.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 403,
      message: 'Você não tem permissão para acessar este recurso.',
      error: 'Forbidden',
    },
  })
  @ApiNotFoundResponse({
    description: 'Action não encontrada.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 404,
      message: 'Action não encontrada.',
      error: 'Not Found',
    },
  })
  async findById(@Param('id') id: string) {
    const action = await this.actionsService.findById(id);

    if (!action) {
      throw new NotFoundException('Action não encontrada.');
    }

    return toActionResponseDto(action);
  }
}
