import { Pool } from 'pg';

const E2E_DB_URL = 'postgresql://notifier:notifier@localhost:5434/notifier_e2e';

/* The unsubscribe token is only delivered to the user inside release notification
   emails, which require the scanner to detect a real GitHub release. That cannot
   be triggered in the E2E environment, so we read the token directly from the DB. */
export async function getUnsubscribeToken(email: string): Promise<string> {
  const pool = new Pool({ connectionString: E2E_DB_URL });
  try {
    const res = await pool.query<{ unsubscribe_token: string }>(
      'SELECT unsubscribe_token FROM subscriptions WHERE email = $1 LIMIT 1',
      [email],
    );
    if (!res.rows[0]) throw new Error(`No subscription found for ${email}`);
    return res.rows[0].unsubscribe_token;
  } finally {
    await pool.end();
  }
}
