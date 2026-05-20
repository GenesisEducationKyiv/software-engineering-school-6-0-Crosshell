import { z } from 'zod';

export const gitHubRepositorySchema = z
  .object({
    id: z.number(),
    full_name: z.string(),
    html_url: z.string(),
  })
  .transform((data) => {
    const separatorIndex = data.full_name.indexOf('/');

    return {
      id: data.id,
      owner: data.full_name.slice(0, separatorIndex),
      repo: data.full_name.slice(separatorIndex + 1),
      htmlUrl: data.html_url,
    };
  });

export const gitHubReleaseSchema = z
  .object({
    tag_name: z.string(),
    html_url: z.string(),
  })
  .transform((data) => ({
    tagName: data.tag_name,
    htmlUrl: data.html_url,
  }));

export type GitHubRepository = z.infer<typeof gitHubRepositorySchema>;
export type GitHubRelease = z.infer<typeof gitHubReleaseSchema>;
