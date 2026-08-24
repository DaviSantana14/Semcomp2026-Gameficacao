import { DownloadCapacityError, DownloadGate } from '../download-gate';

describe(DownloadGate.name, () => {
  it('allows one QR artifact and releases the slot after completion', async () => {
    const gate = new DownloadGate();
    const work = jest.fn().mockResolvedValue('done');

    await expect(gate.run('qr', work)).resolves.toBe('done');
    await expect(gate.run('qr', work)).resolves.toBe('done');
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('rejects a concurrent QR artifact with a 30-second retry hint', async () => {
    const gate = new DownloadGate();
    let release!: () => void;
    const first = gate.run(
      'qr',
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    await expect(gate.run('qr', () => 'second')).rejects.toEqual(
      expect.objectContaining<Partial<DownloadCapacityError>>({
        retryAfterSeconds: 30,
      }),
    );

    release();
    await first;
  });

  it('releases the slot when the work fails', async () => {
    const gate = new DownloadGate();
    const failure = new Error('render failed');

    await expect(gate.run('qr', () => Promise.reject(failure))).rejects.toBe(
      failure,
    );
    await expect(gate.run('qr', () => 'available again')).resolves.toBe(
      'available again',
    );
  });
});
