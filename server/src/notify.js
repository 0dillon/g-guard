import nodemailer from 'nodemailer';

const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

/**
 * Alert the accountability friend. `photo` is an optional data: URL (jpeg),
 * only present when the user turned the photo option on.
 */
export async function alertFriend(user, { domain, todayCount, penaltyCents, chargeStatus, photo }) {
  const amount = (penaltyCents / 100).toFixed(2);
  const lines = [
    `Hi ${user.friend_name},`,
    '',
    `${user.name} asked you to be their accountability partner.`,
    `They just tried to open a blocked site (${domain}) at ${new Date().toLocaleString()}.`,
    `Attempts today: ${todayCount}. Their streak has been reset to 0.`,
    penaltyCents > 0 ? chargeStatus === 'succeeded'
      ? `Penalty: $${amount} charged and owed to you.`
      : `Penalty: $${amount} (not collected: ${chargeStatus}).` : '',
    '',
    'Maybe check in with them.',
  ];
  const attachments = photo
    ? [{ filename: 'snapshot.jpg', content: photo.split(',')[1], encoding: 'base64' }]
    : [];
  await sendToFriend(user, `Accountability alert for ${user.name}`, lines.join('\n'), attachments);
}

export function sendToFriend(user, subject, text, attachments = []) {
  return sendEmail(user.friend_email, subject, text, attachments);
}

export async function sendEmail(to, subject, text, attachments = []) {
  const msg = {
    from: process.env.MAIL_FROM || 'Goon <alerts@example.com>',
    to,
    subject,
    text,
    attachments,
  };

  if (!transport) {
    console.log('[mail:dry-run]', { to: msg.to, subject: msg.subject, attachments: attachments.length }, '\n' + msg.text);
    return;
  }
  await transport.sendMail(msg);
}
