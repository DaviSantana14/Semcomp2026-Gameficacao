import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  validateAdminPassword,
  AdminPasswordValidationError,
} from '../auth/password-policy';
import { AdminPasswordService } from '../auth/admin-password.service';
import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
} from '../audit/audit.repository';
import { AuditService } from '../audit/audit.service';
import { AdminOperationContext } from '../common/request-context';
import { paginate } from '../common/dto/pagination-response.dto';
import { PersistenceUniqueConstraintError } from '../common/persistence-errors';
import {
  ADMIN_ACTIVATION_TTL_MS,
  createAdminActivationCode,
  hashAdminActivationCode,
  normalizeAdminActivationCode,
} from './admin-activation-code';
import {
  AdminOperatorRecord,
  AdminOperatorsRepository,
} from './admin-operators.repository';
import { ActivateAdminDto } from './dto/activate-admin.dto';
import { AdminOperatorsQueryDto } from './dto/admin-operators-query.dto';
import { CreateAdminOperatorDto } from './dto/create-admin-operator.dto';
import { AdminOperatorResponseDto } from './dto/admin-operator-response.dto';
import { ResetAdminOperatorActivationDto } from './dto/reset-admin-operator-activation.dto';
import { UpdateAdminOperatorDto } from './dto/update-admin-operator.dto';
import { UpdateAdminOperatorStatusDto } from './dto/update-admin-operator-status.dto';

const ADMIN_INVALID_ACTIVATION_MESSAGE =
  'Código de ativação inválido ou expirado.';
const INVALID_ADMIN_PASSWORD_MESSAGE =
  'A senha deve ter entre 12 e 64 caracteres e no máximo 72 bytes.';
const OPERATOR_CONFLICT_CODE = 'ADMIN_OPERATOR_CONFLICT';
const GENERAL_ADMIN_PROFILE = 'GENERAL';

type AdminProfileValue = 'GENERAL' | 'SHOP' | 'ACTIVITIES';

export function toOperatorState(input: {
  isActive: boolean;
  passwordHash: string | null;
}): 'PENDING_ACTIVATION' | 'ACTIVE' | 'INACTIVE' {
  if (!input.isActive) return 'INACTIVE';
  return input.passwordHash === null ? 'PENDING_ACTIVATION' : 'ACTIVE';
}

@Injectable()
export class AdminOperatorsService {
  constructor(
    private readonly repository: AdminOperatorsRepository,
    private readonly audit: AuditService,
    private readonly adminPasswordService: AdminPasswordService,
  ) {}

  async findAll(query: AdminOperatorsQueryDto) {
    const page = await this.repository.findOperatorPage({
      page: query.page,
      limit: query.limit,
      search: query.search?.trim() || undefined,
      adminProfile: query.adminProfile,
      state: query.state,
    });
    return paginate(
      page.rows.map((row) => this.toResponse(row)),
      page.total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string) {
    const operator = await this.repository.findOperatorById(id);
    if (!operator) {
      throw new NotFoundException('Operador administrativo não encontrado.');
    }
    return this.toResponse(operator);
  }

  async create(dto: CreateAdminOperatorDto, context: AdminOperationContext) {
    const code = createAdminActivationCode();
    const expiresAt = new Date(Date.now() + ADMIN_ACTIVATION_TTL_MS);

    try {
      return await this.repository.withTransaction(async (repository) => {
        const operator = await repository.createOperator({
          name: dto.name.trim(),
          cpf: normalizeCpf(dto.cpf),
          email: dto.email.trim().toLowerCase(),
          adminProfile: dto.adminProfile,
          codeHash: hashAdminActivationCode(code),
          expiresAt,
          createdByAdminId: context.actorAdminId,
        });

        await this.audit.record(repository.auditWriter!, {
          actor: { actorType: AuditActorType.ADMIN, ...context },
          operation: AuditOperation.ADMIN_OPERATOR_CREATED,
          entityType: AuditEntityType.ADMIN_OPERATOR,
          entityId: operator.id,
          reason: dto.reason,
          after: operatorSnapshot(operator),
        });

        return {
          operator: this.toResponse(operator),
          activationCode: code,
          expiresAt: expiresAt.toISOString(),
        };
      });
    } catch (error) {
      if (error instanceof PersistenceUniqueConstraintError) {
        throw operatorConflict(
          'Não foi possível concluir o cadastro do operador.',
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateAdminOperatorDto,
    context: AdminOperationContext,
  ) {
    try {
      return await this.repository.withTransaction(async (repository) => {
        const availableGenerals = await repository.lockAvailableGenerals();
        const current = await repository.lockOperator(id);
        if (!current) {
          throw new NotFoundException(
            'Operador administrativo não encontrado.',
          );
        }

        const changes = {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.cpf !== undefined && { cpf: normalizeCpf(dto.cpf) }),
          ...(dto.email !== undefined && {
            email: dto.email.trim().toLowerCase(),
          }),
          ...(dto.adminProfile !== undefined && {
            adminProfile: dto.adminProfile,
          }),
        };
        const changed = hasOperatorChanges(current, changes);
        if (!changed) return this.toResponse(current);

        assertCanRemoveAvailableGeneral(
          current,
          changes.adminProfile,
          availableGenerals,
        );

        const updated = await repository.updateOperator(id, changes);
        const sessionsRevoked = await repository.revokeOpenSessions(
          id,
          new Date(),
        );
        await this.audit.record(repository.auditWriter!, {
          actor: { actorType: AuditActorType.ADMIN, ...context },
          operation: AuditOperation.ADMIN_OPERATOR_UPDATED,
          entityType: AuditEntityType.ADMIN_OPERATOR,
          entityId: id,
          reason: dto.reason,
          before: operatorSnapshot(current),
          after: operatorSnapshot(updated),
          metadata: { sessionsRevoked },
        });
        return this.toResponse(updated);
      });
    } catch (error) {
      if (error instanceof PersistenceUniqueConstraintError) {
        throw operatorConflict('Não foi possível atualizar o operador.');
      }
      throw error;
    }
  }

  async updateStatus(
    id: string,
    dto: UpdateAdminOperatorStatusDto,
    context: AdminOperationContext,
  ) {
    try {
      return await this.repository.withTransaction(async (repository) => {
        const availableGenerals = await repository.lockAvailableGenerals();
        const current = await repository.lockOperator(id);
        if (!current) {
          throw new NotFoundException(
            'Operador administrativo não encontrado.',
          );
        }
        if (current.isActive === dto.isActive) return this.toResponse(current);

        assertCanRemoveAvailableGeneral(
          current,
          dto.isActive ? undefined : false,
          availableGenerals,
        );
        const updated = await repository.updateOperator(id, {
          isActive: dto.isActive,
        });
        const sessionsRevoked = dto.isActive
          ? 0
          : await repository.revokeOpenSessions(id, new Date());

        await this.audit.record(repository.auditWriter!, {
          actor: { actorType: AuditActorType.ADMIN, ...context },
          operation: AuditOperation.ADMIN_OPERATOR_STATUS_CHANGED,
          entityType: AuditEntityType.ADMIN_OPERATOR,
          entityId: id,
          reason: dto.reason,
          before: operatorSnapshot(current),
          after: operatorSnapshot(updated),
          metadata: { sessionsRevoked },
        });
        return this.toResponse(updated);
      });
    } catch (error) {
      if (error instanceof PersistenceUniqueConstraintError) {
        throw operatorConflict(
          'Não foi possível alterar o status do operador.',
        );
      }
      throw error;
    }
  }

  async resetActivation(
    id: string,
    dto: ResetAdminOperatorActivationDto,
    context: AdminOperationContext,
  ) {
    const code = createAdminActivationCode();
    const expiresAt = new Date(Date.now() + ADMIN_ACTIVATION_TTL_MS);
    try {
      return await this.repository.withTransaction(async (repository) => {
        const availableGenerals = await repository.lockAvailableGenerals();
        const current = await repository.lockOperator(id);
        if (!current) {
          throw new NotFoundException(
            'Operador administrativo não encontrado.',
          );
        }
        assertCanRemoveAvailableGeneral(current, 'RESET', availableGenerals);

        const now = new Date();
        const sessionsRevoked = await repository.revokeOpenSessions(id, now);
        await repository.revokePendingActivations(id, now);
        const updated = await repository.resetOperator({
          id,
          codeHash: hashAdminActivationCode(code),
          expiresAt,
          createdByAdminId: context.actorAdminId,
        });

        await this.audit.record(repository.auditWriter!, {
          actor: { actorType: AuditActorType.ADMIN, ...context },
          operation: AuditOperation.ADMIN_OPERATOR_ACTIVATION_RESET,
          entityType: AuditEntityType.ADMIN_OPERATOR,
          entityId: id,
          reason: dto.reason,
          before: operatorSnapshot(current),
          after: operatorSnapshot(updated),
          metadata: { sessionsRevoked },
        });

        return {
          operator: this.toResponse(updated),
          activationCode: code,
          expiresAt: expiresAt.toISOString(),
        };
      });
    } catch (error) {
      if (error instanceof PersistenceUniqueConstraintError) {
        throw operatorConflict(
          'Não foi possível resetar o acesso do operador.',
        );
      }
      throw error;
    }
  }

  async activate(dto: ActivateAdminDto, requestId: string) {
    if (typeof requestId !== 'string' || requestId.trim().length === 0) {
      throw new InternalServerErrorException(
        'Identificador da requisição indisponível.',
      );
    }

    try {
      validateAdminPassword(dto.password, dto.passwordConfirmation);
    } catch (error) {
      if (error instanceof AdminPasswordValidationError) {
        throw new BadRequestException(INVALID_ADMIN_PASSWORD_MESSAGE);
      }
      throw error;
    }

    let passwordHash: string;
    try {
      passwordHash = await this.adminPasswordService.hash(dto.password);
    } catch (error) {
      if (error instanceof AdminPasswordValidationError) {
        throw new BadRequestException(INVALID_ADMIN_PASSWORD_MESSAGE);
      }
      throw error;
    }

    let codeHash: string;
    try {
      codeHash = hashAdminActivationCode(
        normalizeAdminActivationCode(dto.code),
      );
    } catch {
      throw invalidActivation();
    }

    await this.repository.withTransaction(async (repository) => {
      const result = await repository.consumeActivation({
        codeHash,
        cpf: normalizeCpf(dto.cpf),
        email: dto.email.trim().toLowerCase(),
        passwordHash,
        now: new Date(),
      });
      if (!result) throw invalidActivation();

      await this.audit.record(repository.auditWriter!, {
        actor: {
          actorType: AuditActorType.SYSTEM,
          requestId: requestId.trim(),
        },
        operation: AuditOperation.ADMIN_OPERATOR_ACTIVATED,
        entityType: AuditEntityType.ADMIN_OPERATOR,
        entityId: result.after.id,
        reason: 'Ativacao administrativa concluida',
        before: operatorSnapshot(result.before),
        after: operatorSnapshot(result.after),
      });
    });
  }

  private toResponse(operator: AdminOperatorRecord) {
    return new AdminOperatorResponseDto(operator, toOperatorState(operator));
  }
}

function operatorSnapshot(operator: AdminOperatorRecord) {
  return {
    id: operator.id,
    name: operator.name,
    adminProfile: operator.adminProfile,
    isActive: operator.isActive,
    createdAt: operator.createdAt,
    updatedAt: operator.updatedAt,
  };
}

function hasOperatorChanges(
  current: AdminOperatorRecord,
  changes: {
    name?: string;
    cpf?: string;
    email?: string;
    adminProfile?: AdminProfileValue;
  },
) {
  return Object.entries(changes).some(
    ([key, value]) =>
      value !== undefined && value !== current[key as keyof typeof current],
  );
}

function assertCanRemoveAvailableGeneral(
  current: AdminOperatorRecord,
  requestedChange: AdminProfileValue | boolean | 'RESET' | undefined,
  availableGenerals: Array<{ id: string }>,
) {
  const isAvailableGeneral =
    current.isActive &&
    current.passwordHash !== null &&
    current.adminProfile === GENERAL_ADMIN_PROFILE;
  const removesAvailability =
    requestedChange === false ||
    requestedChange === 'RESET' ||
    (requestedChange !== undefined &&
      requestedChange !== GENERAL_ADMIN_PROFILE);

  if (
    isAvailableGeneral &&
    removesAvailability &&
    availableGenerals.length === 1 &&
    availableGenerals[0]?.id === current.id
  ) {
    throw new ConflictException({
      statusCode: 409,
      code: 'LAST_ACTIVE_GENERAL_ADMIN',
      message: 'É necessário manter ao menos um administrador geral ativo.',
    });
  }
}

function operatorConflict(message: string) {
  return new ConflictException({
    statusCode: 409,
    code: OPERATOR_CONFLICT_CODE,
    message,
  });
}

function invalidActivation() {
  return new UnauthorizedException({
    statusCode: 401,
    code: 'ADMIN_ACTIVATION_INVALID',
    message: ADMIN_INVALID_ACTIVATION_MESSAGE,
  });
}

function normalizeCpf(cpf: string) {
  return cpf.replace(/\D/g, '');
}
