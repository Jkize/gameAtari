import { of } from 'rxjs';
import { socketManager } from '../network/socket';
import { AuthService } from './auth.service';

describe('AuthService socket recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('forces one shared refresh when the socket rejects an otherwise unexpired token', async () => {
    let socketAuthentication: Parameters<typeof socketManager.configureAuthentication>[0] | undefined;
    vi.spyOn(socketManager, 'configureAuthentication').mockImplementation(authentication => {
      socketAuthentication = authentication;
    });
    const http = {
      post: vi.fn(() => of({ accessToken: 'new-access-token' })),
      get: vi.fn(() => of({
        id: 'user-1',
        username: 'TankOne',
        role: 'USER',
        tutorialStatus: 'COMPLETED',
      })),
    };
    const service = new AuthService(http as never);
    const futurePayload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 }));
    service.accessToken.set(`header.${futurePayload}.signature`);

    const [first, second] = await Promise.all([
      socketAuthentication!.refreshAccessToken(),
      socketAuthentication!.refreshAccessToken(),
    ]);

    expect(first).toBe('new-access-token');
    expect(second).toBe('new-access-token');
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      {},
      { withCredentials: true },
    );
  });
});
