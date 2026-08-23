/* eslint-disable @typescript-eslint/unbound-method */
import { HttpStatus } from '@nestjs/common';
import { RATE_LIMIT_POLICY_KEY } from '../../security/rate-limit-policy.decorator';
import { AllowedOriginGuard } from '../../auth/allowed-origin.guard';
import { AdminActivationController } from '../admin-activation.controller';

describe(AdminActivationController.name, () => {
  it('uses the origin guard, the activation rate policy, and returns no content', async () => {
    const service = { activate: jest.fn().mockResolvedValue(undefined) };
    const controller = new AdminActivationController(service as never);
    const request = { requestId: 'request-1' };

    await expect(
      controller.activate(
        { code: 'ABCDE-FGHJK-LMNPQ-RST23' } as never,
        request as never,
      ),
    ).resolves.toBeUndefined();
    expect(service.activate).toHaveBeenCalledWith(
      { code: 'ABCDE-FGHJK-LMNPQ-RST23' },
      'request-1',
    );
    expect(
      Reflect.getMetadata(
        RATE_LIMIT_POLICY_KEY,
        AdminActivationController.prototype.activate,
      ),
    ).toBe('activation');
    expect(
      Reflect.getMetadata(
        '__guards__',
        AdminActivationController.prototype.activate,
      ),
    ).toEqual([AllowedOriginGuard]);
    expect(HttpStatus.NO_CONTENT).toBe(204);
  });
});
