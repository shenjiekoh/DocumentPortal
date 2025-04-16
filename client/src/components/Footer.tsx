export default function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-white border-t border-gray-200">
      <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
        <p className="text-sm text-gray-500 text-center">
          © {currentYear} Document Portal. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
