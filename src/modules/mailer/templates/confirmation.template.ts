export function confirmationEmailHtml(confirmUrl: string): string {
  return `
    <p>Thanks for subscribing!</p>
    <p>Click the link below to confirm your email address:</p>
    <p><a href="${confirmUrl}">${confirmUrl}</a></p>
    <p>If you did not request this, you can safely ignore this email.</p>
  `;
}
