# LocHire domain setup

The domain has been added to Vercel and Resend. DNS is currently served by WhoGoHost / GO54 (`nsc.go54.com` and `nsd.go54.com`). Add these records to that provider's DNS manager; keep the existing nameservers and unrelated records. Use TTL 300 seconds or Auto. These are public DNS values, not API secrets.

| Type | Host / Name | Value |
| --- | --- | --- |
| A | @ | 216.198.79.1 |
| A | @ | 64.29.17.1 |
| CNAME | www | 3b91d56d102f5676.vercel-dns-017.com |
| TXT | resend._domainkey | Copy the full DKIM value below |
| CNAME | rsend | rsend-euw1.forge.rmta.net |
| CNAME | send | send.forge.rmta.net |
| TXT | _dmarc | v=DMARC1; p=none; |

The two A values are Vercel's recommended rank-one addresses for this project. If the manager accepts only one apex address, use 216.198.79.1. The www domain redirects to lochire.ng.

Full DKIM TXT value (one record, one continuous value):

```text
p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBfxPqhiDzhUyx4QkPYzhFIkPZIFBYHT1pY91NyJnbvImgH/3XhvK5+Cqtgf70Jme5DuWf7E0MvnaBN3kirN985EGTvHYdk4mIUmSDQxj1nksEjfZ1WpO3G/7Urag/BWRvN6j43pOWtJVCY2BKs12X6L9Kwpbia5FZjZBQ8KwegwIDAQAB
```

Resend domain: https://resend.com/domains/7e6f8719-9088-4986-bc91-c7c27d925e01

After DNS is saved:

1. Check the records and HTTPS at lochire.ng and www.lochire.ng.
2. Press “Verify DNS Records” in Resend and wait for Verified sending.
3. Set backend EMAIL_FROM to `LocHire <accounts@lochire.ng>`, EMAIL_MODE to `production`, APP_ORIGIN to `https://lochire.ng`, and ALLOWED_APP_ORIGINS to `https://lochire.vercel.app`. Remove EMAIL_TEST_RECIPIENT and redeploy the saved backend version.
4. Set the Vercel production APP_ORIGIN to `https://lochire.ng` and ALLOWED_APP_ORIGINS to `https://lochire.vercel.app`, then rebuild the frontend. This keeps both addresses usable while email links use the new domain.
5. Confirm a real verification and reset email arrives from the verified sender. Current test sending remains owner-only until verification is complete.
