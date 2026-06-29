export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">Last updated: June 2026</p>

        <div className="space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-3">The service</h2>
            <p className="text-muted-foreground leading-relaxed">
              Morada is a project management platform operated by Lighthouse Projects (ABN: 26 683 914 516). By creating
              an account you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Subscription and billing</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>14-day free trial on all plans, no credit card required</li>
              <li>After the trial, a valid payment method is required to continue</li>
              <li>Subscriptions are billed monthly or annually in AUD, inclusive of GST</li>
              <li>Cancellation takes effect at the end of the current billing period — access continues until then</li>
              <li>Fees paid are non-refundable except where required by the Australian Consumer Law</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Acceptable use</h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree not to: use the service for unlawful purposes, attempt to reverse engineer the platform, share
              your account credentials, or use the service to store or transmit malicious code.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Intellectual property</h2>
            <p className="text-muted-foreground leading-relaxed">
              Morada owns the platform, code, and all related intellectual property. You retain ownership of all data you
              upload or create within the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Data on cancellation</h2>
            <p className="text-muted-foreground leading-relaxed">
              You have 30 days after cancellation to export your data. After this period, your data may be permanently
              deleted. We are not liable for data loss following this period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Not professional advice</h2>
            <p className="text-muted-foreground leading-relaxed">
              Morada is a project management tool only. Nothing in the service constitutes financial, legal, or
              construction advice. You are responsible for verifying the accuracy of data you enter and decisions you make
              based on information in the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Third-party services</h2>
            <p className="text-muted-foreground leading-relaxed">
              The service integrates with third-party providers including Stripe, Xero, and others. We are not liable for
              outages, errors, or data loss caused by these third-party services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Limitation of liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the maximum extent permitted by law, Morada's total liability to you for any claim arising from your use
              of the service is limited to the total fees you paid in the 12 months preceding the claim. We are not liable
              for indirect, consequential, or incidental losses including lost profits or lost data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Australian Consumer Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              Nothing in these terms excludes, restricts, or modifies any right or remedy you may have under the
              Australian Consumer Law. Where liability cannot be excluded, it is limited to the extent permitted by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Indemnification</h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree to indemnify and hold harmless Morada and Lighthouse Projects from any claims, losses, or damages
              arising from your misuse of the platform or your violation of these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">No warranty</h2>
            <p className="text-muted-foreground leading-relaxed">
              The service is provided "as is" without warranty of any kind. We do not guarantee uninterrupted access,
              error-free operation, or fitness for a particular purpose.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Force majeure</h2>
            <p className="text-muted-foreground leading-relaxed">
              We are not liable for any failure or delay caused by circumstances beyond our reasonable control, including
              internet outages, natural disasters, or third-party service failures.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Changes to these terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update these terms at any time. We will notify you by email at least 30 days before material changes
              take effect. Continued use of the service after that date constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Dispute resolution</h2>
            <p className="text-muted-foreground leading-relaxed">
              In the event of a dispute, both parties agree to attempt resolution through good faith negotiation, then
              mediation, before commencing litigation. These terms are governed by the laws of New South Wales, Australia.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              <a href="mailto:hello@moradaco.com.au" className="text-primary underline">hello@moradaco.com.au</a> — Last
              updated: June 2026
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
