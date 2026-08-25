import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination-response.dto';

export class QuestionGrantParticipantResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  points!: number;

  @ApiProperty()
  isActive!: boolean;
}

export class QuestionGrantParticipantsPageResponseDto {
  @ApiProperty({ type: QuestionGrantParticipantResponseDto, isArray: true })
  items!: QuestionGrantParticipantResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
