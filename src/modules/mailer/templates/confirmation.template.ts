export function confirmationEmailHtml(
  confirmUrl: string,
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
              <p style="margin:0;font-size:18px;font-weight:600;color:#ffffff;">&#x2709;&#xFE0F; Confirm your email</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px;font-size:16px;color:#24292f;">Thanks for subscribing to GitHub release notifications!</p>
              <p style="margin:0 0 32px;font-size:14px;color:#57606a;line-height:1.6;">
                Click the button below to confirm your email address and activate your subscription.
              </p>

              <a href="${confirmUrl}" style="display:inline-block;background:#2da44e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;">Confirm subscription &rarr;</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f6f8fa;border-top:1px solid #e8eaed;padding:20px 40px;">
              <p style="margin:0;font-size:12px;color:#8c959f;">
                If you didn't request this, you can safely ignore this email - no account will be created.
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
