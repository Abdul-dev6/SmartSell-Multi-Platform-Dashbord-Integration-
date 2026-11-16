// /privacy: SmartSell Privacy Policy (Server Component). Keep the statements
// in line with what the code actually does (auth, stored fields, disconnect
// and deletion behaviour).

import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | SmartSell",
  description:
    "How SmartSell collects, uses, protects and deletes seller data, including data from Shopify and eBay.",
};

const LAST_UPDATED = "16 November 2026";
const CONTACT_EMAIL = "abdulqadeera584@gmail.com";

const sections = [
  {
    id: "who-we-are",
    title: "1. Who we are",
    body: (
      <p>
        SmartSell is a multi-channel e-commerce management dashboard operated by
        Abdul Qadeer, an independent software developer based in Lahore,
        Pakistan. SmartSell helps sellers manage their listings, prices,
        inventory and orders across Shopify and eBay from one place. Amazon
        support is in development; this policy will be updated before it is
        available.
      </p>
    ),
  },
  {
    id: "data-we-collect",
    title: "2. Data we collect",
    body: (
      <>
        <p>We collect only the data needed to run SmartSell:</p>
        <ul>
          <li>
            <strong>Account data:</strong> your name and email address. You
            can sign up with an email and password, or sign in with Google or
            GitHub. A password you create is stored only as a one-way hash; we
            cannot read it. When you use Google or GitHub, we never see or
            store your Google or GitHub password.
          </li>
          <li>
            <strong>Marketplace data:</strong> when you connect a store, we
            access your product listings, prices, inventory levels, orders,
            and fee and sales summaries for your own business. For eBay we
            also store your eBay user ID and username.
          </li>
          <li>
            <strong>Order customer details:</strong> for Shopify orders we
            store only the customer&apos;s name and email so you can see who
            placed an order. We do not store shipping or billing addresses,
            phone numbers or payment details.
          </li>
          <li>
            <strong>Authorization tokens:</strong> the access and refresh
            tokens each marketplace issues when you authorize SmartSell.
          </li>
          <li>
            <strong>Your own entries:</strong> calendar events, product costs
            and other details you add in the dashboard.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "3. How we use your data",
    body: (
      <ul>
        <li>To show your listings, inventory, orders and analytics in your dashboard.</li>
        <li>To send the changes you make (such as price or stock updates) to your connected marketplaces.</li>
        <li>To keep your account secure and fix technical problems.</li>
      </ul>
    ),
  },
  {
    id: "sharing",
    title: "4. Sharing",
    body: (
      <>
        <p>
          We do not sell, rent or share your data with any third party for
          their own purposes. Each seller can see only their own data.
        </p>
        <p>
          SmartSell runs on infrastructure providers that host the service:
          Vercel (application hosting) and MongoDB Atlas (database). They
          process data only to provide that hosting.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "5. Security",
    body: (
      <ul>
        <li>All traffic is encrypted in transit with HTTPS/TLS.</li>
        <li>Passwords are stored only as one-way hashes.</li>
        <li>eBay refresh tokens are encrypted before they are stored. Shopify access tokens are kept in a restricted field that is never sent to your browser.</li>
        <li>The database is encrypted at rest, and access to it is restricted.</li>
        <li>Every request is checked so that a seller can access only their own data.</li>
        <li>Developer accounts are protected with multi-factor authentication, and secrets are never stored in source code.</li>
      </ul>
    ),
  },
  {
    id: "retention",
    title: "6. Retention and deletion",
    body: (
      <>
        <p>
          When you disconnect a Shopify or eBay store, we revoke
          SmartSell&apos;s access and delete its tokens, so we can no longer
          read from or write to that store. Products and orders already synced
          from Shopify or eBay are kept so your history and reports stay
          complete, until you ask us to delete them. Amazon data will be
          handled differently: when a seller disconnects Amazon, we will
          revoke access and delete their Amazon data (see section 7).
        </p>
        <p>
          When eBay tells us that a user has closed their eBay account, we
          automatically and permanently delete the data we hold for that eBay
          account, including its products.
        </p>
        <p>
          You can ask us to delete your SmartSell account or any of your data
          at any time by emailing us; we will delete it and confirm by email.
        </p>
      </>
    ),
  },
  {
    id: "amazon",
    title: "7. Amazon data (in development)",
    body: (
      <ul>
        <li>When Amazon support launches, sellers will connect through Amazon&apos;s official authorization. We will access only listings, prices, inventory, order status and financial summaries for the seller&apos;s own business.</li>
        <li>We will not request or store Amazon buyer personal information, such as names, addresses, phone numbers or emails.</li>
        <li>Amazon refresh tokens will be encrypted before they are stored.</li>
        <li>When a seller disconnects Amazon, we will revoke access and delete their Amazon data.</li>
        <li>Amazon data is never sold or shared, and each seller sees only their own data.</li>
      </ul>
    ),
  },
  {
    id: "your-rights",
    title: "8. Your choices",
    body: (
      <ul>
        <li>Disconnect any marketplace from your dashboard at any time.</li>
        <li>You can also revoke SmartSell&apos;s access from your Shopify admin or your eBay account settings.</li>
        <li>Request a copy of your data, or its deletion, by contacting us.</li>
      </ul>
    ),
  },
  {
    id: "changes",
    title: "9. Changes to this policy",
    body: (
      <p>
        If we change this policy, we will update the date at the top of this
        page. Significant changes will be shared with sellers by email.
      </p>
    ),
  },
  {
    id: "contact",
    title: "10. Contact",
    body: (
      <p>
        Questions about privacy or your data? Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white text-slate-800">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
        <header className="mb-10 border-b border-slate-200 pb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-indigo-600">
            Legal
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>
        </header>

        {/* Quick links to each section */}
        <nav aria-label="Sections" className="mb-12 rounded-xl bg-slate-50 p-5">
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-slate-600 hover:text-indigo-600">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-10">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="mb-3 text-xl font-semibold text-slate-900">{s.title}</h2>
              <div className="space-y-3 leading-relaxed [&_a]:text-indigo-600 [&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
                {s.body}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-16 border-t border-slate-200 pt-6 text-sm text-slate-500">
          <Link href="/" className="hover:text-indigo-600">
            ← Back to SmartSell
          </Link>
        </footer>
      </div>
    </main>
  );
}
