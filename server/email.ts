import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  console.warn('⚠️ RESEND_API_KEY not set — emails will be disabled');
}

const resend = apiKey ? new Resend(apiKey) : null;

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!resend) {
    console.warn('📧 [Resend] Skipping email — RESEND_API_KEY not configured');
    return false;
  }

  try {
    console.log('📧 [Resend] Sending email...', {
      to: params.to,
      from: params.from,
      subject: params.subject,
      hasText: !!params.text,
      hasHtml: !!params.html,
    });

    const { data, error } = await resend.emails.send({
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text ?? params.subject,
      html: params.html,
    });

    if (error) {
      console.error('❌ [Resend] Email failed:', error);
      throw new Error(error.message);
    }

    console.log('📧 [Resend] Email sent successfully. ID:', data?.id);
    return true;
  } catch (error) {
    console.error('❌ [Resend] Email sending failed:', error);
    throw error;
  }
}
