"use client"

import Link from "next/link"
import { useBranding } from "@/lib/branding-context"

export default function PrivacyPolicyPage() {
  const branding = useBranding()
  const company = branding.name || "Byte-Back"
  const supportEmail = branding.supportEmail
  const contactNote = supportEmail
    ? `contact us at ${supportEmail}`
    : "contact your account administrator or your assigned Byte-Back representative"

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-medium text-primary hover:underline"
          >
            &larr; Back to Home
          </Link>
          <span className="text-xs text-muted-foreground">{company}</span>
        </div>

        <header className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            How {company} collects, uses, and protects your information across the
            Device Lifecycle Management (DLM 2.0) platform.
          </p>
        </header>

        <article className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              1. Overview
            </h2>
            <p>
              This Privacy Policy explains how {company} (&ldquo;we,&rdquo;
              &ldquo;us,&rdquo; or &ldquo;{company}&rdquo;) handles information
              collected through the DLM 2.0 platform, our device trade-in,
              IT asset disposition (ITAD), certified pre-owned (CPO), and
              certificate-of-erase (COE) inspection services. {company} acts as a
              data processor on behalf of the organizations (customers, VARs, and
              resellers) that use the platform, and as a controller for the
              limited account and support data we maintain directly. This policy
              applies to all visitors and authenticated users of our public and
              customer-facing services.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              2. Information We Collect
            </h2>
            <p className="mb-3">
              We collect the following categories of information necessary to
              operate the platform:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <span className="font-medium text-foreground">
                  Account data:
                </span>{" "}
                name, email address, role, and authentication credentials for
                users who sign in to the platform.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Organization data:
                </span>{" "}
                company name, billing address, tax identifiers, and tenant
                configuration supplied by the subscribing organization or its
                VAR/reseller partner.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Device, serial, and IMEI data:
                </span>{" "}
                device make, model, serial numbers, IMEI/MEID identifiers,
                condition assessments, and grading photos submitted through
                trade-in, CPO, and COE inspection workflows.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Payment and billing metadata:
                </span>{" "}
                order references, transaction identifiers, and invoice metadata
                required to process trade-in payouts and subscriptions. We do not
                store full card numbers; card data is handled by our PCI-compliant
                payment processor.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Support communications:
                </span>{" "}
                messages, tickets, and attachments you send to our support team.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Technical and log data:
                </span>{" "}
                IP address, browser and device type, pages visited, and standard
                server logs used for security, debugging, and analytics.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              3. How We Use Information
            </h2>
            <p>
              We use the information described above to operate and improve the
              platform. Specifically, we use it to generate trade-in price quotes,
              perform COE inspection and data-erasure certification, arrange
              shipping and logistics for device intake and return, process
              billing and trade-in payouts, provide customer and technical
              support, and maintain audit records. We also use the information to
              meet our contractual, tax, accounting, and legal obligations, and to
              detect, investigate, and prevent fraud or misuse of the service.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              4. Data Sharing
            </h2>
            <p>
              We share information only with the parties necessary to deliver the
              service. This includes authorized VAR and reseller partners who
              manage your organization&rsquo;s account, and vetted service
              providers such as shipping carriers, payment processors, and
              cloud-hosting vendors that help us fulfill trade-in, inspection, and
              ITAD workflows. We may also disclose information when required by
              law or to protect the rights, property, or safety of {company}, our
              users, or the public. {company} does not sell personal data to third
              parties under any circumstances.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              5. Data Retention &amp; Security
            </h2>
            <p>
              We retain personal and device data only as long as your organization
              maintains an active account or as required to satisfy legal, tax,
              and contractual obligations, after which it is deleted or
              anonymized. Device serial, IMEI, and COE erasure records may be
              retained for the warranty and compliance periods associated with
              ITAD services. We protect data with encryption in transit and at
              rest, role-based access controls, audit logging, and regular
              security reviews. You should notify us promptly if you suspect
              unauthorized access to your account.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              6. Your Rights
            </h2>
            <p>
              Depending on your jurisdiction, you may have the right to access the
              personal data we hold about you, request correction of inaccurate
              data, and request deletion of your data where it is no longer
              required for the purposes described in this policy. Because {company}{" "}
              typically processes data on behalf of your organization, many
              requests should be directed to your account administrator, who can
              submit verified requests to us. To exercise your rights, you may{" "}
              {contactNote}.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              7. Contact
            </h2>
            <p>
              If you have questions about this policy or our data practices,
              please {contactNote}. For data-subject requests, include the name of
              your organization and the email associated with your account so we
              can verify and route your request appropriately.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              8. Changes to this Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time to reflect
              changes in our practices or applicable law. Material changes will be
              communicated through the platform or by email to account
              administrators, and the updated policy will indicate its effective
              date. Continued use of the platform after changes take effect
              constitutes acceptance of the revised policy.
            </p>
          </section>
        </article>

        <footer className="mt-12 border-t pt-6 text-center text-xs text-muted-foreground">
          <p>
            &copy; {new Date().getFullYear()} {company}. All rights reserved.
          </p>
          <Link
            href="/"
            className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
          >
            Return to Home
          </Link>
        </footer>
      </div>
    </main>
  )
}