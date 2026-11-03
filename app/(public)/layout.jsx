import Navbar from "@/components/public/Navbar";
import Footer from "@/components/public/Footer";

// Layout for the marketing and sign-in pages (/, /About, /Pricing, /Login, …).
// The "(public)" folder is a route group: it does not appear in URLs.
export default function PublicLayout({ children }) {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  );
}
