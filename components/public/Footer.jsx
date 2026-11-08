import Link from "next/link";
import { FaTwitter, FaGithub, FaLinkedinIn } from "react-icons/fa";

const productLinks = [
  { href: "/", label: "Home" },
  { href: "/Pricing", label: "Pricing" },
  { href: "/About", label: "About" },
  { href: "/Contact", label: "Contact" },
];

const socialLinks = [
  { href: "https://twitter.com", label: "Twitter", icon: FaTwitter },
  { href: "https://github.com", label: "GitHub", icon: FaGithub },
  { href: "https://linkedin.com", label: "LinkedIn", icon: FaLinkedinIn },
];

function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-300">
      {/* Top section: brand + nav + auth actions */}
      <div className="max-w-7xl mx-auto px-6 py-12 grid gap-10 md:grid-cols-3">
        {/* Brand */}
        <div className="space-y-3">
          <span className="text-xl font-bold text-white tracking-tight">
            SmartSell<span className="text-blue-500">™</span>
          </span>
          <p className="text-sm text-slate-400 max-w-xs">
            One dashboard to manage listings, orders, and inventory across every
            marketplace you sell on.
          </p>
          {/* Socials */}
          <div className="flex gap-4 pt-2">
            {socialLinks.map(({ href, label, icon: Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="text-slate-400 hover:text-blue-400 transition-colors duration-300"
              >
                <Icon size={18} />
              </a>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label="Footer navigation" className="md:justify-self-center">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">
            Navigate
          </h3>
          <ul className="space-y-3">
            {productLinks.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="text-sm hover:text-blue-400 transition-colors duration-300"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Auth actions */}
        <div className="md:justify-self-end w-full md:w-auto">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">
            Get started
          </h3>
          <div className="flex flex-col gap-3 max-w-xs">
            <Link
              href="/Signup"
              className="bg-blue-500 hover:bg-blue-600 px-6 py-2.5 rounded-md text-center text-sm font-medium text-white transition-colors duration-300"
            >
              Sign Up
            </Link>
            <Link
              href="/Login"
              className="border border-slate-700 hover:border-blue-500 hover:text-blue-400 px-6 py-2.5 rounded-md text-center text-sm font-medium transition-colors duration-300"
            >
              Login
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-500 text-center sm:text-left">
            © 2026 <span className="font-semibold text-slate-400">SmartSell™</span>.
            All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
