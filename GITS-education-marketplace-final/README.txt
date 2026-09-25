GITS EDUCATION MARKETPLACE - PAYHERO M-PESA REGISTRATION

Registration payment:
- Fee: KSh 300
- M-Pesa Till: 1745713
- Payment gateway: PayHero
- PayHero sends the customer's M-Pesa STK Push and routes the money to the registered Till.

RENDER ENVIRONMENT VARIABLES

Keep your existing:
MONGODB_URI
ADMIN_KEY

Remove the old Safaricom/Daraja variables:
MPESA_ENV
MPESA_CONSUMER_KEY
MPESA_CONSUMER_SECRET
MPESA_SHORTCODE
MPESA_PASSKEY
MPESA_CALLBACK_URL

Add these PayHero variables:
PAYHERO_BASE_URL=https://backend.payhero.co.ke/api/v2
PAYHERO_USERNAME=YOUR_PAYHERO_USERNAME
PAYHERO_PASSWORD=YOUR_PAYHERO_PASSWORD
PAYHERO_CHANNEL_ID=YOUR_REGISTERED_TILL_CHANNEL_ID
PAYHERO_ACCOUNT_ID=YOUR_PAYHERO_ACCOUNT_ID
PAYHERO_PROVIDER=m-pesa
PAYHERO_CALLBACK_URL=https://gits-education.onrender.com/api/payhero/callback

Optional:
MPESA_TILL=1745713
DIRECT_REFERRAL_BONUS=50
INDIRECT_REFERRAL_BONUS=30

IMPORTANT PAYHERO SETUP
1. Create/verify your PayHero account.
2. Register your M-Pesa Till 1745713 in PayHero as a payment channel.
3. PayHero gives that registered channel its own numeric Channel ID. The Channel ID is NOT the same thing as the Till number.
4. Get your PayHero API username/password and PayHero Account ID from your PayHero account/developer settings.
5. Put those values in Render Environment exactly as shown above.
6. Configure the callback URL in Render as:
   https://gits-education.onrender.com/api/payhero/callback
7. Deploy/redeploy after saving the variables.
8. The website still asks the customer for their M-Pesa phone number, then PayHero triggers the STK Push.
9. The website activates the GITS account only after PayHero's callback confirms a successful KSh 300 payment.

SECURITY
- Never put PayHero username/password in frontend HTML or JavaScript.
- Never commit secrets to GitHub.
- Keep the callback URL public HTTPS.
- A successful API request only starts/accepts the payment. The callback is used as the payment confirmation.

NOTE
Using PayHero does NOT create a second Till. The same Till 1745713 can be the destination, provided that Till is registered and active as a payment channel in your PayHero account.
