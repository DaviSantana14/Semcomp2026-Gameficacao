import { IsBoolean } from 'class-validator';
export class UpdateParticipantStatusDto {
  @IsBoolean() isActive!: boolean;
}
