# WhatsApp Business API Setup Guide

## Prerequisites
- WhatsApp Business Account
- Facebook Business Manager account
- Verified business phone number
- Business website (optional but recommended)

## Step 1: Create WhatsApp Business Account

1. Go to [Facebook Business Manager](https://business.facebook.com)
2. Click **Create Account**
3. Enter business details:
   - Business name
   - Your name
   - Business email

## Step 2: Add WhatsApp Product

1. In Business Manager, go to **Business Settings**
2. Click **Accounts** → **WhatsApp Accounts**
3. Click **Add** → **Create a WhatsApp Business Account**
4. Follow the setup wizard

## Step 3: Register Phone Number

1. Click **Add Phone Number**
2. Choose verification method:
   - SMS verification
   - Voice call verification
3. Enter verification code
4. Set display name for your business

## Step 4: Get API Credentials

1. Go to **WhatsApp** → **API Setup**
2. Copy the following:
   - Phone Number ID
   - WhatsApp Business Account ID
   - Access Token (Temporary - expires in 24 hours)

## Step 5: Generate Permanent Access Token

1. Go to **Business Settings** → **System Users**
2. Create new system user for the bot
3. Add WhatsApp permissions:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
4. Generate permanent token
5. **Save this token securely!**

## Step 6: Configure Webhook

1. In WhatsApp API settings, click **Configuration**
2. Edit webhook:
   - Callback URL: `https://your-botpress-url/webhook`
   - Verify Token: (create a random string)
3. Subscribe to webhook fields:
   - `messages`
   - `message_status`
   - `message_template_status_update`

## Step 7: Update Environment Variables

Add to your `.env` file:
```
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id
WHATSAPP_ACCESS_TOKEN=your_permanent_access_token
WHATSAPP_VERIFY_TOKEN=your_verify_token
```

## Step 8: Test Connection

1. Send a test message to your WhatsApp number
2. Check Botpress logs for incoming webhook
3. Verify bot responds correctly

## Important Notes

- **Messaging Limits:** New accounts start with 250 messages/day
- **Template Messages:** Required for first contact with customers
- **Pricing:** First 1,000 conversations/month are free
- **Business Verification:** Required for higher message limits

## Troubleshooting

**Webhook not receiving messages:**
- Verify webhook URL is publicly accessible
- Check verify token matches
- Ensure webhook is subscribed to correct fields

**Access token expired:**
- Tokens expire after 60 days
- Set up automatic token refresh
- Use system user token (permanent)

## Next Steps

- Create message templates for notifications
- Set up quick replies for common queries
- Configure business hours

---

*Detailed instructions will be added in Phase 2.*