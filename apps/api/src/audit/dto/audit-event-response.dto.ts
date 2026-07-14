import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
} from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination-response.dto';

export class AuditEventResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty({ enum: AuditActorType })
  actorType!: AuditActorType;
  @ApiProperty({ nullable: true, type: String })
  actorAdminId!: string | null;
  @ApiProperty({ nullable: true, type: String })
  participantId!: string | null;
  @ApiProperty({ enum: AuditOperation })
  operation!: AuditOperation;
  @ApiProperty({ enum: AuditEntityType })
  entityType!: AuditEntityType;
  @ApiProperty()
  entityId!: string;
  @ApiProperty()
  reason!: string;
  @ApiProperty({ nullable: true, type: Object })
  before!: object | null;
  @ApiProperty({ nullable: true, type: Object })
  after!: object | null;
  @ApiProperty({ nullable: true, type: Object })
  metadata!: object | null;
  @ApiProperty()
  requestId!: string;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class AuditEventPageResponseDto {
  @ApiProperty({ type: [AuditEventResponseDto] })
  items!: AuditEventResponseDto[];
  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
