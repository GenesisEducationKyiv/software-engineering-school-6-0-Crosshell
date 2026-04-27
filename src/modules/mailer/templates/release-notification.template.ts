export function releaseNotificationHtml(
  repo: string,
  tag: string,
  releaseUrl: string,
  unsubscribeUrl: string,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:#24292f;padding:28px 40px;">
              <p style="margin:0;font-size:18px;font-weight:600;color:#ffffff;">&#x1F4E6; New Release</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 8px;font-size:14px;color:#57606a;text-transform:uppercase;letter-spacing:.06em;font-weight:600;">Repository</p>
              <p style="margin:0 0 28px;font-size:22px;font-weight:700;color:#24292f;">${repo}</p>

              <p style="margin:0 0 8px;font-size:14px;color:#57606a;text-transform:uppercase;letter-spacing:.06em;font-weight:600;">Version</p>
              <p style="margin:0 0 32px;">
                <span style="display:inline-block;background:#dafbe1;color:#1a7f37;font-size:15px;font-weight:600;padding:4px 12px;border-radius:20px;">${tag}</span>
              </p>

              <a href="${releaseUrl}" style="display:inline-block;background:#2da44e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;">View on GitHub &rarr;</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f6f8fa;border-top:1px solid #e8eaed;padding:20px 40px;">
              <p style="margin:0;font-size:12px;color:#8c959f;">
                You're receiving this because you subscribed to release notifications for <strong>${repo}</strong>.
                &nbsp;<a href="${unsubscribeUrl}" style="color:#8c959f;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
