import { ApiProperty } from '@nestjs/swagger';

class GrantedQuestionActionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  points!: number;
}

export class AdminQuestionGrantResponseDto {
  @ApiProperty({ type: GrantedQuestionActionDto })
  action!: GrantedQuestionActionDto;

  @ApiProperty()
  participantId!: string;

  @ApiProperty()
  pointEventId!: string;

  @ApiProperty()
  awardedPoints!: number;

  @ApiProperty()
  awardedXp!: number;

  @ApiProperty()
  currentPoints!: number;

  @ApiProperty()
  currentXp!: number;

  @ApiProperty()
  currentLevel!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  grantedAt!: Date;
}
