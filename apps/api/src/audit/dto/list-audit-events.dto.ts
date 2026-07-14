import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
} from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

function trimmed(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class ListParticipantAuditEventsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AuditOperation })
  @IsOptional()
  @IsEnum(AuditOperation)
  operation?: AuditOperation;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class ListAuditEventsDto extends ListParticipantAuditEventsDto {
  @ApiPropertyOptional({ enum: AuditActorType })
  @IsOptional()
  @IsEnum(AuditActorType)
  actorType?: AuditActorType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimmed(value))
  @IsString()
  @MaxLength(100)
  actorAdminId?: string;

  @ApiPropertyOptional({ enum: AuditEntityType })
  @IsOptional()
  @IsEnum(AuditEntityType)
  entityType?: AuditEntityType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimmed(value))
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimmed(value))
  @IsString()
  @MaxLength(100)
  participantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimmed(value))
  @IsString()
  @MaxLength(100)
  requestId?: string;
}
