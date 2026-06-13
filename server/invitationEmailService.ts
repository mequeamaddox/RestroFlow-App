import { sendEmail } from './email';
import type { InvitationToken } from '@shared/schema';

interface InvitationEmailData {
  recipientEmail: string;
  recipientName: string;
  inviterName: string;
  companyName: string;
  role: string;
  location?: string;
  department?: string;
  position?: string;
  invitationToken: string;
  expiresAt: Date;
  personalMessage?: string;
}

export class InvitationEmailService {
  private static readonly FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@restroflow.com';
  private static readonly APP_URL = process.env.APP_URL || 'https://restroflow.com';

  static generateInvitationHtml(data: InvitationEmailData): string {
    const invitationUrl = `${this.APP_URL}/invitation/accept/${data.invitationToken}`;
    const expiryText = data.expiresAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>You're Invited to Join RestroFlow</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              background-color: #f8f9fa;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              border-radius: 8px;
              overflow: hidden;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 40px 30px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 600;
            }
            .content {
              padding: 40px 30px;
            }
            .invitation-card {
              background-color: #f8f9fa;
              border-left: 4px solid #667eea;
              padding: 20px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .detail-row {
              display: flex;
              justify-content: space-between;
              margin: 8px 0;
              padding: 8px 0;
              border-bottom: 1px solid #e9ecef;
            }
            .detail-label {
              font-weight: 600;
              color: #6c757d;
            }
            .detail-value {
              color: #495057;
            }
            .cta-button {
              display: inline-block;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-decoration: none;
              padding: 16px 32px;
              border-radius: 6px;
              font-weight: 600;
              font-size: 16px;
              margin: 20px 0;
              text-align: center;
              box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);
              transition: transform 0.2s ease;
            }
            .cta-button:hover {
              transform: translateY(-1px);
            }
            .footer {
              background-color: #f8f9fa;
              padding: 30px;
              text-align: center;
              font-size: 14px;
              color: #6c757d;
              border-top: 1px solid #e9ecef;
            }
            .expiry-notice {
              background-color: #fff3cd;
              border: 1px solid #ffeaa7;
              color: #856404;
              padding: 15px;
              border-radius: 4px;
              margin: 20px 0;
              font-size: 14px;
            }
            .security-note {
              background-color: #d1ecf1;
              border: 1px solid #bee5eb;
              color: #0c5460;
              padding: 15px;
              border-radius: 4px;
              margin: 20px 0;
              font-size: 14px;
            }
            @media (max-width: 600px) {
              .container {
                margin: 10px;
                border-radius: 0;
              }
              .header, .content, .footer {
                padding: 20px;
              }
              .detail-row {
                flex-direction: column;
                gap: 4px;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🍽️ Welcome to RestroFlow</h1>
              <p style="margin: 10px 0 0; opacity: 0.9; font-size: 18px;">You've been invited to join the team!</p>
            </div>
            
            <div class="content">
              <h2 style="color: #333; margin-bottom: 20px;">Hi ${data.recipientName}!</h2>
              
              <p style="font-size: 16px; margin-bottom: 20px;">
                Great news! <strong>${data.inviterName}</strong> has invited you to join <strong>${data.companyName}</strong> 
                on RestroFlow, the comprehensive restaurant management platform.
              </p>

              <div class="invitation-card">
                <h3 style="margin-top: 0; color: #667eea;">Your Role Details</h3>
                <div class="detail-row">
                  <span class="detail-label">Position:</span>
                  <span class="detail-value">${data.role}</span>
                </div>
                ${data.position ? `
                <div class="detail-row">
                  <span class="detail-label">Job Title:</span>
                  <span class="detail-value">${data.position}</span>
                </div>
                ` : ''}
                ${data.department ? `
                <div class="detail-row">
                  <span class="detail-label">Department:</span>
                  <span class="detail-value">${data.department}</span>
                </div>
                ` : ''}
                ${data.location ? `
                <div class="detail-row">
                  <span class="detail-label">Location:</span>
                  <span class="detail-value">${data.location}</span>
                </div>
                ` : ''}
                <div class="detail-row">
                  <span class="detail-label">Invited by:</span>
                  <span class="detail-value">${data.inviterName}</span>
                </div>
              </div>

              ${data.personalMessage ? `
              <div style="margin: 24px 0; padding: 16px; border-radius: 6px; background: #eef7ff; border: 1px solid #d6ecff;">
                <strong>Message from ${data.inviterName}:</strong>
                <div style="white-space: pre-wrap; margin-top: 8px;">${data.personalMessage}</div>
              </div>
              ` : ''}

              <div style="text-align: center; margin: 30px 0;">
                <a href="${invitationUrl}" class="cta-button">Accept Invitation & Create Account</a>
              </div>

              <div class="expiry-notice">
                <strong>⏰ Important:</strong> This invitation expires on <strong>${expiryText}</strong>. 
                Please accept your invitation before then.
              </div>

              <div class="security-note">
                <strong>🔒 Security Note:</strong> This invitation link is unique to you and can only be used once. 
                If you didn't expect this invitation, please ignore this email.
              </div>

              <h3 style="color: #333; margin-top: 30px;">What happens next?</h3>
              <ol style="padding-left: 20px;">
                <li>Click the "Accept Invitation" button above</li>
                <li>Create your secure account with a password</li>
                <li>Access your personalized dashboard based on your role</li>
                <li>Start collaborating with your team immediately</li>
              </ol>

              <p style="margin-top: 30px;">
                If you have any questions about RestroFlow or need assistance, 
                please contact your manager or our support team.
              </p>

              <p style="margin-top: 20px;">
                Welcome to the team!<br>
                <strong>The RestroFlow Team</strong>
              </p>
            </div>
            
            <div class="footer">
              <p>This invitation was sent by ${data.companyName} via RestroFlow.</p>
              <p style="margin-top: 10px;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${invitationUrl}" style="color: #667eea; word-break: break-all;">${invitationUrl}</a>
              </p>
              <p style="margin-top: 20px; font-size: 12px;">
                RestroFlow - Restaurant Management Made Simple<br>
                © 2024 RestroFlow. All rights reserved.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  static generateInvitationText(data: InvitationEmailData): string {
    const invitationUrl = `${this.APP_URL}/invitation/accept/${data.invitationToken}`;
    const expiryText = data.expiresAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    return `
Welcome to RestroFlow!

Hi ${data.recipientName}!

Great news! ${data.inviterName} has invited you to join ${data.companyName} on RestroFlow, the comprehensive restaurant management platform.

Your Role Details:
- Position: ${data.role}
${data.position ? `- Job Title: ${data.position}` : ''}
${data.department ? `- Department: ${data.department}` : ''}
${data.location ? `- Location: ${data.location}` : ''}
- Invited by: ${data.inviterName}

${data.personalMessage ? `\nMessage from ${data.inviterName}:\n${data.personalMessage}\n` : ''}

To accept your invitation and create your account, please visit:
${invitationUrl}

IMPORTANT: This invitation expires on ${expiryText}. Please accept your invitation before then.

What happens next:
1. Click the invitation link above
2. Create your secure account with a password
3. Access your personalized dashboard based on your role
4. Start collaborating with your team immediately

If you have any questions about RestroFlow or need assistance, please contact your manager or our support team.

Welcome to the team!
The RestroFlow Team

---
This invitation was sent by ${data.companyName} via RestroFlow.
RestroFlow - Restaurant Management Made Simple
© 2024 RestroFlow. All rights reserved.
    `.trim();
  }

  static async sendInvitationEmail(
    invitation: InvitationToken,
    inviterName: string,
    companyName: string,
    locationName?: string,
    departmentName?: string,
    positionTitle?: string
  ): Promise<boolean> {
    try {
      if (!invitation.token) {
        console.error('❌ Invitation token missing for', invitation.email);
        throw new Error('Invitation token not generated');
      }

      const emailData: InvitationEmailData = {
        recipientEmail: invitation.email,
        recipientName: `${invitation.firstName} ${invitation.lastName}`.trim() || invitation.email,
        inviterName,
        companyName,
        role: invitation.role,
        location: locationName,
        department: departmentName,
        position: positionTitle,
        invitationToken: invitation.token,
        expiresAt: new Date(invitation.expiresAt),
        personalMessage: invitation.personalMessage || undefined,
      };

      const htmlContent = this.generateInvitationHtml(emailData);
      const textContent = this.generateInvitationText(emailData);

      await sendEmail({
        to: invitation.email,
        from: this.FROM_EMAIL,
        subject: `You're invited to join ${companyName} on RestroFlow`,
        html: htmlContent,
        text: textContent,
      });

      console.log(`📧 Invitation email sent successfully to ${invitation.email}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send invitation email to ${invitation.email}:`, error);
      throw error;
    }
  }

  static async sendInvitationReminderEmail(
    invitation: InvitationToken,
    inviterName: string,
    companyName: string,
    locationName?: string,
    departmentName?: string,
    positionTitle?: string
  ): Promise<boolean> {
    try {
      if (!invitation.token) {
        console.error('❌ Invitation token missing for', invitation.email);
        throw new Error('Invitation token not generated');
      }

      const emailData: InvitationEmailData = {
        recipientEmail: invitation.email,
        recipientName: `${invitation.firstName} ${invitation.lastName}`.trim() || invitation.email,
        inviterName,
        companyName,
        role: invitation.role,
        location: locationName,
        department: departmentName,
        position: positionTitle,
        invitationToken: invitation.token,
        expiresAt: new Date(invitation.expiresAt),
        personalMessage: invitation.personalMessage || undefined,
      };

      const invitationUrl = `${this.APP_URL}/invitation/accept/${invitation.token}`;
      
      const reminderHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reminder: Your RestroFlow Invitation</title>
            <style>
              /* Same styles as invitation email */
              body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background-color: #f8f9fa; }
              .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-radius: 8px; overflow: hidden; }
              .header { background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); color: white; padding: 40px 30px; text-align: center; }
              .content { padding: 40px 30px; }
              .cta-button { display: inline-block; background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 6px; font-weight: 600; font-size: 16px; margin: 20px 0; }
              .expiry-notice { background-color: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 4px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>⏰ Reminder: RestroFlow Invitation</h1>
                <p style="margin: 10px 0 0; opacity: 0.9;">Don't miss your chance to join the team!</p>
              </div>
              <div class="content">
                <h2>Hi ${emailData.recipientName}!</h2>
                <p>This is a friendly reminder that you have a pending invitation to join <strong>${companyName}</strong> on RestroFlow.</p>
                <div class="expiry-notice">
                  <strong>⏰ Urgent:</strong> Your invitation expires soon. Please accept it before it's too late!
                </div>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${invitationUrl}" class="cta-button">Accept Invitation Now</a>
                </div>
                <p>If you have any questions, please contact ${inviterName} or our support team.</p>
              </div>
            </div>
          </body>
        </html>
      `;

      await sendEmail({
        to: invitation.email,
        from: this.FROM_EMAIL,
        subject: `Reminder: Your invitation to join ${companyName} expires soon`,
        html: reminderHtml,
        text: `Reminder: Your invitation to join ${companyName} on RestroFlow is expiring soon. Please visit ${invitationUrl} to accept your invitation.`,
      });

      console.log(`📧 Reminder email sent successfully to ${invitation.email}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send reminder email to ${invitation.email}:`, error);
      throw error;
    }
  }
}