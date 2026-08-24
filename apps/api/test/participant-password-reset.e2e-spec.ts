import { AdminProfile, AuditOperation } from '@prisma/client';
import {
  AdminE2eHarness,
  AuthSession,
  createE2eAdmin,
  createE2eParticipant,
  E2E_ADMIN_PASSWORD,
  loginAttemptForE2e,
  loginForE2e,
} from './support/admin-e2e-harness';
import { hasDisposableTestDatabaseConfiguration } from './support/e2e-database-cleanup';

jest.setTimeout(120_000);
const describeDisposable = hasDisposableTestDatabaseConfiguration()
  ? describe
  : describe.skip;

type ErrorResponseBody = { code?: string };

describeDisposable('Participant administrative password reset (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let admin: { cpf: string; email: string };

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    const suffix = `participant-reset-${Date.now()}`;
    const user = await createE2eAdmin(harness.prisma, {
      name: 'Participant reset admin',
      cpf: harness.uniqueCpf(suffix, 1),
      email: `${suffix}-admin@example.test`,
      adminProfile: AdminProfile.GENERAL,
      isActive: true,
      password: E2E_ADMIN_PASSWORD,
    });
    admin = { cpf: user.cpf, email: user.email };
    adminSession = await loginForE2e(
      harness.app,
      harness.prisma,
      user.cpf,
      user.email,
      E2E_ADMIN_PASSWORD,
    );
  });

  afterAll(async () => {
    await harness?.close();
  });

  it('covers reset, restricted temporary session, definitive change, replacement, and expiry', async () => {
    const suffix = `flow-${Date.now()}`;
    const initialPassword = 'Participant-Initial-2026!';
    const participant = await createE2eParticipant(harness.prisma, {
      name: 'Resettable participant',
      cpf: harness.uniqueCpf(suffix, 2),
      email: `${suffix}-participant@example.test`,
      isActive: true,
      password: initialPassword,
    });
    const oldSession = await loginForE2e(
      harness.app,
      harness.prisma,
      participant.cpf,
      participant.email,
      initialPassword,
    );

    const reset = await harness
      .post(
        `/admin/participants/${participant.id}/password-reset`,
        adminSession,
      )
      .send({
        reason: 'Participante solicitou redefinicao de senha',
        replacePending: false,
      })
      .expect(200);
    const resetBody = reset.body as {
      temporaryPassword: string;
      expiresAt: string;
    };
    const temporaryPassword = resetBody.temporaryPassword;
    expect(temporaryPassword).toEqual(expect.any(String));
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(20);
    expect(resetBody.expiresAt).toEqual(expect.any(String));
    expect(reset.body).not.toHaveProperty('passwordHash');

    await harness.get('/users/me', oldSession).expect(401);
    const resetState = await harness.prisma.user.findUniqueOrThrow({
      where: { id: participant.id },
      select: {
        passwordHash: true,
        passwordResetRequired: true,
        passwordResetExpiresAt: true,
      },
    });
    expect(resetState.passwordResetRequired).toBe(true);
    expect(resetState.passwordResetExpiresAt!.getTime()).toBeGreaterThan(
      Date.now() + 23 * 60 * 60 * 1000,
    );
    expect(resetState.passwordHash).not.toBe(temporaryPassword);

    const auditEvents = await harness.prisma.adminAuditEvent.findMany({
      where: { operation: AuditOperation.PARTICIPANT_PASSWORD_RESET },
      select: { before: true, after: true, metadata: true },
    });
    const auditJson = JSON.stringify(auditEvents);
    expect(auditJson).not.toMatch(
      /"(?:temporaryPassword|passwordHash|codeHash)"/,
    );
    expect(auditJson).not.toContain(temporaryPassword);
    expect(auditJson).not.toContain(resetState.passwordHash!);

    const temporarySession = await loginForE2e(
      harness.app,
      harness.prisma,
      participant.cpf,
      participant.email,
      temporaryPassword,
    );
    const csrf = await harness.get('/auth/csrf', temporarySession).expect(200);
    expect(
      (csrf.body as { passwordChangeRequired?: boolean })
        .passwordChangeRequired,
    ).toBe(true);
    const blockedRanking = await harness
      .get('/ranking', temporarySession)
      .expect(403);
    expect((blockedRanking.body as ErrorResponseBody).code).toBe(
      'PASSWORD_CHANGE_REQUIRED',
    );

    const logoutSession = await loginForE2e(
      harness.app,
      harness.prisma,
      participant.cpf,
      participant.email,
      temporaryPassword,
    );
    await harness.post('/auth/logout', logoutSession).expect(204);
    await harness.get('/auth/csrf', logoutSession).expect(401);

    const definitivePassword = 'Participant-Definitive-2026!';
    await harness
      .post('/auth/password/change-required', temporarySession)
      .send({ newPassword: definitivePassword })
      .expect(204);
    await harness.get('/auth/csrf', temporarySession).expect(401);
    const sessionsAfterTemporaryChange =
      await harness.prisma.userSession.findMany({
        where: { userId: participant.id },
        select: { endedAt: true, endReason: true },
      });
    expect(
      sessionsAfterTemporaryChange.every((session) => session.endedAt !== null),
    ).toBe(true);
    expect(
      sessionsAfterTemporaryChange.every(
        (session) => session.endReason !== null,
      ),
    ).toBe(true);
    expect(
      (
        await loginAttemptForE2e(
          harness.app,
          harness.prisma,
          participant.cpf,
          participant.email,
          temporaryPassword,
        )
      ).status,
    ).toBe(401);
    const definitiveSession = await loginForE2e(
      harness.app,
      harness.prisma,
      participant.cpf,
      participant.email,
      definitivePassword,
    );
    await harness.get('/users/me', definitiveSession).expect(200);

    const pending = await createE2eParticipant(harness.prisma, {
      name: 'Replacement participant',
      cpf: harness.uniqueCpf(`${suffix}-pending`, 3),
      email: `${suffix}-pending@example.test`,
      isActive: true,
      password: 'Replacement-Initial-2026!',
    });
    const firstPendingReset = await harness
      .post(`/admin/participants/${pending.id}/password-reset`, adminSession)
      .send({
        reason: 'Criar credencial temporaria de teste',
        replacePending: false,
      })
      .expect(200);
    const firstTemporaryPassword = (
      firstPendingReset.body as { temporaryPassword: string }
    ).temporaryPassword;
    await harness
      .post(`/admin/participants/${pending.id}/password-reset`, adminSession)
      .send({
        reason: 'Impedir segundo reset sem substituicao',
        replacePending: false,
      })
      .expect(409)
      .expect((response) => {
        expect((response.body as ErrorResponseBody).code).toBe(
          'PASSWORD_RESET_PENDING',
        );
      });
    const replacementReset = await harness
      .post(`/admin/participants/${pending.id}/password-reset`, adminSession)
      .send({
        reason: 'Substituir credencial temporaria pendente',
        replacePending: true,
      })
      .expect(200);
    const replacementPassword = (
      replacementReset.body as { temporaryPassword: string }
    ).temporaryPassword;
    expect(
      (
        await loginAttemptForE2e(
          harness.app,
          harness.prisma,
          pending.cpf,
          pending.email,
          firstTemporaryPassword,
        )
      ).status,
    ).toBe(401);
    const replacementSession = await loginForE2e(
      harness.app,
      harness.prisma,
      pending.cpf,
      pending.email,
      replacementPassword,
    );
    await harness.prisma.user.update({
      where: { id: pending.id },
      data: { passwordResetExpiresAt: new Date(Date.now() - 1) },
    });
    await harness.get('/auth/csrf', replacementSession).expect(401);
    expect(
      (
        await loginAttemptForE2e(
          harness.app,
          harness.prisma,
          pending.cpf,
          pending.email,
          replacementPassword,
        )
      ).status,
    ).toBe(401);

    expect(admin.email).toContain('@example.test');
  });
});
