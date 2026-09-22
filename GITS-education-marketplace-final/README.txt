GITS EDUCATION MARKETPLACE - M-PESA REGISTRATION

Registration payment:
- Fee: KSh 300
- Till: 1745713
- Transaction type: CustomerBuyGoodsOnline

NEW RENDER ENVIRONMENT VARIABLES
Keep your existing:
MONGODB_URI
ADMIN_KEY

Add:
MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=YOUR_DARAJA_CONSUMER_KEY
MPESA_CONSUMER_SECRET=YOUR_DARAJA_CONSUMER_SECRET
MPESA_SHORTCODE=1745713
MPESA_PASSKEY=YOUR_DARAJA_PASSKEY
MPESA_CALLBACK_URL=https://gits-education.onrender.com/api/mpesa/callback

Optional:
DIRECT_REFERRAL_BONUS=50
INDIRECT_REFERRAL_BONUS=30

IMPORTANT:
1. Never put Consumer Secret or Passkey in frontend HTML.
2. Sandbox testing uses Safaricom's sandbox credentials/test setup. A live Till cannot be treated as a sandbox payment destination simply by changing the number.
3. For live payments, change MPESA_ENV to production and use the live credentials/production configuration provided by Safaricom after Go Live.
4. The callback URL must be publicly reachable over HTTPS.
5. The server only creates the user after the M-Pesa callback reports a successful KSh 300 transaction.
