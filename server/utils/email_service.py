import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import Config
import logging

logger = logging.getLogger(__name__)

class EmailService:
    """Email service for sending verification emails"""
    
    @staticmethod
    @staticmethod
    def _build_message(subject, recipient_email, plain_text, html_content):
        message = MIMEMultipart('alternative')
        message['Subject'] = subject
        message['From'] = Config.SMTP_EMAIL
        message['To'] = recipient_email
        message.attach(MIMEText(plain_text, 'plain'))
        message.attach(MIMEText(html_content, 'html'))
        return message

    @staticmethod
    def _send_message(message):
        with smtplib.SMTP(Config.SMTP_SERVER, Config.SMTP_PORT) as server:
            server.starttls()
            server.login(Config.SMTP_EMAIL, Config.SMTP_PASSWORD)
            server.send_message(message)

    @staticmethod
    def send_verification_email(recipient_email, verification_link):
        """Send verification email to user (DRY implementation)."""
        subject = 'Email Verification - Test'
        plain_text = f"""
Dear User,

Please verify your email address by clicking the link below:

{verification_link}

This link will expire in 24 hours.

If you did not create this account, please ignore this email.

Best regards,
Test Team
        """
        html = f"""
<html>
  <body>
    <div style="font-family: Arial, sans-serif; background-color: #f5f5f5; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h2 style="color: #6c3fb5; text-align: center;">Email Verification</h2>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">Dear User,</p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">Thank you for registering with Test. Please verify your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;"><a href="{verification_link}" style="background-color: #6c3fb5; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: bold; display: inline-block;">Verify Email</a></div>
        <p style="color: #6c3fb5; font-size: 12px; word-break: break-all;">{verification_link}</p>
        <p style="color: #999; font-size: 12px; line-height: 1.6; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 20px;">This link will expire in 24 hours. If you did not create this account, please ignore this email.</p>
        <p style="color: #999; font-size: 12px;">Best regards,<br>Test Team</p>
      </div>
    </div>
  </body>
</html>
        """
        try:
            msg = EmailService._build_message(subject, recipient_email, plain_text, html)
            EmailService._send_message(msg)
            logger.info(f"Verification email sent to {recipient_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {recipient_email}: {str(e)}")
            if Config.FLASK_ENV == 'development':
                logger.warning("Email sending failed, but continuing in development mode")
                return True
            return False

    @staticmethod
    def send_resend_verification_email(recipient_email, verification_link):
        return EmailService.send_verification_email(recipient_email, verification_link)

    @staticmethod
    def send_reset_password_email(recipient_email, reset_link):
        """Send password reset email to user (DRY implementation)."""
        subject = 'Password Reset - Test'
        plain_text = f"""
Dear User,

We received a request to reset your password. Click the link below to reset it:

{reset_link}

This link will expire in 24 hours.

If you did not request a password reset, please ignore this email.

Best regards,
Test Team
        """
        html = f"""
<html>
  <body>
    <div style="font-family: Arial, sans-serif; background-color: #f5f5f5; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h2 style="color: #6c3fb5; text-align: center;">Password Reset</h2>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">Dear User,</p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">We received a request to reset your password. Click the button below to reset it:</p>
        <div style="text-align: center; margin: 30px 0;"><a href="{reset_link}" style="background-color: #6c3fb5; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: bold; display: inline-block;">Reset Password</a></div>
        <p style="color: #6c3fb5; font-size: 12px; word-break: break-all;">{reset_link}</p>
        <p style="color: #999; font-size: 12px; line-height: 1.6; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 20px;">This link will expire in 24 hours. If you did not request a password reset, please ignore this email.</p>
        <p style="color: #999; font-size: 12px;">Best regards,<br>Test Team</p>
      </div>
    </div>
  </body>
</html>
        """
        try:
            msg = EmailService._build_message(subject, recipient_email, plain_text, html)
            EmailService._send_message(msg)
            logger.info(f"Password reset email sent to {recipient_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send password reset email to {recipient_email}: {str(e)}")
            if Config.FLASK_ENV == 'development':
                logger.warning("Email sending failed, but continuing in development mode")
                return True
            return False

