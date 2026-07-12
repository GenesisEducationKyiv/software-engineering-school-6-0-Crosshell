import { setupServer } from 'msw/node';
import { githubHandlers } from './mocks/handlers/github.handlers';

export const mswServer = setupServer(...githubHandlers);

beforeAll(() => {
  mswServer.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  mswServer.resetHandlers();
});

afterAll(() => {
  mswServer.close();
});
