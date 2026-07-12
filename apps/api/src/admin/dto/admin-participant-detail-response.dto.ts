import { AdminParticipantResponseDto } from './admin-participant-response.dto';
export class AdminParticipantDetailResponseDto extends AdminParticipantResponseDto {
  lastLoginAt!: string | null;
}
