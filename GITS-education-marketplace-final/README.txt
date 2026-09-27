GITS EDUCATION - PAYHERO + MULTI-EBOOK CART

This version uses PayHero's Kenya Collections endpoint for M-Pesa STK Push:
POST https://backend.payhero.co.ke/api/v2/payments/initiate-stk-push

Features:
- PayHero M-Pesa STK Push to Till 1745713 via the configured channel_id.
- KSh 300 registration payment.
- Multi-ebook cart and one STK Push for the full cart total.
- PayHero callback records successful ebook purchases.
- Existing referral and admin features retained.

Render environment variables:
PAYHERO_BASE_URL=https://backend.payhero.co.ke/api/v2
PAYHERO_USERNAME=your PayHero API username
PAYHERO_PASSWORD=your PayHero API password
PAYHERO_CHANNEL_ID=your PayHero channel ID
PAYHERO_ACCOUNT_ID=your PayHero account ID (kept for compatibility)
PAYHERO_PROVIDER=m-pesa
PAYHERO_CALLBACK_URL=https://gits-education.onrender.com/api/payhero/callback
MPESA_TILL=1745713

Keep API credentials and ADMIN_KEY private.
