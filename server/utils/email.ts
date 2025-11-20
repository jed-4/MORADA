import { Resend } from 'resend';

// Check if API key is configured
if (!process.env.RESEND_API_KEY) {
  console.error('⚠️  RESEND_API_KEY is not set - email functionality will not work');
}

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendInvitationEmailParams {
  to: string;
  inviterName: string;
  companyName: string;
  inviteUrl: string;
  recipientName?: string;
}

export async function sendInvitationEmail({
  to,
  inviterName,
  companyName,
  inviteUrl,
  recipientName,
}: SendInvitationEmailParams) {
  console.log(`📧 Attempting to send invitation email to ${to}`);
  console.log(`   API Key configured: ${process.env.RESEND_API_KEY ? 'YES' : 'NO'}`);
  
  const greeting = recipientName ? `Hi ${recipientName}` : 'Hi there';
  
  try {
    const { data, error } = await resend.emails.send({
      from: 'BuildPro <onboarding@resend.dev>',
      to: [to],
      subject: `You've been invited to join ${companyName} on BuildPro`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BuildPro Invitation</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td align="center" style="padding: 40px 0;">
                  <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">BuildPro</h1>
                      </td>
                    </tr>
                    
                    <!-- Body -->
                    <tr>
                      <td style="padding: 40px;">
                        <h2 style="margin: 0 0 16px; color: #1a1a1a; font-size: 24px; font-weight: 600;">
                          ${greeting},
                        </h2>
                        
                        <p style="margin: 0 0 24px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                          <strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> on BuildPro, the construction project management platform.
                        </p>
                        
                        <p style="margin: 0 0 32px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                          Click the button below to accept your invitation and set up your account:
                        </p>
                        
                        <!-- Button -->
                        <table role="presentation" style="width: 100%;">
                          <tr>
                            <td align="center">
                              <a href="${inviteUrl}" 
                                 style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                                Accept Invitation
                              </a>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="margin: 32px 0 0; color: #718096; font-size: 14px; line-height: 1.6;">
                          Or copy and paste this link into your browser:<br>
                          <a href="${inviteUrl}" style="color: #667eea; word-break: break-all;">${inviteUrl}</a>
                        </p>
                        
                        <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;">
                        
                        <p style="margin: 0; color: #a0aec0; font-size: 13px; line-height: 1.5;">
                          This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="padding: 24px 40px; text-align: center; background-color: #f7fafc; border-radius: 0 0 8px 8px;">
                        <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                          © ${new Date().getFullYear()} BuildPro. All rights reserved.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('❌ Resend API error:', JSON.stringify(error, null, 2));
      throw new Error(`Failed to send email: ${error.message || 'Unknown error'}`);
    }

    console.log('✅ Invitation email sent successfully!');
    console.log(`   Email ID: ${data?.id}`);
    console.log(`   Sent to: ${to}`);
    return data;
  } catch (error: any) {
    console.error('❌ Error sending invitation email:');
    console.error(`   Error type: ${error.constructor.name}`);
    console.error(`   Error message: ${error.message}`);
    console.error(`   Full error:`, error);
    throw error;
  }
}
