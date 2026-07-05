import { setupServer } from 'msw/node';
import { githubHandlers } from './handlers/github.handlers';

export const server = setupServer(...githubHandlers);
