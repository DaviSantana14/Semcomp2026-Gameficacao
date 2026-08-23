import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_REQUIRED_KEY =
  'auth:allow-password-change-required';

export const AllowPasswordChangeRequired = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_REQUIRED_KEY, true);
