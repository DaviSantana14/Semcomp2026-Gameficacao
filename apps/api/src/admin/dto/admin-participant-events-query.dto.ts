import { PointEventKind, PointEventSource } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
export class AdminParticipantEventsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(PointEventSource) source?: PointEventSource;
  @IsOptional() @IsEnum(PointEventKind) kind?: PointEventKind;
}
