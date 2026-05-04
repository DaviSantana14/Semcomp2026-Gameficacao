import { ActionType } from '@prisma/client';

export class ActionResponseDto {
  id: string;
  name: string;
  description: string | null;
  type: ActionType;
  points: number;
  isActive: boolean;
  createdAt: Date;

  constructor(data: ActionResponseSource) {
    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.type = data.type;
    this.points = data.points;
    this.isActive = data.isActive;
    this.createdAt = data.createdAt;
  }
}

export type ActionResponseSource = {
  id: string;
  name: string;
  description: string | null;
  type: ActionType;
  points: number;
  isActive: boolean;
  createdAt: Date;
};

export function toActionResponseDto(action: ActionResponseSource) {
  return new ActionResponseDto(action);
}
