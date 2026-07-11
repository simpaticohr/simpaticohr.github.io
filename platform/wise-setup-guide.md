# Wise Business Account — Setup & Integration Guide

This guide outlines the steps to set up and manage a Wise Business Account for receiving international client payments in India for Simpatico HR Consultancy.

---

## 1. Registration & KYC (India Entity)

To receive business payments in India via Wise, register a **Wise Business Account** using the following details:

- **Entity Type:** Sole Proprietorship or Private Limited (use Proprietorship if running under personal PAN/GST, or Individual Freelancer account if GST is not available).
- **Required Documents:**
  - Owner's PAN Card
  - Owner's Aadhaar Card (for digital KYC verification)
  - Address Proof (Utility bill or bank statement)
  - Business details (Brief description of Simpatico HR: consulting and software services)
- **Account Verification Fee:** Wise charges a one-time setup fee (approx. ₹1,500 - ₹2,000) to activate local bank details.

---

## 2. Setting Up Local Account Details

Once verified, activate **Local Receiving Account Details** in the Wise dashboard for your target markets. This allows clients to pay via local bank transfers (ACH, SEPA, Faster Payments) which are free or extremely low cost:

| Currency | Local Account Type | Client Payment Method |
|---|---|---|
| **USD ($)** | US Routing & Account Number | ACH or Wire transfer (domestic to US client) |
| **GBP (£)** | UK Sort Code & Account Number | Faster Payments (FPS) (domestic to UK client) |
| **EUR (€)** | European IBAN & SWIFT/BIC | SEPA bank transfer (domestic to European client) |
| **AED (AED)** UAE | UAE IBAN & Swift | Local UAE bank transfer |
| **AUD (A$)** | Australian BSB & Account Number | Local bank transfer (Poli / PayID) |
| **CAD (C$)** | Canadian Transit, Institution & Account Number | EFT / Interac e-Transfer |

---

## 3. Invoicing Clients via Wise

To bill international clients:

1. **Use Simpatico HR Invoice Generator:**
   Create an invoice using the [Invoice Generator](file:///c:/Users/user/simpaticohr.github.io/platform/consulting-invoice.html) in the appropriate international currency.
2. **List Wise details on Invoice:**
   - Pre-fill your Wise-registered email: `info@simpaticohr.in`
   - Include the local account details corresponding to the client's currency (e.g., provide USD account details to US clients).
3. **Client Payment Process:**
   - The client logs into their local bank account or Wise account.
   - They send a domestic transfer to your provided local account number (looks like a domestic transaction to them).
   - Alternatively, they can send money to your Wise email (`info@simpaticohr.in`) directly.

---

## 4. RBI Compliance & FIRC (Foreign Inward Remittance Certificate)

Under RBI regulations, all foreign funds entering India must have a clear purpose code and supporting FIRC.

- **Auto-remittance to India:** Wise automatically converts incoming foreign currency (USD, GBP, etc.) to INR at the mid-market rate and transfers it to your linked Indian bank account (usually within a few hours).
- **FIRC / Purpose Codes:** 
  - Ensure you select the correct purpose code during setup (e.g., **P0802 - Software Consultancy** or **P1007 - Management Consulting / Advisory Services**).
  - Wise will issue a digital **e-FIRC** for every payment. Download and save these certificates for tax filing and audits.

---

## 5. Fee Comparison (Wise vs. Alternatives)

| Metric | Wise | PayPal | Stripe | Traditional Bank Wire (SWIFT) |
|---|---|---|---|---|
| **Exchange Rate** | Mid-market rate (no markup) | 2.5% - 4.0% markup | ~2.0% markup | 1.5% - 3.0% markup |
| **Transaction Fee** | ~0.4% - 0.7% | 4.4% + fixed fee | 4.3% + fixed fee | ₹500 - ₹2,000 (flat) |
| **FIRC Delivery** | Free (Digital download) | Paid (₹200 - ₹500/payment) | Paid / Indirect | Hard copy (requires bank visit) |
| **Client Experience** | Easy (pays local bank) | Requires card/account | Requires credit card | Complex SWIFT instructions |

---

> [!TIP]
> Always request clients to transfer using **Local Account Details** rather than SWIFT wires to minimize intermediary bank fees and maximize your payout.
