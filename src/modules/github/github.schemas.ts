import { z } from 'zod';

export const gitHubRepositorySchema = z
  .object({
    id: z.number(),
    full_name: z.string(),
    html_url: z.string(),
  })
  .transform((data) => ({
    id: data.id,
    fullName: data.full_name,
    htmlUrl: data.html_url,
  }));

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
