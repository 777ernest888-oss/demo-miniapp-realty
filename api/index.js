Thank you for reaching out and providing such detailed troubleshooting information. I understand how frustrating it is when your site works on desktop but fails on mobile devices.

Based on our system diagnostics, your domain's DNS is healthy and pointing directly to Vercel's Anycast IP addresses. The SSL certificate is correctly issued by Let's Encrypt and is valid until September 26, 2026.

Because the configuration itself is valid, the behavior you are describing is a classic symptom of an ISP-level or carrier-level network block. In some countries, including Russia, certain mobile networks (such as MTS, Megafon, Beeline, or Tele2) aggressively filter and block specific Anycast IP ranges, including those used by Vercel. Broadband ISPs used by your desktop browser may not have implemented these restrictions yet, which is why it works there but fails on mobile.

To confirm whether this is indeed an ISP or regional block, here is what you can do:

- **Test with a VPN:** Connect your mobile device to a VPN and try accessing the site again. If the site loads successfully over the VPN, it confirms that your mobile carrier is blocking the connection.

- **Run the Diagnostic Script:** You can run our local connectivity debug script from a device on the affected network to gather precise routing and block information. The script is available at the [Vercel Connect Debug GitHub repository](https://github.com/vercel-support/vercel-connect-debug).

If you are on a macOS or Linux machine:

```bash
curl -s https://raw.githubusercontent.com/vercel-support/vercel-connect-debug/main/vercel-debug.sh | bash | tee vercel-debug.txt
```

If you are on a Windows machine:

```powershell
Invoke-RestMethod -Uri https://raw.githubusercontent.com/vercel-support/vercel-connect-debug/main/vercel-debug.ps1 | Invoke-Expression | tee vercel-debug.txt
```

If a regional block is confirmed, here are the most effective ways to resolve it:

- **Contact your ISP/Carrier:** You can reach out directly to the affected network providers and request that they unblock Vercel's services.

- **Use a Proxy/CDN:** You can route your traffic through a DNS proxy service such as Cloudflare. This assigns Cloudflare's unblocked IP addresses to your domain while still proxying the actual application delivery through Vercel.

For more details on resolving these network blockages, please review our [Troubleshooting Connectivity Issues Guide](https://vercel.com/kb/guide/troubleshooting-connectivity-issues).

If you would like our support team to investigate the network routing further, I have prepared a support case for you. You can review the prefilled details and submit the form directly below this message!
