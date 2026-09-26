GITS Education Marketplace

PAYHERO + CART UPDATE

This version includes:
- PayHero M-Pesa STK Push using the current initiate-stk-push endpoint.
- Existing KSh 300 paid registration flow.
- Multi-ebook shopping cart.
- Checkout that totals all selected ebooks and sends ONE STK Push for the full amount.
- PayHero callback processing that records each purchased ebook after successful payment.
- Dashboard purchase list with ebook links when fileUrl is configured by admin.

Render environment variables:
MONGODB_URI=your MongoDB connection string
ADMIN_KEY=your admin key
PAYHERO_BASE_URL=https://backend.payhero.co.ke/api/v2
PAYHERO_USERNAME=your PayHero API username
PAYHERO_PASSWORD=your PayHero API password
PAYHERO_CHANNEL_ID=your PayHero channel ID
PAYHERO_ACCOUNT_ID=your PayHero account ID (kept for compatibility)
PAYHERO_PROVIDER=m-pesa
PAYHERO_CALLBACK_URL=https://gits-education.onrender.com/api/payhero/callback
MPESA_TILL=1745713

Important:
- Do not put quotes around environment variable values.
- Keep PAYHERO_PASSWORD and ADMIN_KEY private.
- The PayHero callback URL must be registered/allowed in the PayHero configuration if PayHero requires it.
- Admin can set each ebook's fileUrl. After a successful payment, the purchased ebook appears in the customer's dashboard with an Open Ebook button.
