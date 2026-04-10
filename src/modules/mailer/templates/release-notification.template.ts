export function releaseNotificationHtml(
  repo: string,
  tag: string,
  releaseUrl: string,
  unsubscribeUrl: string,
): string {
  return `
    <p>A new release is available for <strong>${repo}</strong>.</p>
    <p>Version: <strong>${tag}</strong></p>
    <p><a href="${releaseUrl}">View release on GitHub</a></p>
    <hr />
    <p style="font-size: 12px; color: #666;">
      Don't want these emails? <a href="${unsubscribeUrl}">Unsubscribe</a>
    </p>
  `;
}
