import { http, HttpResponse } from 'msw';

const BASE = 'https://api.github.com';

export const githubHandlers = [
  http.get(`${BASE}/repos/:owner/:repo`, ({ params }) => {
    const { owner, repo } = params as Record<string, string>;
    return HttpResponse.json({
      id: 1,
      full_name: `${owner}/${repo}`,
      html_url: `https://github.com/${owner}/${repo}`,
    });
  }),

  http.get(`${BASE}/repos/:owner/:repo/releases/latest`, () => {
    return HttpResponse.json({
      tag_name: 'v1.0.0',
      html_url: 'https://github.com/owner/repo/releases/tag/v1.0.0',
    });
  }),
];
